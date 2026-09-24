"use client";

import React from "react";
import { X, Gift, Tag, Ticket, Lock, Sparkles } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

export interface RewardCoupon {
  id: string;
  code: string;
  discountType: "percentage" | "fixed";
  discountValue: number;
  pointsCost?: number;
  packageName?: string;
}

export interface RewardPackage {
  id: string;
  name: string;
  pointsRequired: number;
  discountType: "percentage" | "fixed";
  discountValue: number;
  affordable: boolean;
  pointsShort: number;
}

interface RewardRedemptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  customerName: string;
  coupons: RewardCoupon[];
  packages: RewardPackage[];
  currentPoints: number;
  availablePoints: number;
  isLoading: boolean;
  error: string | null;
  redeemingPackageId: string | null;
  appliedCouponId?: string | null;
  onApplyCoupon: (coupon: RewardCoupon) => void;
  onRedeemPackage: (packageId: string) => void;
}

/**
 * `offLabel` is passed in rather than read from context, so the value still
 * leads the translated word in both languages.
 */
function formatDiscount(
  discountType: "percentage" | "fixed",
  discountValue: number,
  offLabel: string,
) {
  return discountType === "percentage"
    ? `${discountValue}% ${offLabel}`
    : `${discountValue} ${offLabel}`;
}

/**
 * Loyalty rewards for the customer on the current sale.
 *
 * Kept in its own dialog so the cart stays compact: the cashier only opens this
 * when they actually need to hand out or apply a reward.
 */
