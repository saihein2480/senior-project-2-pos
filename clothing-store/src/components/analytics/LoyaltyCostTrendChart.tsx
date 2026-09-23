"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Gift } from "lucide-react";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useLanguage } from "@/contexts/LanguageContext";
import type { LoyaltyCostPoint } from "@/lib/analytics/retailAnalytics";
import { ChartCard } from "./ChartCard";
import { barSize, timeAxisProps } from "./timeAxis";

interface LoyaltyCostTrendChartProps {
  data: LoyaltyCostPoint[];
  /** Cost-rate level above which the programme is judged too generous. */
  warningRate?: number;
}

/**
 * Coupon cost against the member revenue it bought.
 *
 * Reading it: the dashed rate line is the programme's take on member revenue.
 * A reference band marks the level above which reward tiers are priced too
 * generously for a clothing margin — crossing it persistently means raising
 * `pointsRequired` or lowering `discountValue`, not selling harder.
 */
export function LoyaltyCostTrendChart({
  data,
  warningRate = 5,
}: LoyaltyCostTrendChartProps) {
  const { formatPrice } = useCurrency();
  const { t } = useLanguage();

  const totals = data.reduce(
    (acc, row) => ({
      cost: acc.cost + row.loyaltyCost,
      revenue: acc.revenue + row.memberRevenue,
      redemptions: acc.redemptions + row.redemptions,
    }),
    { cost: 0, revenue: 0, redemptions: 0 },
  );

  const overallRate =
    totals.revenue > 0 ? (totals.cost / totals.revenue) * 100 : 0;
  const hasActivity = totals.cost > 0 || totals.revenue > 0;

  return (
    <ChartCard
      title={t.loyaltyCostTrend}
      description={t.loyaltyCostTrendHint}
      badge={
        hasActivity ? (
          <span
            className={`text-xs font-medium px-2.5 py-1 rounded-full ${
              overallRate > warningRate
                ? "bg-red-50 text-red-700"
                : "bg-emerald-50 text-emerald-700"
            }`}
          >
            {t.loyaltyCostRate}: {overallRate.toFixed(1)}%
          </span>
        ) : undefined
      }
      isEmpty={!hasActivity}
      emptyIcon={<Gift className="h-12 w-12" />}
      emptyMessage={t.noLoyaltyActivity}
      footnote={t.loyaltyCostTrendFootnote}
    >
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="date" {...timeAxisProps(data.length)} />
          <YAxis yAxisId="left" tick={{ fontSize: 12 }} stroke="#6b7280" />
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fontSize: 12 }}
            stroke="#ef4444"
            tickFormatter={(value: number) => `${value.toFixed(0)}%`}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#fff",
              border: "1px solid #e5e7eb",
              borderRadius: "8px",
            }}
            formatter={(value: number | undefined, name?: string) => {
              if (value === undefined) return "N/A";
              if (name === t.loyaltyCostRate) {
                return [`${value.toFixed(1)}%`, name];
              }
              return [formatPrice(value), name ?? ""];
            }}
          />
          <Legend />
          <ReferenceLine
            yAxisId="right"
            y={warningRate}
            stroke="#ef4444"
            strokeDasharray="2 4"
            label={{
              value: `${warningRate}%`,
              position: "right",
              fontSize: 10,
              fill: "#ef4444",
            }}
          />
          <Bar
            yAxisId="left"
            dataKey="memberRevenue"
            fill="#c4b5fd"
            name={t.memberRevenue}
            barSize={barSize(data.length, 16)}
            radius={[3, 3, 0, 0]}
          />
          <Bar
            yAxisId="left"
            dataKey="loyaltyCost"
            fill="#7c3aed"
            name={t.loyaltyCost}
            barSize={barSize(data.length, 16)}
            radius={[3, 3, 0, 0]}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="costRate"
            stroke="#ef4444"
            strokeWidth={2}
            strokeDasharray="4 4"
            dot={false}
            name={t.loyaltyCostRate}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
