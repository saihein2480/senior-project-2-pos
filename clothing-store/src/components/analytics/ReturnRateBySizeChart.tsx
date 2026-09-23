"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Undo2 } from "lucide-react";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useLanguage } from "@/contexts/LanguageContext";
import type { SizeReturnRate } from "@/lib/analytics/retailAnalytics";
import { ChartCard } from "./ChartCard";

interface ReturnRateBySizeChartProps {
  data: SizeReturnRate[];
}

/**
 * Return rate per size, against the overall average.
 *
 * Reading it: returns concentrated in one or two sizes point at a fit or
 * sizing-chart problem, which is cheap to fix. Returns spread evenly across
 * every size point at quality or product expectation, which is a different
 * problem entirely. One blended return rate cannot tell those apart, which is
 * the reason to cut it by size.
 */
export function ReturnRateBySizeChart({ data }: ReturnRateBySizeChartProps) {
  const { formatPrice } = useCurrency();
  const { t } = useLanguage();

  const totalSold = data.reduce((sum, row) => sum + row.unitsSold, 0);
  const totalReturned = data.reduce((sum, row) => sum + row.unitsReturned, 0);
  const averageRate = totalSold > 0 ? (totalReturned / totalSold) * 100 : 0;

  // A size only reads as an outlier relative to the shop's own baseline, so the
  // threshold is derived rather than a fixed percentage.
  const outlierThreshold = Math.max(averageRate * 1.5, averageRate + 5);

  const hasReturns = totalReturned > 0;

  return (
    <ChartCard
      title={t.returnRateBySize}
      description={t.returnRateBySizeHint}
      badge={
        hasReturns ? (
          <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-gray-100 text-gray-600">
            {t.averageReturnRate}: {averageRate.toFixed(1)}%
          </span>
        ) : undefined
      }
      isEmpty={!hasReturns}
      emptyIcon={<Undo2 className="h-12 w-12" />}
      emptyMessage={t.noReturnData}
      footnote={t.returnRateBySizeFootnote}
    >
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="size" tick={{ fontSize: 12 }} stroke="#6b7280" />
          <YAxis
            tick={{ fontSize: 12 }}
            stroke="#6b7280"
            tickFormatter={(value: number) => `${value}%`}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#fff",
              border: "1px solid #e5e7eb",
              borderRadius: "8px",
            }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0].payload as SizeReturnRate;
              return (
                <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-3 text-xs">
                  <p className="font-semibold text-gray-900 mb-1">
                    {t.size} {row.size}
                  </p>
                  <p className="text-gray-700">
                    {t.returnRate}: {row.returnRate.toFixed(1)}%
                  </p>
                  <p className="text-gray-700">
                    {row.unitsReturned} / {row.unitsSold} {t.units}
                  </p>
                  <p className="text-gray-900 font-medium mt-1">
                    {t.refundValue}: {formatPrice(row.refundValue)}
                  </p>
                </div>
              );
            }}
          />
          <Legend />
          <ReferenceLine
            y={averageRate}
            stroke="#6b7280"
            strokeDasharray="4 4"
            label={{
              value: t.average,
              position: "right",
              fontSize: 10,
              fill: "#6b7280",
            }}
          />
          <Bar dataKey="returnRate" name={t.returnRate} radius={[4, 4, 0, 0]}>
            {data.map((row) => (
              <Cell
                key={row.size}
                fill={
                  row.returnRate > outlierThreshold && row.returnRate > 0
                    ? "#ef4444"
                    : "#f59e0b"
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
