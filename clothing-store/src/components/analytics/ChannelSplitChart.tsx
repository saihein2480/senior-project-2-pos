"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Store } from "lucide-react";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useLanguage } from "@/contexts/LanguageContext";
import type { ChannelSplitPoint } from "@/lib/analytics/retailAnalytics";
import { ChartCard } from "./ChartCard";
import { timeAxisProps } from "./timeAxis";

interface ChannelSplitChartProps {
  data: ChannelSplitPoint[];
}

/**
 * Till revenue against storefront revenue over time, with the online share.
 *
 * Reading it: the dashed share line is the strategic number. A rising share
 * says the storefront is earning its keep and warrants more attention; a flat
 * one near zero says the investment is not converting, regardless of how much
 * total revenue is growing.
 */
export function ChannelSplitChart({ data }: ChannelSplitChartProps) {
  const { formatPrice } = useCurrency();
  const { t } = useLanguage();

  const totals = data.reduce(
    (acc, row) => ({ pos: acc.pos + row.pos, online: acc.online + row.online }),
    { pos: 0, online: 0 },
  );

  const combined = totals.pos + totals.online;
  const onlineShare = combined > 0 ? (totals.online / combined) * 100 : 0;

  return (
    <ChartCard
      title={t.salesChannelSplit}
      description={t.salesChannelSplitHint}
      badge={
        combined > 0 ? (
          <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-cyan-50 text-cyan-700">
            {t.onlineShare}: {onlineShare.toFixed(1)}%
          </span>
        ) : undefined
      }
      isEmpty={combined === 0}
      emptyIcon={<Store className="h-12 w-12" />}
      emptyMessage={t.noRevenueData}
      footnote={t.salesChannelSplitFootnote}
    >
      <ResponsiveContainer width="100%" height={320}>
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 8 }}>
          <defs>
            <linearGradient id="colorPos" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#0891b2" stopOpacity={0.8} />
              <stop offset="95%" stopColor="#0891b2" stopOpacity={0.1} />
            </linearGradient>
            <linearGradient id="colorOnline" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.8} />
              <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.1} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="date" {...timeAxisProps(data.length)} />
          <YAxis yAxisId="left" tick={{ fontSize: 12 }} stroke="#6b7280" />
          <YAxis
            yAxisId="right"
            orientation="right"
            domain={[0, 100]}
            tick={{ fontSize: 12 }}
            stroke="#f59e0b"
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
              if (name === t.onlineShare) {
                return [`${value.toFixed(1)}%`, name];
              }
              return [formatPrice(value), name ?? ""];
            }}
          />
          <Legend />
          <Area
            yAxisId="left"
            type="monotone"
            dataKey="pos"
            stackId="channel"
            stroke="#0891b2"
            fillOpacity={1}
            fill="url(#colorPos)"
            name={t.inStoreSales}
          />
          <Area
            yAxisId="left"
            type="monotone"
            dataKey="online"
            stackId="channel"
            stroke="#8b5cf6"
            fillOpacity={1}
            fill="url(#colorOnline)"
            name={t.onlineSales}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="onlineShare"
            stroke="#f59e0b"
            strokeWidth={2}
            strokeDasharray="4 4"
            dot={false}
            name={t.onlineShare}
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