export function RewardRedemptionModal({
  isOpen,
  onClose,
  customerName,
  coupons,
  packages,
  currentPoints,
  availablePoints,
  isLoading,
  error,
  redeemingPackageId,
  appliedCouponId,
  onApplyCoupon,
  onRedeemPackage,
}: RewardRedemptionModalProps) {
  const { t } = useLanguage();

  if (!isOpen) return null;

  const reservedPoints = Math.max(0, currentPoints - availablePoints);

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-[100001] p-4">
      <div className="bg-gradient-to-br from-white to-pink-50 rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col border-2 border-pink-200">
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b-2 border-pink-200 bg-gradient-to-r from-rose-500 to-pink-500 rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-white flex items-center justify-center shadow-sm">
              <Gift className="h-5 w-5 text-rose-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">
                {t.loyaltyRewards}
              </h2>
              <p className="text-xs text-white/90">{customerName}</p>
            </div>
          </div>
          <button
            title={t.close}
            onClick={onClose}
            className="text-white hover:bg-white/20 rounded-full p-2 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Points summary */}
        <div className="grid grid-cols-2 divide-x divide-pink-200 border-b-2 border-pink-200 bg-white/50">
          <div className="p-4">
            <p className="text-xs font-semibold text-gray-600">
              {t.totalPoints}
            </p>
            <p className="text-2xl font-bold text-gray-900">{currentPoints}</p>
          </div>
          <div className="p-4">
            <p className="text-xs font-semibold text-gray-600">
              {t.pointsForRedeem}
            </p>
            <p className="text-2xl font-bold bg-gradient-to-r from-rose-600 to-pink-600 bg-clip-text text-transparent">
              {availablePoints}
            </p>
            {reservedPoints > 0 && (
              <p className="text-[11px] text-gray-600 mt-0.5 font-medium">
                {reservedPoints} {t.reservedByUnusedCoupons}
              </p>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {error && (
            <div className="rounded-xl border-2 border-rose-300 bg-gradient-to-r from-rose-50 to-pink-50 px-3 py-2 shadow-sm">
              <p className="text-sm text-rose-700 font-medium">{error}</p>
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-rose-500"></div>
            </div>
          ) : (
            <>
              {/* Coupons the customer already holds */}
              <div>
                <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
                  <div className="h-7 w-7 rounded-full bg-gradient-to-r from-green-400 to-emerald-400 flex items-center justify-center shadow-md">
                    <Tag className="h-4 w-4 text-white" />
                  </div>
                  <span>{t.readyToUse}</span>
                  <span className="ml-auto px-2 py-0.5 rounded-full bg-gradient-to-r from-green-100 to-emerald-100 text-xs font-bold text-green-700 border border-green-300">
                    {coupons.length} {t.coupons}
                  </span>
                </h3>

                {coupons.length === 0 ? (
                  <div className="text-center py-6 bg-white rounded-xl border-2 border-dashed border-gray-300">
                    <div className="inline-block p-3 bg-gradient-to-br from-gray-100 to-pink-100 rounded-full mb-2">
                      <Tag className="h-6 w-6 text-gray-500" />
                    </div>
                    <p className="text-sm text-gray-600 font-medium">
                      {t.noCouponsYet}
                    </p>
                    <p className="text-xs text-gray-500">
                      {t.redeemRewardToStart}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {coupons.map((coupon) => {
                      const isApplied = appliedCouponId === coupon.id;

                      return (
                        <div
                          key={coupon.id}
                          className="relative overflow-hidden rounded-2xl border-2 border-green-300 bg-white shadow-md hover:shadow-lg transition-all"
                        >
                          {/* Decorative corner ribbon */}
                          <div className="absolute top-0 right-0 w-16 h-16">
                            <div className="absolute transform rotate-45 bg-gradient-to-r from-green-400 to-emerald-400 text-white text-[10px] font-bold py-1 right-[-35px] top-[15px] w-[100px] text-center shadow">
                              {t.readyRibbon}
                            </div>
                          </div>

                          <div className="flex items-center gap-3 p-4">
                            <div className="flex-shrink-0">
                              <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-green-100 to-emerald-100 flex items-center justify-center border-2 border-green-300 shadow-sm">
                                <Ticket className="h-7 w-7 text-green-600" />
                              </div>
                            </div>

                            <div className="flex-1 min-w-0">
                              {coupon.packageName && (
                                <div className="inline-block px-2 py-0.5 bg-gradient-to-r from-green-100 to-emerald-100 rounded-full mb-1">
                                  <p className="text-[10px] font-bold uppercase tracking-wide text-green-700">
                                    {coupon.packageName}
                                  </p>
                                </div>
                              )}
                              <p className="text-base font-black text-gray-900 truncate">
                                {coupon.code}
                              </p>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-xs font-bold text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
                                  {formatDiscount(
                                    coupon.discountType,
                                    coupon.discountValue,
                                    t.offSuffix,
                                  )}
                                </span>
                                {typeof coupon.pointsCost === "number" && (
                                  <span className="text-xs text-gray-600 font-medium">
                                    • {coupon.pointsCost} {t.pointsUsedSuffix}
                                  </span>
                                )}
                              </div>
                            </div>

                            <button
                              onClick={() => onApplyCoupon(coupon)}
                              disabled={isApplied}
                              className="flex-shrink-0 px-4 py-2 rounded-xl bg-gradient-to-r from-rose-500 to-pink-500 text-white text-xs font-black hover:from-rose-600 hover:to-pink-600 disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg transition-all transform hover:scale-105"
                            >
                              {isApplied ? `${t.applied} ✓` : t.applyNow}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Reward tiers the cashier can redeem for the customer */}
              <div>
                <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
                  <div className="h-7 w-7 rounded-full bg-gradient-to-r from-purple-400 to-pink-400 flex items-center justify-center shadow-md">
                    <Gift className="h-4 w-4 text-white" />
                  </div>
                  <span>{t.availableRewards}</span>
                  <span className="ml-auto px-2 py-0.5 rounded-full bg-gradient-to-r from-purple-100 to-pink-100 text-xs font-bold text-purple-700 border border-purple-300">
                    {packages.filter((pkg) => pkg.affordable).length}/{packages.length} {t.readySuffix}
                  </span>
                </h3>

                {packages.length === 0 ? (
                  <div className="text-center py-6 bg-white rounded-xl border-2 border-dashed border-gray-300">
                    <div className="inline-block p-3 bg-gradient-to-br from-purple-100 to-pink-100 rounded-full mb-2">
                      <Gift className="h-6 w-6 text-purple-500" />
                    </div>
                    <p className="text-sm text-gray-600 font-medium">
                      {t.noRewardPackages}
                    </p>
                    <p className="text-xs text-gray-500">
                      {t.addRewardsInSettings}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {packages.map((pkg) => (
                      <div
                        key={pkg.id}
                        className={`relative overflow-hidden rounded-2xl border-2 shadow-md hover:shadow-lg transition-all ${
                          pkg.affordable
                            ? "border-purple-300 bg-white"
                            : "border-gray-300 bg-gray-50 opacity-75"
                        }`}
                      >
                        {pkg.affordable && (
                          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-purple-400 via-pink-400 to-rose-400"></div>
                        )}

                        <div className="flex items-center gap-3 p-4">
                          <div className="flex-shrink-0">
                            <div className={`h-14 w-14 rounded-2xl flex items-center justify-center border-2 shadow-sm ${
                              pkg.affordable
                                ? "bg-gradient-to-br from-purple-100 to-pink-100 border-purple-300"
                                : "bg-gray-200 border-gray-300"
                            }`}>
                              {pkg.affordable ? (
                                <Sparkles className="h-7 w-7 text-purple-600" />
                              ) : (
                                <Lock className="h-6 w-6 text-gray-500" />
                              )}
                            </div>
                          </div>

                          <div className="flex-1 min-w-0">
                            <p className="text-base font-black text-gray-900 truncate">
                              {pkg.name}
                            </p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                                pkg.affordable
                                  ? "text-purple-700 bg-purple-50"
                                  : "text-gray-600 bg-gray-100"
                              }`}>
                                {formatDiscount(
                                  pkg.discountType,
                                  pkg.discountValue,
                                  t.offSuffix,
                                )}
                              </span>
                              <span className="text-xs text-gray-600 font-medium">
                                • {pkg.pointsRequired} {t.pointsCostSuffix}
                              </span>
                            </div>
                          </div>

                          {pkg.affordable ? (
                            <button
                              onClick={() => onRedeemPackage(pkg.id)}
                              disabled={redeemingPackageId === pkg.id}
                              className="flex-shrink-0 px-4 py-2 rounded-xl border-2 border-purple-500 bg-white text-purple-700 text-xs font-black hover:bg-gradient-to-r hover:from-purple-50 hover:to-pink-50 disabled:opacity-50 shadow-sm hover:shadow-md transition-all transform hover:scale-105"
                            >
                              {redeemingPackageId === pkg.id
                                ? t.redeemingLabel
                                : t.redeem}
                            </button>
                          ) : (
                            <div className="flex-shrink-0 px-3 py-2 rounded-xl bg-gray-100 border border-gray-300">
                              <span className="text-xs text-gray-600 font-bold">
                                {pkg.pointsShort} {t.needMorePointsSuffix}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end p-4 border-t-2 border-pink-200 bg-white/50 rounded-b-2xl">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold text-gray-700 bg-white border-2 border-pink-300 rounded-lg hover:bg-pink-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-rose-500 shadow-sm transition-all"
          >
            {t.done}
          </button>
        </div>
      </div>
    </div>
  );
}
