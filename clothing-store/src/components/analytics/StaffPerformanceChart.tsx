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
import { UserCog } from "lucide-react";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useLanguage } from "@/contexts/LanguageContext";
import type { StaffPerformance } from "@/lib/analytics/retailAnalytics";
import { ChartCard } from "./ChartCard";

interface StaffPerformanceChartProps {
  data: StaffPerformance[];
}

/**
 * Revenue per operator with the discount rate they authorised overlaid.
 *
 * The discount line is the point. Discount authorisation is one of the two
 * routine ways margin leaves a till (the other being refunds, in the table
 * below), and it is only interpretable next to volume — a high rate on high
 * revenue may be good selling, the same rate on low revenue is worth asking
 * about. Showing both together avoids accusing the best salesperson of abuse.
 */
export function StaffPerformanceChart({ data }: StaffPerformanceChartProps) {
  const { formatPrice } = useCurrency();
  const { t } = useLanguage();

  const attributed = data.filter((row) => !row.isUnattributed);
  const unattributed = data.find((row) => row.isUnattributed);
  const hasAttribution = attributed.length > 0;

  return (
    <ChartCard
      title={t.staffPerformance}
      description={t.staffPerformanceHint}
      badge={
        unattributed ? (
          <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-amber-50 text-amber-700">
            {unattributed.orders} {t.unattributedSales}
          </span>
        ) : undefined
      }
      isEmpty={!hasAttribution}
      emptyIcon={<UserCog className="h-12 w-12" />}
      emptyMessage={t.noStaffAttribution}
      footnote={t.staffPerformanceFootnote}
    >
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 11 }}
            stroke="#6b7280"
            interval={0}
          />
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
              if (name === t.discountRate || name === t.refundRate) {
                return [`${value.toFixed(1)}%`, name];
              }
              return [formatPrice(value), name ?? ""];
            }}
          />
          <Legend />
          <Bar
            yAxisId="left"
            dataKey="revenue"
            name={t.netSales}
            barSize={30}
            radius={[4, 4, 0, 0]}
          >
            {data.map((row) => (
              <Cell
                key={row.name}
                fill={row.isUnattributed ? "#d1d5db" : "#3b82f6"}
              />
            ))}
          </Bar>
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="discountRate"
            stroke="#f59e0b"
            strokeWidth={2}
            dot={{ fill: "#f59e0b", r: 3 }}
            name={t.discountRate}
          />
        </ComposedChart>
      </ResponsiveContainer>

      <div className="overflow-x-auto mt-4">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="text-left text-gray-500 border-b border-gray-200">
              <th className="py-2 pr-4 font-medium">{t.soldBy}</th>
              <th className="py-2 pr-4 font-medium text-right">{t.orders}</th>
              <th className="py-2 pr-4 font-medium text-right">
                {t.averageBasket}
              </th>
              <th className="py-2 pr-4 font-medium text-right">{t.profit}</th>
              <th className="py-2 pr-4 font-medium text-right">
                {t.discountGiven}
              </th>
              <th className="py-2 font-medium text-right">{t.refundRate}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data.map((row) => (
              <tr
                key={row.name}
                className={row.isUnattributed ? "text-gray-400" : "text-gray-700"}
              >
                <td className="py-2 pr-4 font-medium">{row.name}</td>
                <td className="py-2 pr-4 text-right">{row.orders}</td>
                <td className="py-2 pr-4 text-right">
                  {formatPrice(row.averageBasket)}
                </td>
                <td className="py-2 pr-4 text-right">
                  {formatPrice(row.profit)}
                </td>
                <td className="py-2 pr-4 text-right">
                  {formatPrice(row.discountGiven)} (
                  {row.discountRate.toFixed(1)}%)
                </td>
                <td className="py-2 text-right">
                  {row.refundRate.toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {unattributed && (
        <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mt-3">
          {t.unattributedNotice.replace(
            "{count}",
            String(unattributed.orders),
          )}
        </p>
      )}
    </ChartCard>
  );
}
