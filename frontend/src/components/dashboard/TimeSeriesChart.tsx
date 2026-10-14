import Highcharts from "highcharts";
import HighchartsReact from "highcharts-react-official";
import { useEffect, useMemo } from "react";

import { timeSeriesOptions } from "../../charts/dashboardCharts";
import { useChartWindow, type ChartWindowSource } from "../../hooks/useChartWindow";
import { useChartCurrency } from "../../hooks/useChartCurrency";
import { useTheme } from "../../hooks/useTheme";
import { getDashboardSeries } from "../../services/dashboardApi";
import type { MonthPoint } from "../../types";
import { ChartWindowHeader } from "../ChartWindowHeader";

interface TimeSeriesChartProps {
  source: ChartWindowSource<MonthPoint[]>;
  selected: { year: number; month: number } | null;
  onSelectMonth: (year: number, month: number) => void;
  /** Reports the first month currently shown (see toMonthIndex) - lets the page know
   * what this chart displays, e.g. for the PDF export. */
  onWindowChange?: (start: number) => void;
}

export function TimeSeriesChart({ source, selected, onSelectMonth, onWindowChange }: TimeSeriesChartProps) {
  const { nav, data: points, isLoading, isError } = useChartWindow({
    queryKey: ["dashboard", "series"],
    fetchWindow: getDashboardSeries,
    ...source,
  });
  const { theme } = useTheme();
  const { convert, format } = useChartCurrency();

  useEffect(() => {
    onWindowChange?.(nav.start);
  }, [nav.start, onWindowChange]);

  const options = useMemo(
    () => timeSeriesOptions(points, { theme, convert, format, selected, onSelectMonth }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [points, theme, convert, format, selected]
  );

  return (
    <div>
      <ChartWindowHeader
        title={<h3 className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">Entradas e saídas por mês</h3>}
        hint="Clique em um mês para ver o detalhe"
        nav={nav}
        isLoading={isLoading}
        isError={isError}
      />
      <HighchartsReact highcharts={Highcharts} options={options} />
    </div>
  );
}
