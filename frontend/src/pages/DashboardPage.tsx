import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { CurrencyAmount } from "../components/CurrencyAmount";
import { CurrentMonthSection } from "../components/dashboard/CurrentMonthSection";
import { BalanceLineChart } from "../components/dashboard/BalanceLineChart";
import { DistributionPieChart } from "../components/dashboard/DistributionPieChart";
import { ExchangeRateSection } from "../components/dashboard/ExchangeRateSection";
import { MonthDetailModal } from "../components/dashboard/MonthDetailModal";
import { MonthlyBalanceChart } from "../components/dashboard/MonthlyBalanceChart";
import { ProjectionSelector } from "../components/dashboard/ProjectionSelector";
import { TimeSeriesChart } from "../components/dashboard/TimeSeriesChart";
import { DashboardCard } from "../components/DashboardCard";
import { DashboardExportModal } from "../components/export/DashboardExportModal";
import { DASHBOARD_HISTORY_MONTHS, defaultWindows, type ReportChart } from "../components/export/reportModel";
import { DeltaBadge } from "../components/DeltaBadge";
import { ErrorState } from "../components/ErrorState";
import { InfoTooltip } from "../components/InfoTooltip";
import { Spinner } from "../components/Spinner";
import { ArrowDownIcon, ArrowUpIcon, DownloadIcon, ExternalLinkIcon, VaultIcon } from "../components/table/icons";
import type { DistributionGroup } from "../charts/dashboardCharts";
import { monthFull } from "../charts/monthLabels";
import { toMonthIndex } from "../charts/monthWindow";
import type { ChartWindowSource } from "../hooks/useChartWindow";
import { useCurrency } from "../hooks/useCurrency";
import { getDashboard } from "../services/dashboardApi";
import type { MonthPoint } from "../types";

