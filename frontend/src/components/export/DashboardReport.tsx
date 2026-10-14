import Highcharts from "highcharts";
import HighchartsReact from "highcharts-react-official";
import { forwardRef, useImperativeHandle, useMemo, useRef, type ReactNode } from "react";

import logoLight from "../../assets/logo/cartuga-logo-light.svg";
import {
  balanceLineOptions,
  cumulativeBalanceOptions,
  distributionOptions,
  timeSeriesOptions,
  type ChartContext,
} from "../../charts/dashboardCharts";
import type { Currency, Entry, MonthExpenseLine } from "../../types";
import { makeCurrencyFormatter, makeDisplayFormatter } from "../../utils/currencyFormat";
import {
  CHART_TITLES,
  currentMonthIndex,
  describeConfig,
  monthLong,
  type DashboardExportConfig,
  type ReportChart,
} from "./reportModel";
import type { DashboardReportData } from "./useDashboardReportData";

/** A4 at 96 dpi - every page is captured at exactly this size. */
export const PAGE_WIDTH = 794;
export const PAGE_HEIGHT = 1123;
const PAGE_PADDING = 40;
const FOOTER_HEIGHT = 28;
const CONTENT_HEIGHT = PAGE_HEIGHT - PAGE_PADDING * 2 - FOOTER_HEIGHT;
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_PADDING * 2;

const CHART_HEIGHT = 290;
const TABLE_ROW_HEIGHT = 30;
const TABLE_HEAD_HEIGHT = 74;

const INK = { primary: "#171717", secondary: "#525252", muted: "#737373", line: "#e5e5e5", soft: "#f5f5f4" };

export interface DashboardReportHandle {
  /** The page elements, in order - what gets captured into the PDF. */
  pages: () => HTMLElement[];
}

interface DashboardReportProps {
  config: DashboardExportConfig;
  data: DashboardReportData;
  rates: Record<Currency, number>;
  userName: string;
  generatedAt: Date;
}

// ---- layout ------------------------------------------------------------------------

type Block =
  | { kind: "fixed"; height: number; node: ReactNode }
  | {
      kind: "table";
      title: string;
      rows: ReactNode[];
      header: ReactNode;
    };

/** Greedy packing: fixed blocks never split, tables split across pages by row. */
function paginate(blocks: Block[]): ReactNode[][] {
  const pages: ReactNode[][] = [[]];
  let used = 0;
  const newPage = () => {
    pages.push([]);
    used = 0;
  };

  blocks.forEach((block, blockIdx) => {
    if (block.kind === "fixed") {
      if (used > 0 && used + block.height > CONTENT_HEIGHT) newPage();
      pages[pages.length - 1].push(<div key={`b${blockIdx}`}>{block.node}</div>);
      used += block.height;
      return;
    }

    let remaining = block.rows;
    let continued = false;
    while (remaining.length > 0 || !continued) {
      if (CONTENT_HEIGHT - used < TABLE_HEAD_HEIGHT + TABLE_ROW_HEIGHT * 2) newPage();
      const fit = Math.max(1, Math.floor((CONTENT_HEIGHT - used - TABLE_HEAD_HEIGHT) / TABLE_ROW_HEIGHT));
      const chunk = remaining.slice(0, fit);
      pages[pages.length - 1].push(
        <ReportTable
          key={`t${blockIdx}-${pages.length}`}
          title={continued ? `${block.title} (continuação)` : block.title}
          header={block.header}
          rows={chunk}
        />
      );
      used += TABLE_HEAD_HEIGHT + chunk.length * TABLE_ROW_HEIGHT;
      remaining = remaining.slice(fit);
      continued = true;
    }
  });

  return pages.filter((p) => p.length > 0);
}

// ---- pieces ------------------------------------------------------------------------

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 style={{ color: INK.primary }} className="mb-3 text-[15px] font-semibold">
      {children}
    </h2>
  );
}

function ReportTable({ title, header, rows }: { title: string; header: ReactNode; rows: ReactNode[] }) {
  return (
    <div className="mb-5">
      <SectionTitle>{title}</SectionTitle>
      <table className="w-full table-fixed border-collapse text-[11px]" style={{ color: INK.primary }}>
        <thead>{header}</thead>
        <tbody>{rows}</tbody>
      </table>
    </div>
  );
}

const th = "border-b px-2 py-1.5 text-left font-semibold";
const td = "truncate border-b px-2 py-1.5";

function ReportChartBox({ title, options }: { title: string; options: Highcharts.Options }) {
  return (
    <div className="mb-6">
      <SectionTitle>{title}</SectionTitle>
      <div style={{ width: CONTENT_WIDTH }}>
        <HighchartsReact highcharts={Highcharts} options={options} />
      </div>
    </div>
  );
}

// ---- report ------------------------------------------------------------------------

