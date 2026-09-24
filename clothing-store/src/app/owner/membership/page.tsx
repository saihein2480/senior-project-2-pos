"use client";

import { useState, useEffect } from "react";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { usePermissions } from "@/hooks/usePermissions";
import { Sidebar } from "@/components/ui/Sidebar";
import { TopNavBar } from "@/components/ui/TopNavBar";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Gift, Search, User, TrendingUp, AlertCircle, Tag } from "lucide-react";
import { Customer } from "@/types/customer";
import { LoyaltyService } from "@/services/loyaltyService";
import { resolveCouponPackages } from "@/services/settingsService";
import { useCurrency } from "@/contexts/CurrencyContext";

// Programme-level analytics (membership profitability, loyalty cost vs member
// revenue, points liability and breakage) now live on the owner dashboard at
// /owner/dashboard, next to the rest of the retail analytics. This page is for
// managing individual members and their rewards.

interface AvailablePackage {
  id: string;
  name: string;
  pointsRequired: number;
  discountType: "percentage" | "fixed";
  discountValue: number;
  validityDays: number;
  affordable: boolean;
  pointsShort: number;
}

interface LoyaltySummary {
  currentPoints: number;
  totalPointsEarned: number;
  activeCoupons: any[];
  pointsHistory: any[];
  pointsUntilNextCoupon: number;
  couponPackages: AvailablePackage[];
  reservedPoints: number;
  availablePoints: number;
}