function previousMonthOf(year: number, month: number): { year: number; month: number } {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

const CARD_INFO = {
  currentBalance:
    "Saldo acumulado desde o seu primeiro registro até o fim deste mês: soma o saldo (entradas − saídas) de cada mês, começando do zero no seu primeiro dado.",
  previousMonthBalance:
    "O mesmo saldo acumulado, mas até o fim do mês passado. A diferença para o Saldo atual é exatamente o que entrou menos o que saiu neste mês.",
  currentMonthIncome:
    "Soma de todas as entradas (fixas e excepcionais) que valem para este mês. Não é acumulado: é só o valor deste mês.",
  currentMonthExpenses:
    "Soma das saídas em conta deste mês, mais as parcelas de cartão com vencimento neste mês. Não é acumulado.",
  projectedBalance:
    "Saldo acumulado projetado até o fim da janela de projeção escolhida, repetindo as entradas/saídas fixas e parcelas já cadastradas. Não é uma previsão, e sim o resultado exato se nada mudar.",
  committedInstallments:
    "Quanto ainda falta pagar em compras parceladas no cartão: a soma de todas as parcelas futuras (a partir deste mês), de todas as compras já cadastradas. Sem limite de tempo: inclui parcelas que vencem depois da janela de projeção mostrada nos gráficos.",
  vaultBalance:
    "Quanto você tem guardado no Cofre. Não faz parte do saldo acima: investimentos do zero e recortes de entradas ficam de fora ou dentro do cálculo dependendo do tipo. Veja o Cofre para o detalhe.",
};

export function DashboardPage() {
  const [projectionMonths, setProjectionMonths] = useState(6);
  const [selectedMonth, setSelectedMonth] = useState<{ year: number; month: number } | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const { currency } = useCurrency();

  // What each chart is showing right now - the PDF export starts from exactly this.
  const [chartWindows, setChartWindows] = useState<Record<ReportChart, number>>(defaultWindows);
  const [distributionGroups, setDistributionGroups] = useState<{ entries: DistributionGroup; expenses: DistributionGroup }>({
    entries: "by_source",
    expenses: "by_source",
  });
  const onTimeSeriesWindow = useCallback((start: number) => setChartWindows((w) => ({ ...w, timeSeries: start })), []);
  const onBalanceWindow = useCallback((start: number) => setChartWindows((w) => ({ ...w, balance: start })), []);
  const onCumulativeWindow = useCallback((start: number) => setChartWindows((w) => ({ ...w, cumulative: start })), []);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["dashboard", projectionMonths],
    queryFn: () => getDashboard(DASHBOARD_HISTORY_MONTHS, projectionMonths),
  });

  const exportConfig = useMemo(
    () => ({
      projectionMonths,
      windows: chartWindows,
      distribution: distributionGroups,
      currency,
      sections: {
        summary: true,
        charts: { timeSeries: true, balance: true, cumulative: true },
        distributions: true,
        monthItems: true,
      },
    }),
    [projectionMonths, chartWindows, distributionGroups, currency]
  );

  // Default window shared by the three month-by-month charts - each one then scrolls
  // on its own from here (see useChartWindow).
  const seriesSource: ChartWindowSource<MonthPoint[]> | null = useMemo(() => {
    if (!data || data.time_series.length === 0) return null;
    const first = data.time_series[0];
    return {
      defaultData: data.time_series,
      range: data.navigable_range,
      defaultStart: toMonthIndex(first.year, first.month),
      size: data.time_series.length,
    };
  }, [data]);

  const currentMonthName = data ? monthFull(data.current_month.month).toLowerCase() : "";
  const previousMonthName = data
    ? monthFull(previousMonthOf(data.current_month.year, data.current_month.month).month).toLowerCase()
    : "";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-50">Dashboard</h1>
          {data && (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              {monthFull(data.current_month.month)} de {data.current_month.year}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <ProjectionSelector months={projectionMonths} onChange={setProjectionMonths} />
          <button
            type="button"
            onClick={() => setExportOpen(true)}
            disabled={!data}
            aria-label="Exportar dashboard em PDF"
            title="Exportar dashboard em PDF"
            className="flex items-center gap-1.5 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
          >
            <DownloadIcon className="h-4 w-4" />
            <span>Exportar</span>
          </button>
        </div>
      </div>

      {isLoading && <Spinner label="Carregando dashboard..." />}
      {isError && <ErrorState message="Não foi possível carregar o dashboard." onRetry={() => refetch()} />}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <DashboardCard
              label="Saldo atual"
              value={<CurrencyAmount amount={data.cards.current_balance} colorize />}
              info={CARD_INFO.currentBalance}
              trend={
                <DeltaBadge
                  current={parseFloat(data.cards.current_balance)}
                  previous={parseFloat(data.cards.previous_month_balance)}
                  label={`vs. ${previousMonthName}`}
                />
              }
              hero
            />
            <DashboardCard
              label={`Total recebido em ${currentMonthName}`}
              value={<CurrencyAmount amount={data.cards.current_month_income} />}
              info={CARD_INFO.currentMonthIncome}
              icon={<ArrowUpIcon className="h-4 w-4 text-cartuga-600 dark:text-cartuga-400" />}
            />
            <DashboardCard
              label={`Total gasto em ${currentMonthName}`}
              value={<CurrencyAmount amount={data.cards.current_month_expenses} />}
              info={CARD_INFO.currentMonthExpenses}
              icon={<ArrowDownIcon className="h-4 w-4 text-red-500 dark:text-red-400" />}
            />
            <DashboardCard
              label={`Saldo de ${previousMonthName}`}
              value={<CurrencyAmount amount={data.cards.previous_month_balance} colorize />}
              info={CARD_INFO.previousMonthBalance}
            />
            <DashboardCard
              label="Saldo projetado"
              value={<CurrencyAmount amount={data.cards.projected_balance} colorize />}
              trend={
                <DeltaBadge
                  current={parseFloat(data.cards.projected_balance)}
                  previous={parseFloat(data.cards.current_balance)}
                  label="vs. saldo atual"
                />
              }
              hint={`Próximos ${projectionMonths} meses`}
              info={CARD_INFO.projectedBalance}
            />
            <DashboardCard
              label="Comprometido com parcelas"
              value={<CurrencyAmount amount={data.cards.committed_installments} />}
              info={CARD_INFO.committedInstallments}
            />
          </div>

          <div className="rounded-xl border border-cartuga-200 bg-cartuga-50 p-4 dark:border-cartuga-900/50 dark:bg-cartuga-900/20">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <VaultIcon className="h-5 w-5 shrink-0 text-cartuga-700 dark:text-cartuga-300" />
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                  Saldo no Cofre
                </span>
                <InfoTooltip text={CARD_INFO.vaultBalance} />
              </div>
              <CurrencyAmount
                amount={data.cards.vault_balance}
                className="text-lg font-semibold text-cartuga-700 dark:text-cartuga-300"
              />
              <Link
                to="/vault"
                className="ml-auto flex shrink-0 items-center gap-1 rounded-md border border-cartuga-300 px-2 py-1 text-[11px] font-medium text-cartuga-700 transition-colors hover:bg-cartuga-100 dark:border-cartuga-800 dark:text-cartuga-300 dark:hover:bg-cartuga-900/40"
              >
                Ir para o Cofre
                <ExternalLinkIcon className="h-3 w-3" />
              </Link>
            </div>
          </div>

          <ExchangeRateSection />

          {seriesSource && (
            <>
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <div className="rounded-xl border border-neutral-300 bg-[var(--color-surface)] p-5 dark:border-neutral-800">
                  <TimeSeriesChart
                    source={seriesSource}
                    onWindowChange={onTimeSeriesWindow}
                    selected={selectedMonth}
                    onSelectMonth={(year, month) => setSelectedMonth({ year, month })}
                  />
                </div>
                <div className="rounded-xl border border-neutral-300 bg-[var(--color-surface)] p-5 dark:border-neutral-800">
                  <BalanceLineChart
                    source={seriesSource}
                    onWindowChange={onBalanceWindow}
                    selected={selectedMonth}
                    onSelectMonth={(year, month) => setSelectedMonth({ year, month })}
                  />
                </div>
              </div>

              <div className="rounded-xl border border-neutral-300 bg-[var(--color-surface)] p-5 dark:border-neutral-800">
                <MonthlyBalanceChart
                  source={seriesSource}
                  onWindowChange={onCumulativeWindow}
                  selected={selectedMonth}
                  onSelectMonth={(year, month) => setSelectedMonth({ year, month })}
                />
              </div>
            </>
          )}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-xl border border-neutral-300 bg-[var(--color-surface)] p-5 dark:border-neutral-800">
              <DistributionPieChart
                title={`Distribuição das entradas (${currentMonthName})`}
                distribution={data.entries_distribution}
                groupBy={distributionGroups.entries}
                onGroupByChange={(entries) => setDistributionGroups((g) => ({ ...g, entries }))}
              />
            </div>
            <div className="rounded-xl border border-neutral-300 bg-[var(--color-surface)] p-5 dark:border-neutral-800">
              <DistributionPieChart
                title={`Distribuição das saídas (${currentMonthName})`}
                distribution={data.expenses_distribution}
                groupBy={distributionGroups.expenses}
                onGroupByChange={(expenses) => setDistributionGroups((g) => ({ ...g, expenses }))}
              />
            </div>
          </div>

          <CurrentMonthSection year={data.current_month.year} month={data.current_month.month} />

          <MonthDetailModal month={selectedMonth} onClose={() => setSelectedMonth(null)} />
          <DashboardExportModal open={exportOpen} onClose={() => setExportOpen(false)} initialConfig={exportConfig} />
        </>
      )}
    </div>
  );
}
