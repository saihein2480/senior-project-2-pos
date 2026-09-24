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
 * The Daily Status columns from the sales report, drawn over time.
 *
 * Shows the same four figures the owner already reads in the report table —
 * Profit, Expenses, Total Net Sale, Total Net Profit — so one mental model covers
 * both screens. This replaced a version that also plotted a net margin
 * *percentage* on a second right-hand axis: two different units on one chart
 * meant the eye could not compare any two lines, and the percentage answered a
 * question nobody had asked.
 *
 * Everything here is money on a single axis, so the bars and lines are directly
 * comparable. Total Net Profit crossing below zero is the one thing worth
 * reacting to, which is why the zero line is drawn explicitly.
 */
export function NetMarginChart({ data }: NetMarginChartProps) {
  const { formatPrice } = useCurrency();
  const { t } = useLanguage();

  const totals = data.reduce(
    (acc, row) => ({
      profit: acc.profit + row.profit,
      expense: acc.expense + row.expense,
      sales: acc.sales + row.sales,
    }),
    { profit: 0, expense: 0, sales: 0 },
  );

  const netProfit = totals.profit - totals.expense;
  const hasActivity = data.some(
    (row) => row.profit !== 0 || row.expense !== 0 || row.sales !== 0,
  );

  return (
    <ChartCard
      title={t.netMarginTrend}
      description={t.netMarginTrendHint}
      badge={
        hasActivity ? (
          <span
            className={`text-xs font-medium px-2.5 py-1 rounded-full ${
              netProfit >= 0
                ? "bg-emerald-50 text-emerald-700"
                : "bg-red-50 text-red-700"
            }`}
          >
            {t.totalNetProfit}: {formatPrice(netProfit)}
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
          {/* One axis only: every series is money, so a second scale would break
              the comparison the chart exists to make. */}
          <YAxis tick={{ fontSize: 12 }} stroke="#6b7280" />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0].payload as DailyNetMargin;
              return (
                <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-3 text-xs">
                  <p className="font-semibold text-gray-900 mb-1.5">{label}</p>
                  <p className="text-emerald-700">
                    {t.profit}: {formatPrice(row.profit)}
                  </p>
                  <p className="text-red-600">
                    {t.expenses}: {formatPrice(row.expense)}
                  </p>
                  <p className="text-blue-700">
                    {t.totalNetSales}: {formatPrice(row.netSales)}
                  </p>
                  <p
                    className={
                      row.net >= 0
                        ? "font-medium text-gray-900"
                        : "font-medium text-red-700"
                    }
                  >
                    {t.totalNetProfit}: {formatPrice(row.net)}
                  </p>
                </div>
              );
            }}
          />
          <Legend />
          <ReferenceLine y={0} stroke="#9ca3af" />
          <Bar
            dataKey="profit"
            fill="#10b981"
            name={t.profit}
            barSize={barSize(data.length, 14)}
            radius={[3, 3, 0, 0]}
          />
          <Bar
            dataKey="expense"
            fill="#f87171"
            name={t.expenses}
            barSize={barSize(data.length, 14)}
            radius={[3, 3, 0, 0]}
          />
          <Line
            type="monotone"
            dataKey="netSales"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={false}
            name={t.totalNetSales}
          />
          <Line
            type="monotone"
            dataKey="net"
            stroke="#1d4ed8"
            strokeWidth={2}
            strokeDasharray="4 4"
            dot={false}
            name={t.totalNetProfit}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
