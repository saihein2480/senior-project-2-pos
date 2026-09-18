"use client";

import { useState, useEffect } from "react";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { Sidebar } from "@/components/ui/Sidebar";
import { TopNavBar } from "@/components/ui/TopNavBar";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import {
  Gift,
  Search,
  User,
  TrendingUp,
  Award,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  AlertCircle,
  History,
  Tag,
} from "lucide-react";
import { Customer } from "@/types/customer";
import { LoyaltyService } from "@/services/loyaltyService";
import { resolveCouponPackages } from "@/services/settingsService";
import { useCurrency } from "@/contexts/CurrencyContext";

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
    <div className="flex h-screen bg-gray-50">
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
              <div className="flex items-center gap-3 mb-2">
                <div className="p-3 bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl shadow-lg">
                  <Gift className="h-8 w-8 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl sm:text-3xl font-semibold text-gray-900 tracking-tight">
                    Membership & Loyalty
                  </h1>
                  <p className="text-sm text-gray-600 mt-1">
                    Manage customer loyalty points, rewards, and membership benefits
                  </p>
                </div>
              </div>
            </div>

            {/* Loyalty Program Status */}
            {loyaltySettings && (
              <div className={`mb-6 rounded-2xl border-2 p-4 ${
                loyaltySettings.enabled 
                  ? 'bg-green-50 border-green-200' 
                  : 'bg-gray-50 border-gray-200'
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {loyaltySettings.enabled ? (
                      <CheckCircle className="h-6 w-6 text-green-600" />
                    ) : (
                      <XCircle className="h-6 w-6 text-gray-400" />
                    )}
                    <div>
                      <h3 className="font-semibold text-gray-900">
                        Loyalty Program Status: {loyaltySettings.enabled ? 'Active' : 'Inactive'}
                      </h3>
                      {loyaltySettings.enabled && (
                        <p className="text-sm text-gray-600">
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
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => window.location.href = '/owner/settings'}
                    className="text-sm"
                  >
                    Configure
                  </Button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Customer List */}
              <div className="lg:col-span-1">
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="bg-gradient-to-r from-purple-50 to-pink-50 border-b border-purple-100 px-6 py-4">
                    <h2 className="text-lg font-bold text-gray-900">Loyalty Members</h2>
                    <p className="text-sm text-gray-600 mt-1">
                      {customers.length} member{customers.length !== 1 ? 's' : ''}
                    </p>
                  </div>

                  {/* Search */}
                  <div className="p-4 border-b border-gray-100">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input
                        type="text"
                        placeholder="Search members..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>

                  {/* Customer List */}
                  <div className="overflow-y-auto max-h-[600px]">
                    {isLoadingCustomers ? (
                      <div className="flex items-center justify-center py-12">
                        <Loader2 className="h-6 w-6 animate-spin text-purple-500" />
                      </div>
                    ) : filteredCustomers.length === 0 ? (
                      <div className="text-center py-12">
                        <Gift className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                        <p className="text-gray-500">No loyalty members yet</p>
                        <p className="text-sm text-gray-400 mt-1">
                          Activate membership from the Customers page, or wait for
                          customers to join from the storefront
                        </p>
                      </div>
                    ) : (
                      <div className="divide-y divide-gray-100">
                        {filteredCustomers.map((customer) => (
                          <button
                            key={customer.uid}
                            onClick={() => handleSelectCustomer(customer)}
                            className={`w-full text-left px-6 py-4 hover:bg-purple-50 transition-colors ${
                              selectedCustomer?.uid === customer.uid ? 'bg-purple-50 border-l-4 border-purple-500' : ''
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div className="flex-shrink-0">
                                {customer.customerImage ? (
                                  <img
                                    src={customer.customerImage}
                                    alt={customer.displayName || customer.email}
                                    className="h-10 w-10 rounded-full object-cover"
                                  />
                                ) : (
                                  <div className="h-10 w-10 rounded-full bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center">
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
                              <div className="flex flex-col items-end">
                                <div className="flex items-center gap-1 text-purple-600">
                                  <Gift className="h-4 w-4" />
                                  <span className="text-sm font-bold">
                                    {customer.loyaltyPoints || 0}
                                  </span>
                                </div>
                                {customer.activeCouponsCount && customer.activeCouponsCount > 0 && (
                                  <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full mt-1">
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
                  <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12">
                    <div className="text-center">
                      <Gift className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">
                        Select a Member
                      </h3>
                      <p className="text-gray-500">
                        Choose a customer from the list to view their loyalty details
                      </p>
                    </div>
                  </div>
                ) : isLoading ? (
                  <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12">
                    <div className="flex items-center justify-center">
                      <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
                      <span className="ml-3 text-gray-600">Loading loyalty data...</span>
                    </div>
                  </div>
                ) : error ? (
                  <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12">
                    <div className="text-center">
                      <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-3" />
                      <p className="text-red-600">{error}</p>
                    </div>
                  </div>
                ) : loyaltySummary ? (
                  <div className="space-y-6">
                    {/* Customer Header */}
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                      <div className="flex items-center gap-4">
                        {selectedCustomer.customerImage ? (
                          <img
                            src={selectedCustomer.customerImage}
                            alt={selectedCustomer.displayName || selectedCustomer.email}
                            className="h-16 w-16 rounded-full object-cover border-4 border-purple-100"
                          />
                        ) : (
                          <div className="h-16 w-16 rounded-full bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center border-4 border-purple-100">
                            <User className="h-8 w-8 text-white" />
                          </div>
                        )}
                        <div className="flex-1">
                          <h2 className="text-xl font-bold text-gray-900">
                            {selectedCustomer.displayName || "No Name"}
                          </h2>
                          <p className="text-gray-600">{selectedCustomer.email}</p>
                          {selectedCustomer.phone && (
                            <p className="text-sm text-gray-500">{selectedCustomer.phone}</p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Points Summary Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* Total balance */}
                      <div className="bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl p-6 text-white shadow-lg">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium opacity-90">Total Points</span>
                          <Gift className="h-5 w-5 opacity-90" />
                        </div>
                        <p className="text-4xl font-bold">{loyaltySummary.currentPoints}</p>
                        <p className="text-sm opacity-75 mt-2">
                          {loyaltySummary.totalPointsEarned} earned lifetime
                        </p>
                      </div>

                      {/* Points not already promised to a coupon */}
                      <div className="bg-white rounded-2xl p-6 border border-purple-100 shadow-sm">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-gray-600">
                            Points for Redeem
                          </span>
                          <TrendingUp className="h-5 w-5 text-purple-500" />
                        </div>
                        <p className="text-4xl font-bold text-purple-700">
                          {loyaltySummary.availablePoints ??
                            loyaltySummary.currentPoints}
                        </p>
                        <p className="text-sm text-gray-500 mt-2">
                          {loyaltySummary.reservedPoints > 0
                            ? `${loyaltySummary.reservedPoints} reserved by active coupon${loyaltySummary.reservedPoints === 1 ? "" : "s"}`
                            : `${loyaltySummary.pointsUntilNextCoupon} more for the next reward`}
                        </p>
                      </div>

                      {/* Active Coupons */}
                      <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-gray-600">Active Coupons</span>
                          <Tag className="h-5 w-5 text-green-500" />
                        </div>
                        <p className="text-4xl font-bold text-gray-900">{loyaltySummary.activeCoupons.length}</p>
                        <p className="text-sm text-gray-500 mt-2">Ready to use</p>
                      </div>
                    </div>

                    {/* Available Rewards - owner can redeem on the customer's behalf */}
                    {(loyaltySummary.couponPackages?.length ?? 0) > 0 && (
                      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                        <div className="bg-purple-50 border-b border-purple-100 px-6 py-4">
                          <h3 className="text-lg font-bold text-gray-900">
                            Available Rewards
                          </h3>
                          <p className="text-sm text-gray-600 mt-1">
                            Redeem on behalf of this customer using their{" "}
                            <span className="font-semibold text-purple-700">
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
                              className={`rounded-xl border p-4 ${
                                pkg.affordable
                                  ? "border-purple-300 bg-purple-50"
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
                                      ? "bg-purple-500 text-white"
                                      : "bg-gray-200 text-gray-700"
                                  }`}
                                >
                                  {pkg.pointsRequired} pts
                                </span>
                              </div>

                              <p className="text-lg font-semibold text-purple-700">
                                {pkg.discountType === "percentage"
                                  ? `${pkg.discountValue}% off`
                                  : `${formatPrice(pkg.discountValue)} off`}
                              </p>
                              <p className="text-xs text-gray-600 mt-1">
                                Valid {pkg.validityDays} days once redeemed
                              </p>

                              <div className="mt-3 pt-3 border-t border-purple-200/60">
                                {pkg.affordable ? (
                                  <Button
                                    onClick={() => handleRedeemForCustomer(pkg.id)}
                                    disabled={redeemingPackageId === pkg.id}
                                    className="w-full justify-center"
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
                      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                        <div className="bg-green-50 border-b border-green-100 px-6 py-4">
                          <h3 className="text-lg font-bold text-gray-900">Active Coupons</h3>
                        </div>
                        <div className="p-6 space-y-3">
                          {loyaltySummary.activeCoupons.map((coupon) => (
                            <div
                              key={coupon.id}
                              className="border-2 border-dashed border-green-300 rounded-xl p-4 bg-green-50"
                            >
                              <div className="flex items-center justify-between">
                                <div>
                                  {coupon.packageName && (
                                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                                      {coupon.packageName}
                                    </p>
                                  )}
                                  <p className="text-lg font-bold text-gray-900">{coupon.code}</p>
                                  <p className="text-sm text-gray-600">
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
                                <div className="text-right">
                                  <p className="text-xs text-gray-500">Expires</p>
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
                      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                        <div className="bg-blue-50 border-b border-blue-100 px-6 py-4">
                          <div className="flex items-center gap-2">
                            <History className="h-5 w-5 text-blue-600" />
                            <h3 className="text-lg font-bold text-gray-900">Points History</h3>
                          </div>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase">Date</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase">Points</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase">Amount</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase">Source</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase">Description</th>
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                              {loyaltySummary.pointsHistory.map((history) => (
                                <tr key={history.id} className="hover:bg-gray-50">
                                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                    {formatDate(history.earnedAt)}
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap">
                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-bold bg-purple-100 text-purple-800">
                                      +{history.pointsEarned}
                                    </span>
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                                    {formatPrice(history.transactionAmount)}
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap">
                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                      history.source === 'online' 
                                        ? 'bg-cyan-100 text-cyan-800' 
                                        : 'bg-blue-100 text-blue-800'
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
