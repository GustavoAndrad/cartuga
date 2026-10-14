import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { fromMonthIndex, labelOf, toMonthIndex } from "../../charts/monthWindow";
import { useToast } from "../../hooks/useToast";
import { extractErrorMessage } from "../../services/api";
import {
  downloadDataExport,
  getDataExportOptions,
  previewDataExport,
  type DataExportFormat,
  type DataExportRequest,
} from "../../services/exportsApi";
import { Button } from "../Button";
import { ErrorState } from "../ErrorState";
import { Modal } from "../Modal";
import { Spinner } from "../Spinner";
import { CheckRow, ConfigSection, Segmented } from "./controls";
import { currentMonthIndex, monthLong } from "./reportModel";

interface DataExportModalProps {
  open: boolean;
  onClose: () => void;
}

interface Selection {
  from: number;
  to: number;
  datasets: string[];
  format: DataExportFormat;
}

const DEFAULT_HISTORY = 12;
const DEFAULT_PROJECTION = 6;
const PREVIEW_DEBOUNCE_MS = 400;

const FORMAT_OPTIONS: { value: DataExportFormat; label: string }[] = [
  { value: "excel_br", label: "Excel (pt-BR)" },
  { value: "standard", label: "Padrão" },
];
const FORMAT_HINT: Record<DataExportFormat, string> = {
  excel_br: "Separador ponto e vírgula e decimal com vírgula: abre direto no Excel em português.",
  standard: "Separador vírgula e decimal com ponto: para Python, R, Google Sheets em inglês e afins.",
};

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

function toRequest(selection: Selection): DataExportRequest {
  const from = fromMonthIndex(selection.from);
  const to = fromMonthIndex(selection.to);
  return {
    from_year: from.year,
    from_month: from.month,
    to_year: to.year,
    to_month: to.month,
    datasets: selection.datasets,
    format: selection.format,
  };
}