export const DashboardReport = forwardRef<DashboardReportHandle, DashboardReportProps>(function DashboardReport(
  { config, data, rates, userName, generatedAt },
  ref
) {
  const pageRefs = useRef<(HTMLElement | null)[]>([]);
  useImperativeHandle(ref, () => ({
    pages: () => pageRefs.current.filter((p): p is HTMLElement => p !== null),
  }));

  const format = useMemo(() => makeCurrencyFormatter(config.currency, rates), [config.currency, rates]);
  const pages = useMemo(() => {
    const rate = rates[config.currency] ?? 1;
    const ctx: ChartContext = {
      theme: "light",
      convert: (amountBRL) => amountBRL * rate,
      format: makeDisplayFormatter(config.currency),
      print: true,
      height: CHART_HEIGHT,
    };
    const { dashboard, series, monthDetail } = data;
    const cards = dashboard.cards;
    const description = describeConfig(config, rates);
    const referenceMonth = monthLong(currentMonthIndex());
    const blocks: Block[] = [];

    blocks.push({
      kind: "fixed",
      height: 140 + description.length * 26,
      node: (
        <div className="mb-8">
          <div className="mb-5 flex items-end justify-between border-b pb-4" style={{ borderColor: INK.line }}>
            <div>
              <img src={logoLight} alt="Cartuga" style={{ height: 30 }} />
              <h1 className="mt-3 text-[22px] font-semibold" style={{ color: INK.primary }}>
                Relatório do dashboard
              </h1>
            </div>
            <div className="text-right text-[11px]" style={{ color: INK.muted }}>
              <p>Gerado em {generatedAt.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</p>
              <p>por {userName}</p>
            </div>
          </div>
          <SectionTitle>Configurações deste relatório</SectionTitle>
          <dl className="grid grid-cols-[170px_1fr] gap-x-3 text-[12px]">
            {description.map((line) => (
              <div key={line.label} className="contents">
                <dt className="border-b py-1 font-medium" style={{ color: INK.secondary, borderColor: INK.line }}>
                  {line.label}
                </dt>
                <dd className="border-b py-1" style={{ color: INK.primary, borderColor: INK.line }}>
                  {line.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ),
    });

    if (config.sections.summary) {
      const items: { label: string; value: string; negative?: boolean }[] = [
        { label: "Saldo atual", value: format(cards.current_balance), negative: parseFloat(cards.current_balance) < 0 },
        { label: `Total recebido em ${referenceMonth}`, value: format(cards.current_month_income) },
        { label: `Total gasto em ${referenceMonth}`, value: format(cards.current_month_expenses) },
        {
          label: "Saldo do mês anterior",
          value: format(cards.previous_month_balance),
          negative: parseFloat(cards.previous_month_balance) < 0,
        },
        {
          label: `Saldo projetado (${config.projectionMonths} meses)`,
          value: format(cards.projected_balance),
          negative: parseFloat(cards.projected_balance) < 0,
        },
        { label: "Comprometido com parcelas", value: format(cards.committed_installments) },
        { label: "Saldo no Cofre", value: format(cards.vault_balance) },
      ];
      blocks.push({
        kind: "fixed",
        height: 280,
        node: (
          <div className="mb-6">
            <SectionTitle>Resumo</SectionTitle>
            <div className="grid grid-cols-3 gap-3">
              {items.map((item) => (
                <div key={item.label} className="rounded-lg border p-3" style={{ borderColor: INK.line, background: INK.soft }}>
                  <p className="text-[10px] font-medium uppercase tracking-wide" style={{ color: INK.muted }}>
                    {item.label}
                  </p>
                  <p className="mt-1 text-[17px] font-semibold" style={{ color: item.negative ? "#dc2626" : INK.primary }}>
                    {item.value}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ),
      });
    }

    const builders: Record<ReportChart, (p: typeof series.timeSeries) => Highcharts.Options> = {
      timeSeries: (p) => timeSeriesOptions(p, ctx),
      balance: (p) => balanceLineOptions(p, ctx),
      cumulative: (p) => cumulativeBalanceOptions(p, ctx),
    };
    (Object.keys(CHART_TITLES) as ReportChart[]).forEach((chart) => {
      if (!config.sections.charts[chart]) return;
      blocks.push({
        kind: "fixed",
        height: CHART_HEIGHT + 60,
        node: <ReportChartBox title={CHART_TITLES[chart]} options={builders[chart](series[chart])} />,
      });
    });

    if (config.sections.distributions) {
      const pieCtx = { ...ctx, height: 270 };
      const pie = (title: string, items: typeof dashboard.entries_distribution.by_source, group: typeof config.distribution.entries) =>
        items.some((i) => parseFloat(i.total) !== 0) ? (
          <HighchartsReact highcharts={Highcharts} options={distributionOptions(title, items, group, pieCtx)} />
        ) : (
          <p className="py-16 text-center text-[12px]" style={{ color: INK.muted }}>
            Sem dados neste mês.
          </p>
        );
      blocks.push({
        kind: "fixed",
        height: 340,
        node: (
          <div className="mb-6">
            <SectionTitle>Distribuição de {referenceMonth}</SectionTitle>
            <div className="grid grid-cols-2 gap-4" style={{ width: CONTENT_WIDTH }}>
              <div>
                <p className="text-center text-[12px] font-medium" style={{ color: INK.secondary }}>
                  Entradas ({config.distribution.entries === "by_source" ? "por fonte" : "por tipo"})
                </p>
                {pie("Entradas", dashboard.entries_distribution[config.distribution.entries], config.distribution.entries)}
              </div>
              <div>
                <p className="text-center text-[12px] font-medium" style={{ color: INK.secondary }}>
                  Saídas ({config.distribution.expenses === "by_source" ? "por fonte" : "por tipo"})
                </p>
                {pie("Saídas", dashboard.expenses_distribution[config.distribution.expenses], config.distribution.expenses)}
              </div>
            </div>
          </div>
        ),
      });
    }

    if (config.sections.monthItems && monthDetail) {
      const headStyle = { color: INK.secondary, borderColor: INK.line, background: INK.soft };
      const cellStyle = { borderColor: INK.line };
      const header = (cols: string[]) => (
        <tr>
          {cols.map((c, i) => (
            <th key={c} className={th} style={{ ...headStyle, textAlign: i === cols.length - 1 ? "right" : "left" }}>
              {c}
            </th>
          ))}
        </tr>
      );
      const typeLabel = (t: string) => (t === "FIXED" ? "Fixa" : "Excepcional");
      const entryRows = [...monthDetail.entries]
        .sort((a: Entry, b: Entry) => parseFloat(b.amount) - parseFloat(a.amount))
        .map((e) => (
          <tr key={`e${e.id}`}>
            <td className={td} style={cellStyle}>{e.description}{e.is_planned ? " (planejado)" : ""}</td>
            <td className={td} style={cellStyle}>{e.source}</td>
            <td className={td} style={cellStyle}>{typeLabel(e.type)}</td>
            <td className={`${td} text-right font-medium`} style={cellStyle}>{format(e.amount)}</td>
          </tr>
        ));
      const expenseRows = [...monthDetail.expenses]
        .sort((a: MonthExpenseLine, b: MonthExpenseLine) => parseFloat(b.amount) - parseFloat(a.amount))
        .map((x, idx) => (
          <tr key={`x${idx}`}>
            <td className={td} style={cellStyle}>
              {x.description}
              {x.installment ? ` (${x.installment.installment_number}/${x.installment.total_installments})` : ""}
              {x.is_planned ? " (planejado)" : ""}
            </td>
            <td className={td} style={cellStyle}>{x.source}</td>
            <td className={td} style={cellStyle}>
              {typeLabel(x.type)} · {x.payment_method === "CREDITO" ? "Crédito" : "Conta"}
            </td>
            <td className={`${td} text-right font-medium`} style={cellStyle}>{format(x.amount)}</td>
          </tr>
        ));
      const tableHeader = header(["Descrição", "Fonte", "Tipo", "Valor"]);
      blocks.push({
        kind: "table",
        title: `Entradas de ${referenceMonth} - total ${format(monthDetail.entries_total)}`,
        header: tableHeader,
        rows: entryRows.length > 0 ? entryRows : [<tr key="none"><td colSpan={4} className={td} style={cellStyle}>Nenhuma entrada.</td></tr>],
      });
      blocks.push({
        kind: "table",
        title: `Saídas de ${referenceMonth} - total ${format(monthDetail.expenses_total)}`,
        header: tableHeader,
        rows: expenseRows.length > 0 ? expenseRows : [<tr key="none"><td colSpan={4} className={td} style={cellStyle}>Nenhuma saída.</td></tr>],
      });
    }

    return paginate(blocks);
  }, [config, data, rates, format, generatedAt, userName]);

  pageRefs.current = [];
  return (
    <div className="flex flex-col items-center gap-6">
      {pages.map((content, idx) => (
        <section
          key={idx}
          ref={(el) => {
            pageRefs.current[idx] = el;
          }}
          aria-label={`Página ${idx + 1} de ${pages.length}`}
          className="relative shrink-0 overflow-hidden shadow-md"
          style={{
            width: PAGE_WIDTH,
            height: PAGE_HEIGHT,
            padding: PAGE_PADDING,
            background: "#ffffff",
            color: INK.primary,
            fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
          }}
        >
          <div style={{ height: CONTENT_HEIGHT, overflow: "hidden" }}>{content}</div>
          <footer
            className="absolute flex justify-between text-[10px]"
            style={{ left: PAGE_PADDING, right: PAGE_PADDING, bottom: PAGE_PADDING - 8, color: INK.muted }}
          >
            <span>Cartuga · Relatório do dashboard · {monthLong(currentMonthIndex())}</span>
            <span>
              Página {idx + 1} de {pages.length}
            </span>
          </footer>
        </section>
      ))}
    </div>
  );
});
