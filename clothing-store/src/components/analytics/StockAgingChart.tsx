"use client";

import {
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { PackageX } from "lucide-react";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useLanguage } from "@/contexts/LanguageContext";
import type {
  StockAging,
  StockAgingSummary,
  StockHealth,
} from "@/lib/analytics/retailAnalytics";
import { ChartCard } from "./ChartCard";

interface StockAgingChartProps {
  data: StockAging[];
  summary: StockAgingSummary;
}

const HEALTH_COLORS: Record<StockHealth, string> = {
  new: "#3b82f6",
  healthy: "#10b981",
  slow: "#f59e0b",
  dead: "#ef4444",
};

/**
 * Inventory aging: how long each line has been on sale against how much of it
 * has sold, sized by the cash still tied up in it.
 *
 * Reading it: bottom-right is the problem quadrant — old, barely sold, and the
 * bigger the bubble the more money is trapped. Those are the markdown
 * candidates. In apparel this is usually the largest recoverable sum in the
 * business, and nothing else in the app surfaces it.
 */
export function StockAgingChart({ data, summary }: StockAgingChartProps) {
  const { formatPrice } = useCurrency();
  const { t } = useLanguage();

  const healthLabels: Record<StockHealth, string> = {
    new: t.stockHealthNew,
    healthy: t.stockHealthHealthy,
    slow: t.stockHealthSlow,
    dead: t.stockHealthDead,
  };

  const points = data.map((row) => ({
    ...row,
    // Scatter needs a positive z for every point or the bubble collapses.
    bubble: Math.max(1, row.capitalTied),
  }));

  return (
    <ChartCard
      title={t.inventoryAging}
      description={t.inventoryAgingHint}
      badge={
        summary.deadCapitalTied > 0 ? (
          <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-red-50 text-red-700">
            {t.deadStockCapital}: {formatPrice(summary.deadCapitalTied)}
          </span>
        ) : undefined
      }
      isEmpty={points.length === 0}
      emptyIcon={<PackageX className="h-12 w-12" />}
      emptyMessage={t.noInventoryData}
      footnote={t.inventoryAgingFootnote}
    >
      <ResponsiveContainer width="100%" height={300}>
        <ScatterChart margin={{ top: 10, right: 16, bottom: 24, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            type="number"
            dataKey="daysSinceRelease"
            name={t.daysOnSale}
            tick={{ fontSize: 12 }}
            stroke="#6b7280"
            label={{
              value: t.daysOnSale,
              position: "insideBottom",
              offset: -12,
              fontSize: 11,
              fill: "#6b7280",
            }}
          />
          <YAxis
            type="number"
            dataKey="sellThroughRate"
            name={t.sellThroughRate}
            domain={[0, 100]}
            tick={{ fontSize: 12 }}
            stroke="#6b7280"
            tickFormatter={(value: number) => `${value}%`}
          />
          <ZAxis type="number" dataKey="bubble" range={[40, 420]} />
          <Tooltip
            contentStyle={{
              backgroundColor: "#fff",
              border: "1px solid #e5e7eb",
              borderRadius: "8px",
            }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0].payload as StockAging;
              return (
                <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-3 text-xs">
                  <p className="font-semibold text-gray-900 mb-1">{row.name}</p>
                  <p className="text-gray-500 mb-2">{row.category}</p>
                  <p className="text-gray-700">
                    {t.daysOnSale}: {row.daysSinceRelease}
                  </p>
                  <p className="text-gray-700">
                    {t.sellThroughRate}: {row.sellThroughRate.toFixed(1)}%
                  </p>
                  <p className="text-gray-700">
                    {t.unitsSold}: {row.unitsSold} · {t.unitsRemaining}:{" "}
                    {row.unitsRemaining}
                  </p>
                  <p className="text-gray-900 font-medium mt-1">
                    {t.capitalTied}: {formatPrice(row.capitalTied)}
                  </p>
                  <p
                    className="mt-1 font-medium"
                    style={{ color: HEALTH_COLORS[row.health] }}
                  >
                    {healthLabels[row.health]}
                  </p>
                </div>
              );
            }}
          />
          <Scatter data={points} fillOpacity={0.7}>
            {points.map((row) => (
              <Cell key={row.id} fill={HEALTH_COLORS[row.health]} />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>

      {/* Bucket summary doubles as the scatter's legend. */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
        {summary.buckets.map((bucket) => (
          <div
            key={bucket.health}
            className="rounded-xl border border-gray-200 bg-gray-50/70 px-3 py-2"
          >
            <div className="flex items-center gap-1.5">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: HEALTH_COLORS[bucket.health] }}
              />
              <span className="text-[11px] font-medium text-gray-600">
                {healthLabels[bucket.health]}
              </span>
            </div>
            <p className="text-sm font-semibold text-gray-900 mt-0.5">
              {formatPrice(bucket.capitalTied)}
            </p>
            <p className="text-[11px] text-gray-500">
              {bucket.lines} {t.lines} · {bucket.units} {t.units}
            </p>
          </div>
        ))}
      </div>
    </ChartCard>
  );
}