export function DataExportModal({ open, onClose }: DataExportModalProps) {
  const { showToast } = useToast();
  const current = currentMonthIndex();

  const optionsQuery = useQuery({ queryKey: ["exports", "options"], queryFn: getDataExportOptions, enabled: open });
  const options = optionsQuery.data;
  const bounds = options
    ? {
        first: toMonthIndex(options.navigable_range.first_year, options.navigable_range.first_month),
        last: toMonthIndex(options.navigable_range.last_year, options.navigable_range.last_month),
      }
    : null;

  const [selection, setSelection] = useState<Selection | null>(null);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  // Defaults once the options arrive (and again on every reopen): the last 12
  // months, plus the same 6 projected months the dashboard shows by default.
  useEffect(() => {
    if (!open) {
      setSelection(null);
      return;
    }
    if (!options || !bounds || selection) return;
    setSelection({
      from: Math.max(bounds.first, current - DEFAULT_HISTORY),
      to: Math.min(bounds.last, current + DEFAULT_PROJECTION),
      datasets: options.datasets.map((d) => d.key),
      format: "excel_br",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, options]);

  const months = useMemo(() => {
    if (!bounds) return [];
    return Array.from({ length: bounds.last - bounds.first + 1 }, (_, i) => bounds.first + i);
  }, [bounds?.first, bounds?.last]); // eslint-disable-line react-hooks/exhaustive-deps

  const span = selection ? selection.to - selection.from + 1 : 0;
  const tooLong = !!options && span > options.max_span_months;
  const valid = !!selection && selection.datasets.length > 0 && selection.from <= selection.to && !tooLong;

  const debouncedSelection = useDebounced(selection, PREVIEW_DEBOUNCE_MS);
  const previewQuery = useQuery({
    queryKey: ["exports", "preview", debouncedSelection],
    queryFn: () => previewDataExport(toRequest(debouncedSelection!)),
    enabled: open && valid && !!debouncedSelection && debouncedSelection === selection,
    placeholderData: keepPreviousData,
  });
  const previews = previewQuery.data ?? [];
  const tab = previews.find((p) => p.key === activeTab) ?? previews[0];

  function update(patch: Partial<Selection>) {
    setSelection((s) => (s ? { ...s, ...patch } : s));
  }
  function toggleDataset(key: string, included: boolean) {
    if (!selection || !options) return;
    const keys = new Set(selection.datasets);
    if (included) keys.add(key);
    else keys.delete(key);
    // Keep the server's canonical order (= file order in the zip).
    update({ datasets: options.datasets.map((d) => d.key).filter((k) => keys.has(k)) });
  }

  const presets = bounds
    ? [
        { label: "12 meses + 6 projetados", from: Math.max(bounds.first, current - DEFAULT_HISTORY), to: Math.min(bounds.last, current + DEFAULT_PROJECTION) },
        { label: "Todo o histórico", from: bounds.first, to: current },
        { label: "Só projeção", from: Math.min(current + 1, bounds.last), to: Math.min(bounds.last, current + 12) },
        { label: "Ano atual", from: Math.max(bounds.first, fromMonthIndex(current).year * 12), to: Math.min(bounds.last, fromMonthIndex(current).year * 12 + 11) },
      ]
    : [];

  async function handleDownload() {
    if (!selection || !valid) return;
    setDownloading(true);
    try {
      const filename = await downloadDataExport(toRequest(selection));
      showToast(`Arquivo ${filename} baixado.`, "success");
      onClose();
    } catch (err) {
      showToast(extractErrorMessage(err, "Não foi possível exportar os dados."), "error");
    } finally {
      setDownloading(false);
    }
  }

  // ---- plain-language summary ----
  const realized = selection ? Math.max(0, Math.min(selection.to, current) - selection.from + 1) : 0;
  const projected = selection ? Math.max(0, selection.to - Math.max(selection.from - 1, current)) : 0;
  const totalRows = previews.reduce((sum, p) => sum + p.total_rows, 0);

  const selectClass =
    "w-full rounded-lg border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-900 focus:border-cartuga-500 focus:outline-none focus:ring-1 focus:ring-cartuga-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50";

  return (
    <Modal
      open={open}
      onClose={downloading ? () => undefined : onClose}
      title="Exportar meus dados (CSV)"
      size="2xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={downloading}>
            Cancelar
          </Button>
          <Button onClick={handleDownload} loading={downloading} disabled={!valid || downloading}>
            {downloading
              ? "Exportando..."
              : selection && selection.datasets.length > 1
                ? `Baixar ${selection.datasets.length} arquivos (.zip)`
                : "Baixar CSV"}
          </Button>
        </>
      }
    >
      {optionsQuery.isLoading && <Spinner label="Carregando opções..." />}
      {optionsQuery.isError && (
        <ErrorState message="Não foi possível carregar as opções de exportação." onRetry={() => optionsQuery.refetch()} />
      )}

      {options && selection && bounds && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
          <div className="flex flex-col gap-4">
            <div className="rounded-xl border border-cartuga-200 bg-cartuga-50 p-4 text-xs dark:border-cartuga-900/50 dark:bg-cartuga-900/20">
              <p className="mb-2 text-sm font-semibold text-neutral-800 dark:text-neutral-100">O que vai ser exportado</p>
              <dl className="flex flex-col gap-1.5">
                <div>
                  <dt className="font-medium text-neutral-500 dark:text-neutral-400">Período</dt>
                  <dd className="text-neutral-800 dark:text-neutral-100">
                    {monthLong(selection.from)} a {monthLong(selection.to)} ({span} {span === 1 ? "mês" : "meses"}
                    {realized > 0 && `: ${realized} até ${monthLong(Math.min(selection.to, current))}`}
                    {projected > 0 && `${realized > 0 ? " e" : ":"} ${projected} projetado${projected === 1 ? "" : "s"}`})
                  </dd>
                </div>
                <div>
                  <dt className="font-medium text-neutral-500 dark:text-neutral-400">Arquivos</dt>
                  <dd className="text-neutral-800 dark:text-neutral-100">
                    {selection.datasets.length === 0
                      ? "nenhum"
                      : selection.datasets.length === 1
                        ? "1 arquivo CSV"
                        : `${selection.datasets.length} arquivos CSV num .zip`}
                    {previews.length > 0 && valid && ` · ${totalRows.toLocaleString("pt-BR")} ${totalRows === 1 ? "linha" : "linhas"} no total`}
                  </dd>
                </div>
                <div>
                  <dt className="font-medium text-neutral-500 dark:text-neutral-400">Valores</dt>
                  <dd className="text-neutral-800 dark:text-neutral-100">
                    em reais (BRL), como guardados; lançamentos em USD/EUR trazem também o valor e a moeda originais.
                  </dd>
                </div>
              </dl>
              {projected > 0 && (
                <p className="mt-3 text-[11px] text-neutral-500 dark:text-neutral-400">
                  Meses projetados repetem as regras fixas, parcelas e planejados já cadastrados: é o mesmo cálculo
                  dos gráficos do dashboard, marcado com <code>projetado = sim</code>.
                </p>
              )}
            </div>

            <ConfigSection title="Período">
              <div className="flex flex-wrap gap-1.5">
                {presets.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => update({ from: p.from, to: p.to })}
                    className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                      selection.from === p.from && selection.to === p.to
                        ? "border-cartuga-600 bg-cartuga-600 text-white"
                        : "border-neutral-300 text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs text-neutral-500 dark:text-neutral-400">
                  De
                  <select value={selection.from} onChange={(e) => update({ from: Number(e.target.value) })} className={`${selectClass} mt-1`}>
                    {months.map((m) => (
                      <option key={m} value={m}>
                        {labelOf(m)}
                        {m > current ? " (projetado)" : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs text-neutral-500 dark:text-neutral-400">
                  Até
                  <select value={selection.to} onChange={(e) => update({ to: Number(e.target.value) })} className={`${selectClass} mt-1`}>
                    {months.map((m) => (
                      <option key={m} value={m}>
                        {labelOf(m)}
                        {m > current ? " (projetado)" : ""}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                Disponível de {labelOf(bounds.first)} (primeiro registro) até {labelOf(bounds.last)}
                {options.navigable_range.last_reason === "HORIZON"
                  ? " (limite de 60 meses de projeção)."
                  : " (depois disso o saldo não muda mais)."}
              </p>
              {selection.from > selection.to && (
                <p role="alert" className="text-xs text-red-600 dark:text-red-400">
                  O mês inicial precisa ser antes do mês final.
                </p>
              )}
              {tooLong && (
                <p role="alert" className="text-xs text-red-600 dark:text-red-400">
                  O período pode ter no máximo {options.max_span_months} meses.
                </p>
              )}
            </ConfigSection>

            <ConfigSection title="Dados">
              {options.datasets.map((d) => (
                <CheckRow
                  key={d.key}
                  checked={selection.datasets.includes(d.key)}
                  onChange={(v) => toggleDataset(d.key, v)}
                  label={d.label}
                  description={d.description}
                />
              ))}
              {selection.datasets.length === 0 && (
                <p role="alert" className="text-xs text-red-600 dark:text-red-400">
                  Escolha ao menos um conjunto de dados.
                </p>
              )}
            </ConfigSection>

            <ConfigSection title="Formato" hint={FORMAT_HINT[selection.format]}>
              <Segmented label="Formato do CSV" value={selection.format} options={FORMAT_OPTIONS} onChange={(format) => update({ format })} />
            </ConfigSection>
          </div>

          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                Pré-visualização
              </p>
              {(previewQuery.isFetching || debouncedSelection !== selection) && valid && (
                <span className="text-xs text-neutral-400">Calculando...</span>
              )}
            </div>

            {!valid && (
              <p className="rounded-xl border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
                Ajuste o período e os dados para ver a prévia.
              </p>
            )}
            {valid && previewQuery.isError && (
              <ErrorState message="Não foi possível montar a prévia." onRetry={() => previewQuery.refetch()} />
            )}
            {valid && !previewQuery.data && !previewQuery.isError && <Spinner label="Montando a prévia..." />}

            {valid && tab && (
              <div className={`flex flex-col gap-2 transition-opacity ${previewQuery.isFetching ? "opacity-60" : ""}`}>
                <div role="tablist" className="flex flex-wrap gap-1 border-b border-neutral-200 dark:border-neutral-800">
                  {previews.map((p) => (
                    <button
                      key={p.key}
                      type="button"
                      role="tab"
                      aria-selected={p.key === tab.key}
                      onClick={() => setActiveTab(p.key)}
                      className={`-mb-px border-b-2 px-3 py-2 text-xs font-medium ${
                        p.key === tab.key
                          ? "border-cartuga-600 text-cartuga-700 dark:text-cartuga-300"
                          : "border-transparent text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-100"
                      }`}
                    >
                      {p.label} <span className="text-neutral-400">({p.total_rows.toLocaleString("pt-BR")})</span>
                    </button>
                  ))}
                </div>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  <code>{tab.filename}</code> ·{" "}
                  {tab.total_rows === 0
                    ? "nenhuma linha neste período"
                    : `primeiras ${tab.rows.length} de ${tab.total_rows.toLocaleString("pt-BR")} linhas`}
                </p>
                <div className="max-h-[55vh] overflow-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
                  <table className="min-w-full text-xs">
                    <thead className="sticky top-0 bg-neutral-100 dark:bg-neutral-800">
                      <tr>
                        {tab.columns.map((c) => (
                          <th key={c} className="whitespace-nowrap px-2.5 py-2 text-left font-mono font-semibold text-neutral-600 dark:text-neutral-300">
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                      {tab.rows.map((row, i) => (
                        <tr key={i}>
                          {row.map((cell, j) => (
                            <td key={j} className="max-w-[16rem] truncate whitespace-nowrap px-2.5 py-1.5 font-mono text-neutral-800 dark:text-neutral-100" title={cell}>
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
