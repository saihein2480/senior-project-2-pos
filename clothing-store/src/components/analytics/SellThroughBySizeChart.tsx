"use client";

import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Ruler } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import type { SizeSellThrough } from "@/lib/analytics/retailAnalytics";
import { ChartCard } from "./ChartCard";

interface SellThroughBySizeChartProps {
  data: SizeSellThrough[];
}

/**
 * Colour the sold bar by how the size is performing, so problem sizes are
 * identifiable without reading the axis.
 *
 * A very high rate is flagged amber rather than green on purpose: selling out
 * is a lost-sales signal, not a win.
 */
function rateColor(rate: number): string {
  if (rate >= 85) return "#f59e0b"; // selling out — likely under-bought
  if (rate >= 40) return "#10b981"; // healthy
  if (rate >= 20) return "#3b82f6"; // slow
  return "#9ca3af"; // barely moving
}

/**
 * Sell-through by size: units sold against units still on hand, with the
 * sell-through rate overlaid.
 *
 * Reading it: a tall sold bar over a short remaining bar with a high rate means
 * buy more of that size next time. A short sold bar under a tall remaining bar
 * is capital sitting on a rail. This is the chart that sets the size curve for
 * the next purchase order.
 */
export function SellThroughBySizeChart({ data }: SellThroughBySizeChartProps) {
  const { t } = useLanguage();

  const best = data.reduce<SizeSellThrough | null>(
    (top, row) =>
      !top || row.sellThroughRate > top.sellThroughRate ? row : top,
    null,
  );

  return (
    <ChartCard
      title={t.sellThroughBySize}
      description={t.sellThroughBySizeHint}
      badge={
        best && best.sellThroughRate > 0 ? (
          <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700">
            {t.fastestSize}: {best.size} ({best.sellThroughRate.toFixed(0)}%)
          </span>
        ) : undefined
      }
      isEmpty={data.length === 0}
      emptyIcon={<Ruler className="h-12 w-12" />}
      emptyMessage={t.noSizeData}
      footnote={t.sellThroughBySizeFootnote}
    >
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="size" tick={{ fontSize: 12 }} stroke="#6b7280" />
          <YAxis
            yAxisId="left"
            tick={{ fontSize: 12 }}
            stroke="#6b7280"
            allowDecimals={false}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            domain={[0, 100]}
            tick={{ fontSize: 12 }}
            stroke="#8b5cf6"
            tickFormatter={(value: number) => `${value}%`}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#fff",
              border: "1px solid #e5e7eb",
              borderRadius: "8px",
            }}
            formatter={(value: number | undefined, name?: string) => {
              if (value === undefined) return "N/A";
              if (name === t.sellThroughRate) {
                return [`${value.toFixed(1)}%`, name];
              }
              return [`${value} ${t.units}`, name ?? ""];
            }}
          />
          <Legend />
          <Bar
            yAxisId="left"
            dataKey="unitsSold"
            stackId="stock"
            name={t.unitsSold}
            barSize={28}
          >
            {data.map((row) => (
              <Cell key={row.size} fill={rateColor(row.sellThroughRate)} />
            ))}
          </Bar>
          <Bar
            yAxisId="left"
            dataKey="unitsRemaining"
            stackId="stock"
            fill="#e5e7eb"
            name={t.unitsRemaining}
            barSize={28}
            radius={[4, 4, 0, 0]}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="sellThroughRate"
            stroke="#8b5cf6"
            strokeWidth={2}
            dot={{ fill: "#8b5cf6", r: 3 }}
            name={t.sellThroughRate}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
