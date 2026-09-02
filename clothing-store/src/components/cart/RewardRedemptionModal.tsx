"use client";

import React from "react";
import { X, Gift, Tag } from "lucide-react";

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

function formatDiscount(
  discountType: "percentage" | "fixed",
  discountValue: number,
) {
  return discountType === "percentage"
    ? `${discountValue}% off`
    : `${discountValue} off`;
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
  if (!isOpen) return null;

  const reservedPoints = Math.max(0, currentPoints - availablePoints);

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-[100001] p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-purple-100 flex items-center justify-center">
              <Gift className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">
                Loyalty Rewards
              </h2>
              <p className="text-xs text-gray-500">{customerName}</p>
            </div>
          </div>
          <button
            title="Close"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Points summary */}
        <div className="grid grid-cols-2 divide-x divide-gray-200 border-b border-gray-200">
          <div className="p-4">
            <p className="text-xs font-medium text-gray-500">Total Points</p>
            <p className="text-2xl font-bold text-gray-900">{currentPoints}</p>
          </div>
          <div className="p-4">
            <p className="text-xs font-medium text-gray-500">
              Points for Redeem
            </p>
            <p className="text-2xl font-bold text-purple-700">
              {availablePoints}
            </p>
            {reservedPoints > 0 && (
              <p className="text-[11px] text-gray-500 mt-0.5">
                {reservedPoints} reserved by unused coupons
              </p>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-purple-600"></div>
            </div>
          ) : (
            <>
              {/* Coupons the customer already holds */}
              <div>
                <h3 className="text-sm font-bold text-gray-900 mb-2 flex items-center gap-1.5">
                  <Tag className="h-4 w-4 text-green-600" />
                  Ready to Use
                  <span className="text-xs font-medium text-gray-500">
                    ({coupons.length})
                  </span>
                </h3>

                {coupons.length === 0 ? (
                  <p className="text-sm text-gray-500">
                    No coupons yet. Redeem a reward below.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {coupons.map((coupon) => {
                      const isApplied = appliedCouponId === coupon.id;

                      return (
                        <div
                          key={coupon.id}
                          className="flex items-center justify-between gap-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2"
                        >
                          <div className="min-w-0">
                            {coupon.packageName && (
                              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                                {coupon.packageName}
                              </p>
                            )}
                            <p className="text-sm font-bold text-gray-900 truncate">
                              {coupon.code}
                            </p>
                            <p className="text-xs text-green-800">
                              {formatDiscount(
                                coupon.discountType,
                                coupon.discountValue,
                              )}
                              {typeof coupon.pointsCost === "number"
                                ? ` · uses ${coupon.pointsCost} pt${coupon.pointsCost === 1 ? "" : "s"}`
                                : ""}
                            </p>
                          </div>

                          <button
                            onClick={() => onApplyCoupon(coupon)}
                            disabled={isApplied}
                            className="shrink-0 px-3 py-1.5 rounded-md bg-purple-600 text-white text-xs font-semibold hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {isApplied ? "Applied" : "Apply to Sale"}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Reward tiers the cashier can redeem for the customer */}
              <div>
                <h3 className="text-sm font-bold text-gray-900 mb-2 flex items-center gap-1.5">
                  <Gift className="h-4 w-4 text-purple-600" />
                  Available Rewards
                  <span className="text-xs font-medium text-gray-500">
                    ({packages.filter((pkg) => pkg.affordable).length} of{" "}
                    {packages.length} redeemable)
                  </span>
                </h3>

                {packages.length === 0 ? (
                  <p className="text-sm text-gray-500">
                    No reward packages configured. Add them in Settings.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {packages.map((pkg) => (
                      <div
                        key={pkg.id}
                        className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 ${
                          pkg.affordable
                            ? "border-purple-200 bg-purple-50"
                            : "border-gray-200 bg-gray-50"
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-gray-900 truncate">
                            {pkg.name}
                          </p>
                          <p className="text-xs text-purple-800">
                            {formatDiscount(
                              pkg.discountType,
                              pkg.discountValue,
                            )}
                            {` · costs ${pkg.pointsRequired} pt${pkg.pointsRequired === 1 ? "" : "s"}`}
                          </p>
                        </div>

                        {pkg.affordable ? (
                          <button
                            onClick={() => onRedeemPackage(pkg.id)}
                            disabled={redeemingPackageId === pkg.id}
                            className="shrink-0 px-3 py-1.5 rounded-md border border-purple-500 text-purple-700 text-xs font-semibold hover:bg-purple-100 disabled:opacity-50"
                          >
                            {redeemingPackageId === pkg.id
                              ? "Redeeming..."
                              : "Redeem"}
                          </button>
                        ) : (
                          <span className="shrink-0 text-xs text-gray-500">
                            {pkg.pointsShort} more pt
                            {pkg.pointsShort === 1 ? "" : "s"}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end p-4 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
