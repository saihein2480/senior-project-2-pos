"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Tag } from "lucide-react";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useLanguage } from "@/contexts/LanguageContext";
import type { PromotedProduct } from "@/lib/analytics/retailAnalytics";
import { ChartCard } from "./ChartCard";

interface PromotionRevenueByProductChartProps {
  data: PromotedProduct[];
}

/**
 * Revenue earned per promoted product, against the discount it cost.
 *
 * Reading it: a long green bar next to a short purple one is a promotion that
 * pulled real money in cheaply, so repeat it. Bars close to equal length mean
 * most of the ticket price was given away, so the promotion is buying volume
 * rather than revenue.
 *
 * Horizontal bars because the category labels are product names, which do not
 * fit under a vertical axis without being rotated or truncated.
 */
export function PromotionRevenueByProductChart({
  data,
}: PromotionRevenueByProductChartProps) {
  const { formatPrice } = useCurrency();
  const { t } = useLanguage();

  const totalRevenue = data.reduce((sum, row) => sum + row.revenue, 0);

  // Each bar pair needs vertical room, so the chart grows with the product
  // count instead of squeezing ten products into a fixed height.
  const chartHeight = Math.max(240, data.length * 46 + 60);

  return (
    <ChartCard
      title={t.promotionRevenueByProduct}
      description={t.promotionRevenueByProductHint}
      badge={
        data.length > 0 ? (
          <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
            {formatPrice(totalRevenue)} · {data.length} {t.promotedProducts}
          </span>
        ) : undefined
      }
      isEmpty={data.length === 0}
      emptyIcon={<Tag className="h-12 w-12" />}
      emptyMessage={t.noPromotionData}
      footnote={t.promotionRevenueByProductFootnote}
    >
      <ResponsiveContainer width="100%" height={chartHeight}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 8, right: 16, bottom: 8, left: 8 }}
          barGap={2}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            type="number"
            tick={{ fontSize: 11 }}
            stroke="#6b7280"
            tickFormatter={(value: number) => `${value}`}
          />
          <YAxis
            type="category"
            dataKey="product"
            width={140}
            tick={{ fontSize: 11 }}
            stroke="#6b7280"
            interval={0}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0].payload as PromotedProduct;
              return (
                <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-3 text-xs max-w-xs">
                  <p className="font-semibold text-gray-900 mb-1">
                    {row.product}
                  </p>
                  <p className="text-gray-500 mb-2">
                    {t.promotion}: {row.promotions.join(", ")}
                  </p>
                  <p className="text-emerald-700 font-medium">
                    {t.revenueEarned}: {formatPrice(row.revenue)}
                  </p>
                  <p className="text-purple-700">
                    {t.discountGiven}: {formatPrice(row.discountGiven)}
                  </p>
                  <p className="text-gray-700 mt-1">
                    {t.discountRate}: {row.discountRate.toFixed(1)}%
                  </p>
                  <p className="text-gray-700">
                    {row.unitsSold} {t.sold}
                  </p>
                </div>
              );
            }}
          />
          <Legend />
          <Bar
            dataKey="revenue"
            name={t.revenueEarned}
            fill="#10b981"
            radius={[0, 4, 4, 0]}
            barSize={14}
          />
          <Bar
            dataKey="discountGiven"
            name={t.discountGiven}
            fill="#8b5cf6"
            radius={[0, 4, 4, 0]}
            barSize={14}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
