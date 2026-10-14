import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import type { DistributionGroup } from "../../charts/dashboardCharts";
import { useAuth } from "../../hooks/useAuth";
import { useCurrency } from "../../hooks/useCurrency";
import { useToast } from "../../hooks/useToast";
import type { Currency } from "../../types";
import { Button } from "../Button";
import { Modal } from "../Modal";
import { Spinner } from "../Spinner";
import { ConfigSection, CheckRow, MonthWindowStepper, Segmented } from "./controls";
import { DashboardReport, PAGE_HEIGHT, PAGE_WIDTH, type DashboardReportHandle } from "./DashboardReport";
import { downloadReportPdf } from "./pdf";
import {
  CHART_TITLES,
  defaultWindows,
  defaultWindowStart,
  describeConfig,
  windowBounds,
  windowSize,
  type DashboardExportConfig,
  type ReportChart,
} from "./reportModel";
import { useDashboardReportData } from "./useDashboardReportData";

interface DashboardExportModalProps {
  open: boolean;
  onClose: () => void;
  /** What the dashboard shows right now - the modal starts from exactly this. */
  initialConfig: DashboardExportConfig;
}

const PROJECTION_PRESETS = [3, 6, 12, 24];
const PAGE_GAP = 24;

const GROUP_OPTIONS: { value: DistributionGroup; label: string }[] = [
  { value: "by_source", label: "Fonte" },
  { value: "by_type", label: "Tipo" },
];
const CURRENCY_OPTIONS: { value: Currency; label: string }[] = [
  { value: "BRL", label: "BRL" },
  { value: "USD", label: "USD" },
  { value: "EUR", label: "EUR" },
];

function hasAnySection(config: DashboardExportConfig): boolean {
  const s = config.sections;
  return s.summary || s.distributions || s.monthItems || Object.values(s.charts).some(Boolean);
}

