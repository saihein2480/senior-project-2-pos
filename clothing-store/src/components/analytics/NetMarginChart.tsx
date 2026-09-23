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
import { Wallet } from "lucide-react";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useLanguage } from "@/contexts/LanguageContext";
import type { DailyNetMargin } from "@/lib/analytics/retailAnalytics";
import { ChartCard } from "./ChartCard";
import { barSize, timeAxisProps } from "./timeAxis";

interface NetMarginChartProps {
  data: DailyNetMargin[];
}

/**
 * Gross profit against operating expenses, with what is actually left over.
 *
 * The existing dashboard charts revenue and profit but never subtracts running
 * costs, so a month can look healthy while losing money. The net line crossing
 * below zero is the single most important thing on this dashboard, which is why
 * it gets an explicit zero reference line.
 */
export function NetMarginChart({ data }: NetMarginChartProps) {
  const { formatPrice } = useCurrency();
  const { t } = useLanguage();

  const totals = data.reduce(
    (acc, row) => ({
      profit: acc.profit + row.profit,
      expense: acc.expense + row.expense,
      revenue: acc.revenue + row.revenue,
    }),
    { profit: 0, expense: 0, revenue: 0 },
  );

  const net = totals.profit - totals.expense;
  const marginRate = totals.revenue > 0 ? (net / totals.revenue) * 100 : 0;
  const hasActivity = data.some((row) => row.profit !== 0 || row.expense !== 0);

  return (
    <ChartCard
      title={t.netMarginTrend}
      description={t.netMarginTrendHint}
      badge={
        hasActivity ? (
          <span
            className={`text-xs font-medium px-2.5 py-1 rounded-full ${
              net >= 0
                ? "bg-emerald-50 text-emerald-700"
                : "bg-red-50 text-red-700"
            }`}
          >
            {t.netResult}: {formatPrice(net)} ({marginRate.toFixed(1)}%)
          </span>
        ) : undefined
      }
      isEmpty={!hasActivity}
      emptyIcon={<Wallet className="h-12 w-12" />}
      emptyMessage={t.noMarginData}
      footnote={t.netMarginTrendFootnote}
    >
      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="date" {...timeAxisProps(data.length)} />
          <YAxis yAxisId="left" tick={{ fontSize: 12 }} stroke="#6b7280" />
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fontSize: 12 }}
            stroke="#f59e0b"
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
              if (name === t.netMarginRate) {
                return [`${value.toFixed(1)}%`, name];
              }
              return [formatPrice(value), name ?? ""];
            }}
          />
          <Legend />
          <ReferenceLine yAxisId="left" y={0} stroke="#9ca3af" />
          <Bar
            yAxisId="left"
            dataKey="profit"
            fill="#10b981"
            name={t.grossProfit}
            barSize={barSize(data.length, 14)}
            radius={[3, 3, 0, 0]}
          />
          <Bar
            yAxisId="left"
            dataKey="expense"
            fill="#f87171"
            name={t.operatingExpenses}
            barSize={barSize(data.length, 14)}
            radius={[3, 3, 0, 0]}
          />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="net"
            stroke="#1d4ed8"
            strokeWidth={2}
            dot={false}
            name={t.netResult}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="netMarginRate"
            stroke="#f59e0b"
            strokeWidth={2}
            strokeDasharray="4 4"
            dot={false}
            name={t.netMarginRate}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
