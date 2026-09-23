"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Coins } from "lucide-react";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useLanguage } from "@/contexts/LanguageContext";
import type {
  PointsLiability,
  RedemptionFunnel,
} from "@/lib/analytics/retailAnalytics";
import { ChartCard } from "./ChartCard";

interface LoyaltyLiabilityPanelProps {
  funnel: RedemptionFunnel;
  liability: PointsLiability;
}

/**
 * Outstanding loyalty obligation and coupon breakage.
 *
 * Two things worth an owner's attention that nothing else in the app shows:
 *
 * 1. Unredeemed points are a debt. The discount has been promised and simply
 *    not claimed yet, so a large balance is a future margin hit rather than a
 *    marketing success.
 * 2. Breakage — coupons issued and left to expire — is the opposite. It flatters
 *    the cost figures while signalling the rewards are not compelling enough, or
 *    that the validity window is too short to be usable.
 */
export function LoyaltyLiabilityPanel({
  funnel,
  liability,
}: LoyaltyLiabilityPanelProps) {
  const { formatPrice } = useCurrency();
  const { t } = useLanguage();

  const couponData = [
    { name: t.couponsUsed, value: funnel.couponsUsed, fill: "#10b981" },
    { name: t.couponsActive, value: funnel.couponsActive, fill: "#8b5cf6" },
    { name: t.couponsExpired, value: funnel.couponsExpired, fill: "#ef4444" },
  ];

  const isEmpty = funnel.couponsIssued === 0 && funnel.pointsOutstanding === 0;

  return (
    <ChartCard
      title={t.loyaltyLiability}
      description={t.loyaltyLiabilityHint}
      badge={
        funnel.couponsIssued > 0 ? (
          <span
            className={`text-xs font-medium px-2.5 py-1 rounded-full ${
              funnel.breakageRate > 50
                ? "bg-amber-50 text-amber-700"
                : "bg-gray-100 text-gray-600"
            }`}
          >
            {t.breakageRate}: {funnel.breakageRate.toFixed(0)}%
          </span>
        ) : undefined
      }
      isEmpty={isEmpty}
      emptyIcon={<Coins className="h-12 w-12" />}
      emptyMessage={t.noLoyaltyActivity}
      footnote={t.loyaltyLiabilityFootnote}
    >
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        <div className="rounded-xl border border-purple-200 bg-purple-50/70 px-3 py-2">
          <p className="text-[11px] font-medium text-purple-700">
            {t.pointsOutstanding}
          </p>
          <p className="text-lg font-semibold text-gray-900 mt-0.5">
            {funnel.pointsOutstanding}
          </p>
          <p className="text-[11px] text-gray-500">
            {funnel.enrolledMembers} {t.members.toLowerCase()}
          </p>
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2">
          <p className="text-[11px] font-medium text-amber-700">
            {t.estimatedLiability}
          </p>
          <p className="text-lg font-semibold text-gray-900 mt-0.5">
            {formatPrice(liability.estimatedLiability)}
          </p>
          <p className="text-[11px] text-gray-500">
            {liability.rewardsRedeemable} {t.rewardsRedeemable}
            {liability.isEstimate ? ` · ${t.estimated}` : ""}
          </p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-gray-50/70 px-3 py-2">
          <p className="text-[11px] font-medium text-gray-600">
            {t.redemptionRate}
          </p>
          <p className="text-lg font-semibold text-gray-900 mt-0.5">
            {funnel.redemptionRate.toFixed(0)}%
          </p>
          <p className="text-[11px] text-gray-500">
            {funnel.couponsUsed} / {funnel.couponsIssued} {t.coupons}
          </p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-gray-50/70 px-3 py-2">
          <p className="text-[11px] font-medium text-gray-600">
            {t.pointsEarnedLifetime}
          </p>
          <p className="text-lg font-semibold text-gray-900 mt-0.5">
            {funnel.pointsEarnedLifetime}
          </p>
          <p className="text-[11px] text-gray-500">
            {funnel.couponsIssued} {t.couponsIssued.toLowerCase()}
          </p>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={couponData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="#6b7280" />
          <YAxis
            tick={{ fontSize: 12 }}
            stroke="#6b7280"
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#fff",
              border: "1px solid #e5e7eb",
              borderRadius: "8px",
            }}
            formatter={(value: number | undefined) =>
              value !== undefined ? [`${value} ${t.coupons}`, ""] : "N/A"
            }
          />
          <Bar dataKey="value" radius={[4, 4, 0, 0]} barSize={48}>
            {couponData.map((row) => (
              <Cell key={row.name} fill={row.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