function MembershipPageContent() {
  const permissions = usePermissions();
  const { formatPrice } = useCurrency();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isCartModalOpen, setIsCartModalOpen] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  
  const [searchTerm, setSearchTerm] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [loyaltySummary, setLoyaltySummary] = useState<LoyaltySummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(false);
  const [loyaltySettings, setLoyaltySettings] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [redeemingPackageId, setRedeemingPackageId] = useState<string | null>(null);
  const [redeemError, setRedeemError] = useState<string | null>(null);

  // Load loyalty settings
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await LoyaltyService.getLoyaltySettings();
        setLoyaltySettings(settings);
      } catch (error) {
        console.error("Error loading loyalty settings:", error);
      }
    };
    loadSettings();
  }, []);

  // Load customers
  useEffect(() => {
    const loadCustomers = async () => {
      setIsLoadingCustomers(true);
      try {
        const response = await fetch("/api/customers");
        const result = await response.json();
        
        if (result.success && result.data) {
          // Show everyone enrolled in the programme, including members the owner
          // just activated who have not earned any points yet, plus anyone with
          // historic points from before membership was tracked.
          const loyaltyCustomers = result.data.filter(
            (c: Customer) =>
              c.isMember ||
              (c.loyaltyPoints && c.loyaltyPoints > 0) ||
              (c.totalPointsEarned && c.totalPointsEarned > 0),
          );
          setCustomers(loyaltyCustomers);
        }
      } catch (error) {
        console.error("Error loading customers:", error);
      } finally {
        setIsLoadingCustomers(false);
      }
    };
    loadCustomers();
  }, []);

  // Load loyalty summary for selected customer
  const loadLoyaltySummary = async (customerId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await LoyaltyService.getLoyaltySummary(customerId);
      if (result.success && result.data) {
        setLoyaltySummary(result.data);
      } else {
        setError(result.error || "Failed to load loyalty data");
      }
    } catch (error) {
      console.error("Error loading loyalty summary:", error);
      setError("Failed to load loyalty data");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectCustomer = (customer: Customer) => {
    setSelectedCustomer(customer);
    setRedeemError(null);
    loadLoyaltySummary(customer.uid);
  };

  /**
   * Redeem a reward package for the currently selected customer. Points are
   * still deducted when the coupon is used, so this only hands them the coupon.
   */
  const handleRedeemForCustomer = async (packageId: string) => {
    if (!selectedCustomer) return;

    // Doc: "Redeem Coupons (Admin)" - Owner + Manager only.
    if (!permissions.canRedeemCouponsAdmin) {
      setRedeemError("You do not have permission to redeem coupons.");
      return;
    }

    setRedeemingPackageId(packageId);
    setRedeemError(null);

    try {
      const result = await LoyaltyService.redeemPackage({
        customerId: selectedCustomer.uid,
        packageId,
      });

      if (!result.success) {
        setRedeemError(result.error || "Failed to redeem this reward");
        return;
      }

      await loadLoyaltySummary(selectedCustomer.uid);
    } catch (err) {
      console.error("Error redeeming for customer:", err);
      setRedeemError("An error occurred. Please try again.");
    } finally {
      setRedeemingPackageId(null);
    }
  };

  const couponTiers = resolveCouponPackages(loyaltySettings);

  const filteredCustomers = customers.filter((customer) => {
    const searchLower = searchTerm.toLowerCase();
    return (
      customer.displayName?.toLowerCase().includes(searchLower) ||
      customer.email?.toLowerCase().includes(searchLower) ||
      customer.phone?.toLowerCase().includes(searchLower)
    );
  });

  const formatDate = (date: any) => {
    if (!date) return "N/A";
    try {
      const d = date.toDate ? date.toDate() : new Date(date);
      return d.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return "N/A";
    }
  };

  return (
    <div className="flex h-screen bg-gradient-to-b from-gray-50 to-white">
      {/* Desktop Sidebar */}
      <div className="hidden lg:block">
        <Sidebar
          activeItem="membership"
          onItemClick={() => {}}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          isCartModalOpen={isCartModalOpen}
        />
      </div>

      {/* Mobile Sidebar */}
      <Sidebar
        activeItem="membership"
        onItemClick={() => {}}
        isMobileOpen={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        isCartModalOpen={isCartModalOpen}
        className="lg:hidden"
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        <TopNavBar
          onCartModalStateChange={setIsCartModalOpen}
          onMenuToggle={() => setIsMobileSidebarOpen(true)}
        />

        <main className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="max-w-7xl mx-auto">
            {/* Header */}
            <div className="mb-8">
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-gray-900">
                Membership & Loyalty
              </h1>
              <p className="mt-2 text-sm text-gray-500">
                Manage customer loyalty points, rewards, and membership benefits
              </p>
            </div>

            {/* Loyalty Program Status */}
            {loyaltySettings && (
              <div className="mb-6 bg-white rounded-2xl shadow-sm border border-rose-100 p-5">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                        Loyalty Program
                      </span>
                      {loyaltySettings.enabled ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-rose-500 to-pink-500 px-3 py-1 text-xs font-semibold text-white shadow-sm">
                          <span className="h-1.5 w-1.5 rounded-full bg-white" />
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-500">
                          <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />
                          Inactive
                        </span>
                      )}
                    </div>
                    {loyaltySettings.enabled && (
                      <p className="text-sm text-gray-600 mt-2">
                        Earn {loyaltySettings.pointsPerPurchase} point per purchase ≥ {formatPrice(loyaltySettings.minimumSpendAmount)}
                        {couponTiers.length > 0 && (
                          <>
                            {" • "}
                            {couponTiers
                              .map(
                                (tier) =>
                                  `${tier.pointsRequired} pts = ${
                                    tier.discountType === "percentage"
                                      ? `${tier.discountValue}%`
                                      : formatPrice(tier.discountValue)
                                  } off`,
                              )
                              .join(" • ")}
                          </>
                        )}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => window.location.href = '/owner/settings'}
                    className="shrink-0 rounded-full border-2 border-rose-200 bg-white px-5 py-2 text-sm font-semibold text-rose-600 transition-all hover:border-rose-300 hover:bg-rose-50"
                  >
                    Configure
                  </button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Customer List */}
              <div className="lg:col-span-1">
                <div className="bg-white rounded-2xl shadow-sm border border-rose-100 overflow-hidden">
                  <div className="bg-gradient-to-r from-rose-50 to-pink-50 border-b border-rose-100 px-6 py-4">
                    <h2 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-rose-500 to-pink-500">
                      Loyalty Members
                    </h2>
                    <p className="text-sm text-gray-600 mt-1">
                      {customers.length} member{customers.length !== 1 ? 's' : ''}
                    </p>
                  </div>

                  {/* Search */}
                  <div className="p-4 border-b border-rose-100">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 z-10" />
                      <Input
                        type="text"
                        placeholder="Search members..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10 rounded-full"
                      />
                    </div>
                  </div>

                  {/* Customer List */}
                  <div className="overflow-y-auto max-h-[600px]">
                    {isLoadingCustomers ? (
                      <div className="flex items-center justify-center py-12">
                        <span className="h-9 w-9 animate-spin rounded-full border-[3px] border-rose-200 border-t-rose-500" />
                      </div>
                    ) : filteredCustomers.length === 0 ? (
                      <div className="text-center py-12 px-6">
                        <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-rose-50 to-pink-50">
                          <Gift className="h-7 w-7 text-rose-400" />
                        </span>
                        <p className="font-semibold text-gray-900">No loyalty members yet</p>
                        <p className="text-sm text-gray-500 mt-1">
                          Activate membership from the Customers page, or wait for
                          customers to join from the storefront
                        </p>
                      </div>
                    ) : (
                      <div className="divide-y divide-rose-100/70">
                        {filteredCustomers.map((customer) => (
                          <button
                            key={customer.uid}
                            onClick={() => handleSelectCustomer(customer)}
                            className={`w-full text-left px-6 py-4 transition-colors hover:bg-rose-50/60 ${
                              selectedCustomer?.uid === customer.uid ? 'bg-rose-50/80 border-l-4 border-rose-500' : ''
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div className="flex-shrink-0">
                                {customer.customerImage ? (
                                  <img
                                    src={customer.customerImage}
                                    alt={customer.displayName || customer.email}
                                    className="h-10 w-10 rounded-full object-cover ring-2 ring-rose-100"
                                  />
                                ) : (
                                  <div className="h-10 w-10 rounded-full bg-gradient-to-br from-rose-500 to-pink-500 flex items-center justify-center shadow-sm shadow-rose-500/30">
                                    <User className="h-5 w-5 text-white" />
                                  </div>
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-gray-900 truncate">
                                  {customer.displayName || "No Name"}
                                </p>
                                <p className="text-xs text-gray-500 truncate">{customer.email}</p>
                              </div>
                              <div className="flex flex-col items-end gap-1">
                                <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-rose-50 to-pink-50 px-2.5 py-1 text-rose-600">
                                  <Gift className="h-3.5 w-3.5" />
                                  <span className="text-sm font-bold">
                                    {customer.loyaltyPoints || 0}
                                  </span>
                                </span>
                                {customer.activeCouponsCount && customer.activeCouponsCount > 0 && (
                                  <span className="text-xs font-semibold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full">
                                    {customer.activeCouponsCount} coupon{customer.activeCouponsCount !== 1 ? 's' : ''}
                                  </span>
                                )}
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Customer Loyalty Details */}
              <div className="lg:col-span-2">
                {!selectedCustomer ? (
                  <div className="bg-white rounded-2xl shadow-sm border border-rose-100 p-12">
                    <div className="text-center">
                      <span className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-rose-50 to-pink-50">
                        <Gift className="h-8 w-8 text-rose-400" />
                      </span>
                      <h3 className="text-xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-rose-500 to-pink-500 mb-2">
                        Select a Member
                      </h3>
                      <p className="text-gray-500">
                        Choose a customer from the list to view their loyalty details
                      </p>
                    </div>
                  </div>
                ) : isLoading ? (
                  <div className="bg-white rounded-2xl shadow-sm border border-rose-100 p-12 text-center">
                    <span className="mx-auto block h-9 w-9 animate-spin rounded-full border-[3px] border-rose-200 border-t-rose-500" />
                    <p className="text-sm font-medium text-gray-500 mt-4">
                      Loading loyalty data...
                    </p>
                  </div>
                ) : error ? (
                  <div className="bg-white rounded-2xl shadow-sm border border-rose-100 p-12">
                    <div className="text-center">
                      <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-50">
                        <AlertCircle className="h-7 w-7 text-red-500" />
                      </span>
                      <p className="text-red-600">{error}</p>
                    </div>
                  </div>
                ) : loyaltySummary ? (
                  <div className="space-y-6">
                    {/* Customer Header */}
                    <div className="bg-white rounded-2xl shadow-sm border border-rose-100 p-6">
                      <div className="flex items-center gap-4">
                        {selectedCustomer.customerImage ? (
                          <img
                            src={selectedCustomer.customerImage}
                            alt={selectedCustomer.displayName || selectedCustomer.email}
                            className="h-16 w-16 rounded-full object-cover ring-4 ring-rose-100"
                          />
                        ) : (
                          <div className="h-16 w-16 rounded-full bg-gradient-to-br from-rose-500 to-pink-500 flex items-center justify-center ring-4 ring-rose-100 shadow-md shadow-rose-500/25">
                            <User className="h-8 w-8 text-white" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <h2 className="text-xl md:text-2xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-rose-500 to-pink-500">
                            {selectedCustomer.displayName || "No Name"}
                          </h2>
                          <p className="text-sm text-gray-600 mt-1 truncate">{selectedCustomer.email}</p>
                          {selectedCustomer.phone && (
                            <p className="text-sm text-gray-500">{selectedCustomer.phone}</p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Points Summary Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* Total balance */}
                      <div className="bg-white rounded-2xl shadow-sm p-5 border border-rose-100 transition-shadow hover:shadow-md">
                        <div className="flex items-center gap-3">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-rose-50 to-pink-50">
                            <Gift className="h-5 w-5 text-rose-500" />
                          </span>
                          <div className="min-w-0">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                              Total Points
                            </p>
                            <p className="text-2xl font-bold text-gray-900">
                              {loyaltySummary.currentPoints}
                            </p>
                          </div>
                        </div>
                        <p className="text-xs text-gray-500 mt-3">
                          {loyaltySummary.totalPointsEarned} earned lifetime
                        </p>
                      </div>

                      {/* Points not already promised to a coupon */}
                      <div className="bg-white rounded-2xl shadow-sm p-5 border border-rose-100 transition-shadow hover:shadow-md">
                        <div className="flex items-center gap-3">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-rose-50 to-pink-50">
                            <TrendingUp className="h-5 w-5 text-rose-500" />
                          </span>
                          <div className="min-w-0">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                              Points for Redeem
                            </p>
                            <p className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-rose-500 to-pink-500">
                              {loyaltySummary.availablePoints ??
                                loyaltySummary.currentPoints}
                            </p>
                          </div>
                        </div>
                        <p className="text-xs text-gray-500 mt-3">
                          {loyaltySummary.reservedPoints > 0
                            ? `${loyaltySummary.reservedPoints} reserved by active coupon${loyaltySummary.reservedPoints === 1 ? "" : "s"}`
                            : `${loyaltySummary.pointsUntilNextCoupon} more for the next reward`}
                        </p>
                      </div>

                      {/* Active Coupons */}
                      <div className="bg-white rounded-2xl shadow-sm p-5 border border-rose-100 transition-shadow hover:shadow-md">
                        <div className="flex items-center gap-3">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-rose-50 to-pink-50">
                            <Tag className="h-5 w-5 text-rose-500" />
                          </span>
                          <div className="min-w-0">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                              Active Coupons
                            </p>
                            <p className="text-2xl font-bold text-gray-900">
                              {loyaltySummary.activeCoupons.length}
                            </p>
                          </div>
                        </div>
                        <p className="text-xs text-gray-500 mt-3">Ready to use</p>
                      </div>
                    </div>

                    {/* Available Rewards - redeem on the customer's behalf.
                        Doc: "Redeem Coupons (Admin)" / "Issue Coupons" -
                        Owner + Manager only. */}
                    {permissions.canRedeemCouponsAdmin &&
                      (loyaltySummary.couponPackages?.length ?? 0) > 0 && (
                      <div className="bg-white rounded-2xl shadow-sm border border-rose-100 overflow-hidden">
                        <div className="bg-gradient-to-r from-rose-50 to-pink-50 border-b border-rose-100 px-6 py-4">
                          <h3 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-rose-500 to-pink-500">
                            Available Rewards
                          </h3>
                          <p className="text-sm text-gray-600 mt-1">
                            Redeem on behalf of this customer using their{" "}
                            <span className="font-semibold text-rose-600">
                              {loyaltySummary.availablePoints ??
                                loyaltySummary.currentPoints}{" "}
                              redeemable point
                              {(loyaltySummary.availablePoints ??
                                loyaltySummary.currentPoints) === 1
                                ? ""
                                : "s"}
                            </span>
                            .
                          </p>
                        </div>

                        {redeemError && (
                          <div className="mx-6 mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
                            <p className="text-sm text-red-700">{redeemError}</p>
                          </div>
                        )}

                        <div className="p-6 grid sm:grid-cols-2 gap-4">
                          {loyaltySummary.couponPackages.map((pkg) => (
                            <div
                              key={pkg.id}
                              className={`rounded-2xl border p-4 flex flex-col transition-shadow ${
                                pkg.affordable
                                  ? "border-rose-200 bg-rose-50/60 shadow-sm hover:shadow-md"
                                  : "border-gray-200 bg-gray-50"
                              }`}
                            >
                              <div className="flex items-center justify-between mb-1">
                                <span className="font-bold text-gray-900">
                                  {pkg.name}
                                </span>
                                <span
                                  className={`px-2.5 py-0.5 text-xs font-bold rounded-full ${
                                    pkg.affordable
                                      ? "bg-gradient-to-r from-rose-500 to-pink-500 text-white"
                                      : "bg-gray-200 text-gray-700"
                                  }`}
                                >
                                  {pkg.pointsRequired} pts
                                </span>
                              </div>

                              <p className="text-lg font-semibold text-rose-600">
                                {pkg.discountType === "percentage"
                                  ? `${pkg.discountValue}% off`
                                  : `${formatPrice(pkg.discountValue)} off`}
                              </p>
                              <p className="text-xs text-gray-600 mt-1">
                                Valid {pkg.validityDays} days once redeemed
                              </p>

                              <div className="mt-3 pt-3 border-t border-rose-200/60">
                                {pkg.affordable ? (
                                  <Button
                                    onClick={() => handleRedeemForCustomer(pkg.id)}
                                    disabled={redeemingPackageId === pkg.id}
                                    className="w-full justify-center rounded-full font-semibold hover:shadow-lg"
                                  >
                                    {redeemingPackageId === pkg.id
                                      ? "Redeeming..."
                                      : "Redeem for Customer"}
                                  </Button>
                                ) : (
                                  <p className="text-sm text-gray-500 text-center">
                                    {pkg.pointsShort} more point
                                    {pkg.pointsShort === 1 ? "" : "s"} needed
                                  </p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Active Coupons */}
                    {loyaltySummary.activeCoupons.length > 0 && (
                      <div className="bg-white rounded-2xl shadow-sm border border-rose-100 overflow-hidden">
                        <div className="bg-gradient-to-r from-rose-50 to-pink-50 border-b border-rose-100 px-6 py-4">
                          <h3 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-rose-500 to-pink-500">
                            Active Coupons
                          </h3>
                        </div>
                        <div className="p-6 grid md:grid-cols-2 gap-4">
                          {loyaltySummary.activeCoupons.map((coupon) => (
                            <div
                              key={coupon.id}
                              className="border-2 border-dashed border-rose-300 rounded-2xl p-4 bg-rose-50/60 transition-all hover:bg-rose-50"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  {coupon.packageName && (
                                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
                                      {coupon.packageName}
                                    </p>
                                  )}
                                  <p className="text-xl font-mono font-bold tracking-wider text-gray-900">
                                    {coupon.code}
                                  </p>
                                  <p className="text-sm font-semibold text-rose-600 mt-1">
                                    {coupon.discountType === 'percentage' 
                                      ? `${coupon.discountValue}% off` 
                                      : `${formatPrice(coupon.discountValue)} off`}
                                  </p>
                                  {typeof coupon.pointsCost === "number" && (
                                    <p className="text-xs text-gray-500 mt-0.5">
                                      Costs {coupon.pointsCost} point
                                      {coupon.pointsCost === 1 ? "" : "s"} when used
                                    </p>
                                  )}
                                </div>
                                <div className="text-right shrink-0">
                                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                                    Expires
                                  </p>
                                  <p className="text-sm font-semibold text-gray-900">
                                    {formatDate(coupon.expiresAt)}
                                  </p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Points History */}
                    {loyaltySummary.pointsHistory.length > 0 && (
                      <div className="bg-white rounded-2xl shadow-sm border border-rose-100 overflow-hidden">
                        <div className="bg-gradient-to-r from-rose-50 to-pink-50 border-b border-rose-100 px-6 py-4">
                          <h3 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-rose-500 to-pink-500">
                            Points History
                          </h3>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="min-w-full divide-y divide-rose-100">
                            <thead className="bg-rose-50/40">
                              <tr>
                                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-400">Date</th>
                                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-400">Points</th>
                                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-400">Amount</th>
                                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-400">Source</th>
                                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-400">Description</th>
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-rose-100/70">
                              {loyaltySummary.pointsHistory.map((history) => (
                                <tr key={history.id} className="transition-colors hover:bg-rose-50/50">
                                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                    {formatDate(history.earnedAt)}
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap">
                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-bold bg-gradient-to-r from-rose-500 to-pink-500 text-white">
                                      +{history.pointsEarned}
                                    </span>
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                                    {formatPrice(history.transactionAmount)}
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap">
                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                                      history.source === 'online' 
                                        ? 'bg-rose-50 text-rose-600' 
                                        : 'bg-gray-100 text-gray-600'
                                    }`}>
                                      {history.source.toUpperCase()}
                                    </span>
                                  </td>
                                  <td className="px-6 py-4 text-sm text-gray-600 max-w-xs truncate">
                                    {history.description}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

export default function MembershipPage() {
  return (
    <ProtectedRoute requiredRole={["owner", "manager"]}>
      <MembershipPageContent />
    </ProtectedRoute>
  );
}
