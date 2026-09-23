"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Users } from "lucide-react";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useLanguage } from "@/contexts/LanguageContext";
import type { LoyaltyEconomics } from "@/lib/analytics/retailAnalytics";
import { ChartCard } from "./ChartCard";

interface MembershipProfitabilityChartProps {
  data: LoyaltyEconomics;
}

/**
 * Member versus non-member economics, and whether the programme pays for itself.
 *
 * Two panels because the question has two halves: the bars compare what each
 * cohort is worth per order, and the table underneath shows the loyalty cost
 * being subtracted so net margin is visible next to gross. A programme where
 * member net margin sits below non-member gross margin is giving away more than
 * the behaviour it buys is worth.
 */
export function MembershipProfitabilityChart({
  data,
}: MembershipProfitabilityChartProps) {
  const { formatPrice } = useCurrency();
  const { t } = useLanguage();

  const { member, nonMember } = data;

  const basketData = [
    { name: t.members, value: member.averageBasket, fill: "#8b5cf6" },
    { name: t.nonMembers, value: nonMember.averageBasket, fill: "#9ca3af" },
  ];

  const hasBoth = member.orders > 0 && nonMember.orders > 0;
  const isEmpty = member.orders === 0 && nonMember.orders === 0;

  // The verdict: does the member cohort still out-earn non-members once the
  // discounts handed to them are deducted?
  const verdictPositive = member.netMarginRate >= nonMember.grossMarginRate;

  const rows: Array<{ label: string; member: string; nonMember: string }> = [
    {
      label: t.customers,
      member: String(member.customers),
      nonMember: String(nonMember.customers),
    },
    {
      label: t.orders,
      member: String(member.orders),
      nonMember: String(nonMember.orders),
    },
    {
      label: t.ordersPerCustomer,
      member: member.ordersPerCustomer.toFixed(2),
      nonMember: nonMember.ordersPerCustomer.toFixed(2),
    },
    {
      label: t.averageBasket,
      member: formatPrice(member.averageBasket),
      nonMember: formatPrice(nonMember.averageBasket),
    },
    {
      label: t.grossProfit,
      member: formatPrice(member.grossProfit),
      nonMember: formatPrice(nonMember.grossProfit),
    },
    {
      label: t.loyaltyCost,
      member: `-${formatPrice(member.loyaltyCost)}`,
      nonMember: "—",
    },
    {
      label: t.netProfitAfterLoyalty,
      member: formatPrice(member.netProfit),
      nonMember: formatPrice(nonMember.netProfit),
    },
    {
      label: t.grossMarginRate,
      member: `${member.grossMarginRate.toFixed(1)}%`,
      nonMember: `${nonMember.grossMarginRate.toFixed(1)}%`,
    },
    {
      label: t.netMarginRate,
      member: `${member.netMarginRate.toFixed(1)}%`,
      nonMember: `${nonMember.grossMarginRate.toFixed(1)}%`,
    },
  ];

  return (
    <ChartCard
      title={t.membershipProfitability}
      description={t.membershipProfitabilityHint}
      badge={
        hasBoth ? (
          <span
            className={`text-xs font-medium px-2.5 py-1 rounded-full ${
              verdictPositive
                ? "bg-emerald-50 text-emerald-700"
                : "bg-amber-50 text-amber-700"
            }`}
          >
            {t.basketUplift}: {data.basketUplift >= 0 ? "+" : ""}
            {data.basketUplift.toFixed(1)}%
          </span>
        ) : undefined
      }
      isEmpty={isEmpty}
      emptyIcon={<Users className="h-12 w-12" />}
      emptyMessage={t.noMembershipData}
      footnote={t.membershipProfitabilityFootnote}
    >
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={basketData} layout="vertical">
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis type="number" tick={{ fontSize: 12 }} stroke="#6b7280" />
          <YAxis
            type="category"
            dataKey="name"
            width={110}
            tick={{ fontSize: 12 }}
            stroke="#6b7280"
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#fff",
              border: "1px solid #e5e7eb",
              borderRadius: "8px",
            }}
            formatter={(value: number | undefined) =>
              value !== undefined ? formatPrice(value) : "N/A"
            }
          />
          <Legend />
          <Bar
            dataKey="value"
            name={t.averageBasket}
            radius={[0, 4, 4, 0]}
            barSize={36}
          >
            {basketData.map((row) => (
              <Cell key={row.name} fill={row.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <div className="overflow-x-auto mt-2">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="text-gray-500 border-b border-gray-200">
              <th className="py-2 pr-4 font-medium text-left"></th>
              <th className="py-2 pr-4 font-medium text-right text-purple-700">
                {t.members}
              </th>
              <th className="py-2 font-medium text-right">{t.nonMembers}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((row) => {
              const isNet = row.label === t.netProfitAfterLoyalty;
              const isCost = row.label === t.loyaltyCost;
              return (
                <tr
                  key={row.label}
                  className={
                    isNet
                      ? "font-semibold text-gray-900"
                      : isCost
                        ? "text-red-600"
                        : "text-gray-700"
                  }
                >
                  <td className="py-2 pr-4">{row.label}</td>
                  <td className="py-2 pr-4 text-right">{row.member}</td>
                  <td className="py-2 text-right">{row.nonMember}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {data.unattributedOrders > 0 && (
        <p className="text-[11px] text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 mt-3">
          {t.walkInExcludedNotice
            .replace("{count}", String(data.unattributedOrders))
            .replace("{value}", formatPrice(data.unattributedRevenue))}
        </p>
      )}
    </ChartCard>
  );
}
