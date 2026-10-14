import Highcharts from "highcharts";
import HighchartsReact from "highcharts-react-official";
import { useMemo, useState } from "react";

import { distributionOptions, type DistributionGroup } from "../../charts/dashboardCharts";
import { useChartCurrency } from "../../hooks/useChartCurrency";
import { useTheme } from "../../hooks/useTheme";
import type { Distribution } from "../../types";

interface DistributionPieChartProps {
  title: string;
  distribution: Distribution;
  /** Controlled grouping - omit both to let the chart manage it on its own. */
  groupBy?: DistributionGroup;
  onGroupByChange?: (groupBy: DistributionGroup) => void;
}

export function DistributionPieChart({ title, distribution, groupBy: controlled, onGroupByChange }: DistributionPieChartProps) {
  const { theme } = useTheme();
  const { convert, format } = useChartCurrency();
  const [uncontrolled, setUncontrolled] = useState<DistributionGroup>("by_source");
  const groupBy = controlled ?? uncontrolled;
  const setGroupBy = onGroupByChange ?? setUncontrolled;

  const items = distribution[groupBy];

  const options = useMemo(
    () => distributionOptions(title, items, groupBy, { theme, convert, format }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [title, items, groupBy, theme, convert, format]
  );

  const hasData = items.some((i) => parseFloat(i.total) !== 0);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">{title}</h3>
        <div className="flex overflow-hidden rounded-lg border border-neutral-300 text-xs dark:border-neutral-700">
          <button
            onClick={() => setGroupBy("by_source")}
            className={`px-2 py-1 ${
              groupBy === "by_source"
                ? "bg-cartuga-600 text-white"
                : "text-neutral-600 dark:text-neutral-300"
            }`}
          >
            Fonte
          </button>
          <button
            onClick={() => setGroupBy("by_type")}
            className={`px-2 py-1 ${
              groupBy === "by_type" ? "bg-cartuga-600 text-white" : "text-neutral-600 dark:text-neutral-300"
            }`}
          >
            Tipo
          </button>
        </div>
      </div>
      {hasData ? (
        <HighchartsReact highcharts={Highcharts} options={options} />
      ) : (
        <p className="py-10 text-center text-sm text-neutral-400 dark:text-neutral-500">Sem dados neste período.</p>
      )}
    </div>
  );
}