export function DashboardExportModal({ open, onClose, initialConfig }: DashboardExportModalProps) {
  const { user } = useAuth();
  const { rates } = useCurrency();
  const { showToast } = useToast();
  const [config, setConfig] = useState(initialConfig);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [generatedAt, setGeneratedAt] = useState(() => new Date());
  const reportRef = useRef<DashboardReportHandle>(null);

  // Every time the modal opens, start over from what the dashboard shows right now.
  useEffect(() => {
    if (open) {
      setConfig(initialConfig);
      setGeneratedAt(new Date());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const { data, isFetching, isError } = useDashboardReportData(config, open);
  const range = data?.dashboard.navigable_range;
  const size = windowSize(config.projectionMonths);
  const bounds = range ? windowBounds(range, size) : null;
  const description = useMemo(() => describeConfig(config, rates), [config, rates]);

  // ---- preview scaling ----
  const previewRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  const [pageCount, setPageCount] = useState(1);
  useLayoutEffect(() => {
    const el = previewRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setScale(Math.min(1, el.clientWidth / PAGE_WIDTH)));
    observer.observe(el);
    return () => observer.disconnect();
  }, [open]);
  useEffect(() => {
    setPageCount(reportRef.current?.pages().length ?? 1);
  });

  function update(patch: Partial<DashboardExportConfig>) {
    setConfig((c) => ({ ...c, ...patch }));
  }
  function setChartWindow(chart: ReportChart, start: number) {
    setConfig((c) => ({ ...c, windows: { ...c.windows, [chart]: start } }));
  }
  function setChartIncluded(chart: ReportChart, included: boolean) {
    setConfig((c) => ({ ...c, sections: { ...c.sections, charts: { ...c.sections.charts, [chart]: included } } }));
  }
  function setSection(key: "summary" | "distributions" | "monthItems", included: boolean) {
    setConfig((c) => ({ ...c, sections: { ...c.sections, [key]: included } }));
  }
  function setProjection(months: number) {
    // Same as the dashboard: a new projection length snaps every chart back to its
    // default window (the window size itself changes with it).
    update({ projectionMonths: months, windows: defaultWindows() });
  }

  async function handleGenerate() {
    const pages = reportRef.current?.pages() ?? [];
    if (pages.length === 0) return;
    setGenerating(true);
    try {
      const stamp = generatedAt.toISOString().slice(0, 10);
      await downloadReportPdf(pages, `cartuga-dashboard-${stamp}.pdf`, (done, total) => setProgress({ done, total }));
      showToast("PDF do dashboard gerado.", "success");
      onClose();
    } catch {
      showToast("Não foi possível gerar o PDF. Tente novamente.", "error");
    } finally {
      setGenerating(false);
      setProgress(null);
    }
  }

  const canGenerate = !!data && !isFetching && !generating && hasAnySection(config);

  return (
    <Modal
      open={open}
      onClose={generating ? () => undefined : onClose}
      title="Exportar dashboard em PDF"
      size="2xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={generating}>
            Cancelar
          </Button>
          <Button onClick={handleGenerate} loading={generating} disabled={!canGenerate}>
            {generating
              ? progress
                ? `Gerando página ${progress.done + 1} de ${progress.total}...`
                : "Gerando PDF..."
              : `Gerar PDF (${pageCount} ${pageCount === 1 ? "página" : "páginas"})`}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <div className="rounded-xl border border-cartuga-200 bg-cartuga-50 p-4 dark:border-cartuga-900/50 dark:bg-cartuga-900/20">
            <p className="mb-2 text-sm font-semibold text-neutral-800 dark:text-neutral-100">O que vai no PDF</p>
            <dl className="flex flex-col gap-1.5 text-xs">
              {description.map((line) => (
                <div key={line.label}>
                  <dt className="font-medium text-neutral-500 dark:text-neutral-400">{line.label}</dt>
                  <dd className="text-neutral-800 dark:text-neutral-100">{line.value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-[11px] text-neutral-500 dark:text-neutral-400">
              Começa igual ao dashboard agora. O que você mudar aqui vale só para o PDF. O relatório sai sempre no tema
              claro, para impressão.
            </p>
          </div>

          <ConfigSection title="Moeda">
            <Segmented label="Moeda" value={config.currency} options={CURRENCY_OPTIONS} onChange={(currency) => update({ currency })} />
          </ConfigSection>

          <ConfigSection title="Projeção" hint="Mudar a projeção recoloca os gráficos na janela padrão, como no dashboard.">
            <div className="flex flex-wrap items-center gap-2">
              <Segmented
                label="Meses de projeção"
                value={String(config.projectionMonths)}
                options={PROJECTION_PRESETS.map((p) => ({ value: String(p), label: `${p}m` }))}
                onChange={(v) => setProjection(Number(v))}
              />
              <label className="flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
                ou
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={config.projectionMonths}
                  onChange={(e) => {
                    const months = parseInt(e.target.value, 10);
                    if (months >= 1 && months <= 60) setProjection(months);
                  }}
                  aria-label="Meses de projeção personalizados"
                  className="w-16 rounded-lg border border-neutral-300 bg-white px-2 py-1 text-xs text-neutral-900 focus:border-cartuga-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50"
                />
                meses
              </label>
            </div>
          </ConfigSection>

          <ConfigSection title="Conteúdo">
            <CheckRow
              checked={config.sections.summary}
              onChange={(v) => setSection("summary", v)}
              label="Resumo"
              description="Os cards de saldo, totais do mês, projeção, parcelas e Cofre."
            />
            {(Object.keys(CHART_TITLES) as ReportChart[]).map((chart) => (
              <CheckRow
                key={chart}
                checked={config.sections.charts[chart]}
                onChange={(v) => setChartIncluded(chart, v)}
                label={CHART_TITLES[chart]}
                description={`${size} meses`}
              >
                {bounds && (
                  <MonthWindowStepper
                    start={config.windows[chart]}
                    size={size}
                    min={bounds.min}
                    max={bounds.max}
                    defaultStart={defaultWindowStart()}
                    onChange={(start) => setChartWindow(chart, start)}
                  />
                )}
              </CheckRow>
            ))}
            <CheckRow
              checked={config.sections.distributions}
              onChange={(v) => setSection("distributions", v)}
              label="Distribuições do mês"
              description="Pizzas de entradas e saídas do mês atual."
            >
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2 text-xs text-neutral-600 dark:text-neutral-300">
                  Entradas
                  <Segmented
                    label="Agrupar entradas por"
                    value={config.distribution.entries}
                    options={GROUP_OPTIONS}
                    onChange={(entries) => update({ distribution: { ...config.distribution, entries } })}
                  />
                </div>
                <div className="flex items-center justify-between gap-2 text-xs text-neutral-600 dark:text-neutral-300">
                  Saídas
                  <Segmented
                    label="Agrupar saídas por"
                    value={config.distribution.expenses}
                    options={GROUP_OPTIONS}
                    onChange={(expenses) => update({ distribution: { ...config.distribution, expenses } })}
                  />
                </div>
              </div>
            </CheckRow>
            <CheckRow
              checked={config.sections.monthItems}
              onChange={(v) => setSection("monthItems", v)}
              label="Lançamentos do mês"
              description="Tabelas com todas as entradas e saídas do mês atual."
            />
            {!hasAnySection(config) && (
              <p role="alert" className="text-xs text-red-600 dark:text-red-400">
                Escolha ao menos uma seção para exportar.
              </p>
            )}
            <button
              type="button"
              onClick={() => setConfig(initialConfig)}
              className="self-start text-xs text-neutral-500 underline-offset-2 hover:text-cartuga-700 hover:underline dark:text-neutral-400 dark:hover:text-cartuga-300"
            >
              Voltar à configuração atual do dashboard
            </button>
          </ConfigSection>
        </div>

        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
              Pré-visualização
            </p>
            {isFetching && data && <span className="text-xs text-neutral-400">Atualizando...</span>}
          </div>
          <div
            ref={previewRef}
            className="relative max-h-[70vh] overflow-y-auto overflow-x-hidden rounded-xl bg-neutral-200 p-0 dark:bg-neutral-800"
          >
            {isError && !data && (
              <p className="p-6 text-sm text-red-600 dark:text-red-400">Não foi possível carregar os dados do relatório.</p>
            )}
            {!data && !isError && (
              <div className="p-10">
                <Spinner label="Montando o relatório..." />
              </div>
            )}
            {data && user && (
              <div
                style={{
                  height: pageCount * (PAGE_HEIGHT + PAGE_GAP) * scale,
                  opacity: isFetching ? 0.6 : 1,
                  transition: "opacity 150ms",
                }}
              >
                <div style={{ width: PAGE_WIDTH, transform: `scale(${scale})`, transformOrigin: "top left", paddingTop: PAGE_GAP / 2 }}>
                  <DashboardReport
                    ref={reportRef}
                    config={config}
                    data={data}
                    rates={rates}
                    userName={user.name}
                    generatedAt={generatedAt}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
