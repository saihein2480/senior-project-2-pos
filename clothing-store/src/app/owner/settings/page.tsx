"use client";

import { toast } from "react-hot-toast";
import React, { useState, useEffect } from "react";
import { Sidebar } from "@/components/ui/Sidebar";
import { TopNavBar } from "@/components/ui/TopNavBar";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Toggle } from "@/components/ui/Toggle";
import { ImageUpload } from "@/components/ui/ImageUpload";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { useAuth } from "@/contexts/AuthContext";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useSettings } from "@/contexts/SettingsContext";
import { ShopService } from "@/services/shopService";
import {
  Building2,
  Receipt,
  User,
  DollarSign,
  Store,
  Gift,
  Plus,
  Trash2,
} from "lucide-react";

type ReceiptPaperSize =
  | "44mm"
  | "57mm"
  | "58mm"
  | "69mm"
  | "76mm"
  | "78mm"
  | "80mm"
  | "82.5mm"
  | "112mm"
  | "114mm"
  | "210mm";

interface CouponPackage {
  id: string;
  name: string;
  pointsRequired: number;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  validityDays: number;
  enabled: boolean;
}

interface LoyaltySettings {
  enabled: boolean;
  minimumSpendAmount: number;
  pointsPerPurchase: number;
  couponPackages?: CouponPackage[];
  // Legacy single-coupon fields, still saved for backward compatibility.
  pointsForCoupon: number;
  couponDiscountType: 'percentage' | 'fixed';
  couponDiscountValue: number;
  couponValidityDays: number;
}

interface BusinessSettings {
  businessName: string;
  shortName: string;
  defaultCurrency: string;
  taxRate: number;
  registeredBy: string;
  registeredAt: string;
  businessLogo: string;
  showBusinessLogoOnInvoice: boolean;
  autoPrintReceiptAfterCheckout: boolean;
  invoiceFooterMessage: string;
  invoiceFooterImage: string;
  receiptPaperSize: ReceiptPaperSize;
  enableDarkMode: boolean;
  enableSoundEffects: boolean;
  currencyRate: number;
  currentBranch?: string;
  loyaltySettings?: LoyaltySettings;
}

function OwnerSettingsContent() {
  const { user } = useAuth();
  const { refreshCurrencySettings } = useCurrency();
  const { refreshSettings } = useSettings();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isCartModalOpen, setIsCartModalOpen] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [error, setError] = useState<string>("");
  const [shops, setShops] = useState<Array<{ id: string; name: string }>>([]);

  // Helper: true if there are no shops
  const noShops = shops.length === 0;

  // Main state for all settings
  const [settings, setSettings] = useState<BusinessSettings>({
    businessName: "",
    shortName: "",
    defaultCurrency: "THB",
    taxRate: 0,
    registeredBy: "",
    registeredAt: "",
    businessLogo: "",
    showBusinessLogoOnInvoice: true,
    autoPrintReceiptAfterCheckout: true,
    invoiceFooterMessage: "",
    invoiceFooterImage: "",
    receiptPaperSize: "80mm",
    enableDarkMode: false,
    enableSoundEffects: false,
    currencyRate: 0,
    currentBranch: "No Branch",
    loyaltySettings: {
      enabled: false,
      minimumSpendAmount: 500,
      pointsPerPurchase: 1,
      couponPackages: [],
      pointsForCoupon: 10,
      couponDiscountType: 'percentage',
      couponDiscountValue: 10,
      couponValidityDays: 30,
    },
  });

  // Fetch existing settings on component mount
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        setIsLoadingData(true);
        setError("");

        // Fetch settings
        const response = await fetch("/api/settings");
        const result = await response.json();

        if (result.success && result.data) {
          setSettings((prev) => ({ ...prev, ...result.data }));

          // For all users, load user-specific branch from localStorage
          if (user) {
            const userId = user.uid || user.email;
            const userBranch = localStorage.getItem(`userBranch_${userId}`);
            if (userBranch) {
              setSettings((prev) => ({ ...prev, currentBranch: userBranch }));
            }
          }
        } else {
          setError(result.error || "Failed to load settings");
        }

        // Fetch shops
        try {
          const shopsData = await ShopService.getAllShops();
          setShops(shopsData || []);
        } catch (shopError) {
          console.error("Error fetching shops:", shopError);
        }
      } catch (err) {
        console.error("Error fetching settings:", err);
        setError("Failed to load settings");
      } finally {
        setIsLoadingData(false);
      }
    };

    fetchSettings();
  }, [user]);

  // When shops change, update currentBranch logic
  useEffect(() => {
    if (shops.length === 0) {
      // No shops: set to No Branch
      setSettings((prev) => ({ ...prev, currentBranch: "No Branch" }));
    }
    // Do NOT auto-select the first shop if currentBranch is 'No Branch' and shops exist.
    // Only update currentBranch if the currentBranch is not in the shops list and is not 'No Branch'.
    else if (
      settings.currentBranch !== "No Branch" &&
      !shops.some((s) => s.name === settings.currentBranch)
    ) {
      setSettings((prev) => ({ ...prev, currentBranch: shops[0].name }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shops]);

  const currencies = [
    { code: "THB", name: "Thai Baht", symbol: "฿" },
    { code: "MMK", name: "Myanmar Kyat", symbol: "Ks" },
  ];

  // Helper function to get currency rate display
  const getCurrencyRateDisplay = () => {
    if (settings.defaultCurrency === "MMK") {
      return {
        from: "MMK",
        to: "THB",
        fromName: "Myanmar Kyat",
        toName: "Thai Baht",
        fromSymbol: "Ks",
        toSymbol: "฿",
        description: "1 Myanmar Kyat = ? Thai Baht",
      };
    } else {
      return {
        from: settings.defaultCurrency,
        to: "MMK",
        fromName:
          currencies.find((c) => c.code === settings.defaultCurrency)?.name ||
          settings.defaultCurrency,
        toName: "Myanmar Kyat",
        fromSymbol:
          currencies.find((c) => c.code === settings.defaultCurrency)?.symbol ||
          settings.defaultCurrency,
        toSymbol: "Ks",
        description: `1 ${
          currencies.find((c) => c.code === settings.defaultCurrency)?.name ||
          settings.defaultCurrency
        } = ? Myanmar Kyat`,
      };
    }
  };

  const handleInputChange = (
    field: keyof BusinessSettings,
    value: string | number | boolean,
  ) => {
    setSettings((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleLoyaltySettingChange = (
    field: keyof LoyaltySettings,
    value: string | number | boolean,
  ) => {
    setSettings((prev) => ({
      ...prev,
      loyaltySettings: {
        ...prev.loyaltySettings!,
        [field]: value,
      },
    }));
  };

  /**
   * The reward tiers the owner is editing. Owners who never configured packages
   * still have the legacy single-coupon fields, so those are surfaced as one
   * package to edit rather than being silently discarded.
   */
  const couponPackages: CouponPackage[] =
    settings.loyaltySettings?.couponPackages &&
    settings.loyaltySettings.couponPackages.length > 0
      ? settings.loyaltySettings.couponPackages
      : settings.loyaltySettings?.pointsForCoupon
        ? [
            {
              id: "legacy-default",
              name: "Reward Coupon",
              pointsRequired: settings.loyaltySettings.pointsForCoupon,
              discountType:
                settings.loyaltySettings.couponDiscountType || "percentage",
              discountValue:
                settings.loyaltySettings.couponDiscountValue || 0,
              validityDays: settings.loyaltySettings.couponValidityDays || 30,
              enabled: true,
            },
          ]
        : [];

  const setCouponPackages = (next: CouponPackage[]) => {
    setSettings((prev) => ({
      ...prev,
      loyaltySettings: {
        ...prev.loyaltySettings!,
        couponPackages: next,
        // Mirror the cheapest tier into the legacy fields so anything still
        // reading them stays consistent with what the owner configured.
        ...(next.length > 0
          ? (() => {
              const cheapest = [...next].sort(
                (a, b) => a.pointsRequired - b.pointsRequired,
              )[0];
              return {
                pointsForCoupon: cheapest.pointsRequired,
                couponDiscountType: cheapest.discountType,
                couponDiscountValue: cheapest.discountValue,
                couponValidityDays: cheapest.validityDays,
              };
            })()
          : {}),
      },
    }));
  };

  const handleAddCouponPackage = () => {
    setCouponPackages([
      ...couponPackages,
      {
        id: `pkg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name: `Package ${couponPackages.length + 1}`,
        pointsRequired: 10,
        discountType: "percentage",
        discountValue: 10,
        validityDays: 30,
        enabled: true,
      },
    ]);
  };

  const handleCouponPackageChange = (
    id: string,
    field: keyof CouponPackage,
    value: string | number | boolean,
  ) => {
    setCouponPackages(
      couponPackages.map((pkg) =>
        pkg.id === id ? { ...pkg, [field]: value } : pkg,
      ),
    );
  };

  const handleRemoveCouponPackage = (id: string) => {
    setCouponPackages(couponPackages.filter((pkg) => pkg.id !== id));
  };

  const handleSaveSettings = async () => {
    setIsLoading(true);
    setError("");

    try {
      // Save branch to localStorage for all users (user-specific)
      if (user && settings.currentBranch) {
        const userId = user.uid || user.email;
        localStorage.setItem(`userBranch_${userId}`, settings.currentBranch);
      }

      // Staff: only save branch (already done above)
      if (user?.role === "staff") {
        // Refresh settings context to reflect the new branch
        await refreshSettings();
        toast.success("Branch saved successfully!");
      }
      // Owner/Manager: save business settings
      else {
        const response = await fetch("/api/settings", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(settings),
        });

        const result = await response.json();

        if (result.success) {
          setSettings(result.data);
          // Refresh currency context to reflect the new settings
          await refreshCurrencySettings();
          // Refresh settings context to reflect the new settings (including tax rate)
          await refreshSettings();
          toast.success("Settings saved successfully!");
        } else {
          setError(result.error || "Failed to save settings");
          toast.error(
            "Failed to save settings: " + (result.error || "Unknown error"),
          );
        }
      }
    } catch (err) {
      console.error("Error saving settings:", err);
      setError("Failed to save settings");
      toast.error("Failed to save settings. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = async () => {
    if (
      confirm("Are you sure you want to reset all settings to default values?")
    ) {
      setIsLoading(true);
      setError("");

      try {
        const response = await fetch("/api/settings?action=reset", {
          method: "PUT",
        });

        const result = await response.json();

        if (result.success) {
          setSettings(result.data);
          // Refresh settings context to reflect the reset settings
          await refreshSettings();
          toast.success("Settings reset successfully!");
        } else {
          setError(result.error || "Failed to reset settings");
          toast.error(
            "Failed to reset settings: " + (result.error || "Unknown error"),
          );
        }
      } catch (err) {
        console.error("Error resetting settings:", err);
        setError("Failed to reset settings");
        toast.error("Failed to reset settings. Please try again.");
      } finally {
        setIsLoading(false);
      }
    }
  };

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Desktop Sidebar */}
      <div className="hidden lg:block">
        <Sidebar
          activeItem="settings"
          onItemClick={() => {}}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          isCartModalOpen={isCartModalOpen}
        />
      </div>

      {/* Mobile Sidebar (overlay) */}
      <Sidebar
        activeItem="settings"
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
          <div className="max-w-screen-2xl mx-auto">
            {/* Header */}
            <div className="mb-8">
              <h1 className="text-2xl font-semibold text-gray-900">Settings</h1>
              <p className="text-gray-600 mt-1">
                Manage your business settings and preferences
              </p>
            </div>

            {/* Loading State */}
            {isLoadingData && (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  <span className="ml-2 text-gray-600">
                    Loading settings...
                  </span>
                </div>
              </div>
            )}

            {/* Error State */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg
                      className="h-5 w-5 text-red-400"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm text-red-800">{error}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Settings Content */}
            {!isLoadingData && (
              <div className="space-y-8">
                {/* Staff-only: Show only Current Branch selector */}
                {user?.role === "staff" && (
                  <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                    <div className="flex items-center mb-6">
                      <Store className="h-5 w-5 text-cyan-600 mr-2" />
                      <h2 className="text-lg font-semibold text-gray-900">
                        Your Branch
                      </h2>
                    </div>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-normal text-gray-900 mb-2">
                          <Store className="inline h-4 w-4 mr-1 mb-1" />
                          Current Branch/Shop
                        </label>
                        <div className="relative">
                          <select
                            title="CurrentBranch"
                            value={settings.currentBranch || "No Branch"}
                            onChange={(e) =>
                              handleInputChange("currentBranch", e.target.value)
                            }
                            className="w-full px-3 py-2 border border-gray-300 focus:outline-none focus:border-gray-500 appearance-none bg-white text-gray-900"
                          >
                            {(settings.currentBranch === "No Branch" ||
                              noShops) && (
                              <option value="No Branch">No Branch</option>
                            )}
                            {shops.map((shop) => (
                              <option key={shop.id} value={shop.name}>
                                {shop.name}
                              </option>
                            ))}
                          </select>
                          <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none">
                            <svg
                              className="w-4 h-4 text-dark-400"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M19 9l-7 7-7-7"
                              />
                            </svg>
                          </div>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                          Select the branch for your transactions
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Staff: Show Tax Rate (Read-only) */}
                {user?.role === "staff" && (
                  <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                    <div className="flex items-center mb-6">
                      <Receipt className="h-5 w-5 text-cyan-600 mr-2" />
                      <h2 className="text-lg font-semibold text-gray-900">
                        Tax Rate
                      </h2>
                    </div>
                    <div className="space-y-4">
                      <div className="bg-gray-50 rounded-lg p-4">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-gray-900">
                            Current Tax Rate
                          </span>
                          <span className="text-lg font-bold text-cyan-600">
                            {settings.taxRate}%
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-2">
                          Tax rate is applied to all transactions
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Staff: Show Currency Rate (Read-only) */}
                {user?.role === "staff" && (
                  <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                    <div className="flex items-center mb-6">
                      <DollarSign className="h-5 w-5 text-cyan-600 mr-2" />
                      <h2 className="text-lg font-semibold text-gray-900">
                        Currency Rate
                      </h2>
                    </div>
                    <div className="space-y-4">
                      <div className="bg-gray-50 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-gray-900">
                            {getCurrencyRateDisplay().from} →{" "}
                            {getCurrencyRateDisplay().to}
                          </span>
                          <span className="text-lg font-bold text-cyan-600">
                            {settings.currencyRate}
                          </span>
                        </div>
                        {settings.currencyRate > 0 && (
                          <p className="text-xs text-gray-500">
                            1 {getCurrencyRateDisplay().fromSymbol} ={" "}
                            {settings.currencyRate}{" "}
                            {getCurrencyRateDisplay().toSymbol}
                          </p>
                        )}
                        <p className="text-xs text-gray-500 mt-2">
                          {getCurrencyRateDisplay().description}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Owner/Manager: Show full Business Information Section */}
                {user?.role !== "staff" && (
                  <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                    <div className="flex items-center mb-6">
                      <Building2 className="h-5 w-5 text-cyan-600 mr-2" />
                      <h2 className="text-lg font-semibold text-gray-900">
                        Business Information
                      </h2>
                    </div>

                    <div className="space-y-6">
                      {/* Logo Upload */}
                      <div className="text-center">
                        <h3 className="text-sm font-medium text-gray-900 mb-4">
                          Business Logo
                        </h3>
                        <ImageUpload
                          value={settings.businessLogo}
                          onChange={(url) =>
                            handleInputChange("businessLogo", url)
                          }
                          folder="pos-clothing-store/business-logos"
                          className="mx-auto"
                        />
                      </div>

                      {/* Business Details */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <Input
                          label="Business Name"
                          value={settings.businessName}
                          onChange={(e) =>
                            handleInputChange("businessName", e.target.value)
                          }
                        />
                        <Input
                          label="Short Name (Optional)"
                          value={settings.shortName}
                          onChange={(e) =>
                            handleInputChange("shortName", e.target.value)
                          }
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* <div>
                          <label className="block text-sm font-normal text-gray-900 mb-2">
                            Main Currency
                          </label>
                          <div className="relative">
                            <select
                              title="DefaultCurrentcy"
                              value={settings.defaultCurrency}
                              onChange={(e) =>
                                handleInputChange(
                                  "defaultCurrency",
                                  e.target.value,
                                )
                              }
                              className="w-full px-3 py-2 border border-gray-300 focus:outline-none focus:border-gray-500 appearance-none bg-white text-gray-900"
                            >
                              {currencies.map((currency) => (
                                <option
                                  key={currency.code}
                                  value={currency.code}
                                >
                                  {currency.symbol} {currency.code} —{" "}
                                  {currency.name}
                                </option>
                              ))}
                            </select>
                            <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none">
                              <svg
                                className="w-4 h-4 text-dark-400"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M19 9l-7 7-7-7"
                                />
                              </svg>
                            </div>
                          </div>
                        </div> */}
                        <Input
                          label="Tax Rate (%) (e.g., 5 for 5%)"
                          type="number"
                          value={settings.taxRate === 0 ? "" : settings.taxRate}
                          onChange={(e) =>
                            handleInputChange(
                              "taxRate",
                              e.target.value === ""
                                ? 0
                                : parseFloat(e.target.value),
                            )
                          }
                          placeholder="0"
                        />
                        {/* Current Branch Selector */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div>
                            <label className="block text-sm font-normal text-gray-900 mb-2">
                              <Store className="inline h-4 w-4 mr-1 mb-1" />
                              Current Branch/Shop
                            </label>
                            <div className="relative">
                              <select
                                title="CurrentBranch"
                                value={settings.currentBranch || "No Branch"}
                                onChange={(e) =>
                                  handleInputChange(
                                    "currentBranch",
                                    e.target.value,
                                  )
                                }
                                className="w-full px-3 py-2 border border-gray-300 focus:outline-none focus:border-gray-500 appearance-none bg-white text-gray-900"
                              >
                                {/* Show 'No Branch' if selected, or if there are no shops */}
                                {(settings.currentBranch === "No Branch" ||
                                  noShops) && (
                                  <option value="No Branch">No Branch</option>
                                )}
                                {shops.map((shop) => (
                                  <option key={shop.id} value={shop.name}>
                                    {shop.name}
                                  </option>
                                ))}
                              </select>
                              <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none">
                                <svg
                                  className="w-4 h-4 text-dark-400"
                                  fill="none"
                                  stroke="black"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M19 9l-7 7-7-7"
                                  />
                                </svg>
                              </div>
                            </div>
                            {/* <p className="text-xs text-gray-500 mt-1">
                              Select the branch for new transactions
                            </p> */}
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <Input
                          label="Registered By"
                          value={settings.registeredBy}
                          onChange={(e) =>
                            handleInputChange("registeredBy", e.target.value)
                          }
                        />
                        <Input
                          label="Registered At"
                          type="date"
                          value={settings.registeredAt}
                          onChange={(e) =>
                            handleInputChange("registeredAt", e.target.value)
                          }
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Invoice & Receipt Settings - Owner/Manager only */}
                {user?.role !== "staff" && (
                  <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                    <div className="flex items-center mb-6">
                      <Receipt className="h-5 w-5 text-cyan-600 mr-2" />
                      <h2 className="text-lg font-semibold text-gray-900">
                        Invoice & Receipt Settings
                      </h2>
                    </div>

                    <div className="space-y-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-sm font-medium text-gray-900">
                            Show Business Logo on Invoice
                          </h3>
                        </div>
                        <Toggle
                          checked={settings.showBusinessLogoOnInvoice}
                          onChange={(checked) =>
                            handleInputChange(
                              "showBusinessLogoOnInvoice",
                              checked,
                            )
                          }
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-sm font-medium text-gray-900">
                            Auto Print Receipt After Checkout
                          </h3>
                        </div>
                        <Toggle
                          checked={settings.autoPrintReceiptAfterCheckout}
                          onChange={(checked) =>
                            handleInputChange(
                              "autoPrintReceiptAfterCheckout",
                              checked,
                            )
                          }
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-900 mb-2">
                          Invoice Footer Message
                        </label>
                        <textarea
                          value={settings.invoiceFooterMessage}
                          onChange={(e) =>
                            handleInputChange(
                              "invoiceFooterMessage",
                              e.target.value,
                            )
                          }
                          rows={3}
                          className="w-full px-3 py-2 border border-gray-300 focus:outline-none focus:border-gray-500 text-gray-900"
                          placeholder="Enter footer message for invoices"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          This message will appear at the bottom of customer
                          invoices.
                        </p>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-900 mb-2">
                          Invoice Footer Image
                        </label>
                        <ImageUpload
                          value={settings.invoiceFooterImage}
                          onChange={(url) =>
                            handleInputChange("invoiceFooterImage", url)
                          }
                          onRemove={() =>
                            handleInputChange("invoiceFooterImage", "")
                          }
                          folder="pos-clothing-store/invoice-footer"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          This image will appear at the bottom of printed
                          invoices/receipts.
                        </p>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-900 mb-2">
                          Receipt Paper Size
                        </label>
                        <select
                          title="ReceiptPaperSize"
                          value={settings.receiptPaperSize}
                          onChange={(e) =>
                            handleInputChange(
                              "receiptPaperSize",
                              e.target.value as ReceiptPaperSize,
                            )
                          }
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 text-gray-900"
                        >
                          <option value="44mm">44mm (1.73&quot;)</option>
                          <option value="57mm">57mm (2.24&quot;)</option>
                          <option value="58mm">58mm (2.28&quot;)</option>
                          <option value="69mm">69mm (2.72&quot;)</option>
                          <option value="76mm">76mm (2.99&quot;)</option>
                          <option value="78mm">78mm (3.07&quot;)</option>
                          <option value="80mm">
                            80mm (3.15&quot;) - Standard
                          </option>
                          <option value="82.5mm">82.5mm (3.25&quot;)</option>
                          <option value="112mm">112mm (4.41&quot;)</option>
                          <option value="114mm">114mm (4.49&quot;)</option>
                          <option value="210mm">
                            210mm (8.27&quot;) - A4 Width
                          </option>
                        </select>
                        <p className="text-xs text-gray-500 mt-1">
                          Default paper size for thermal receipt printing.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* User Interface Preferences - Owner/Manager only */}
                {/* {user?.role !== "staff" && (
                  <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                    <div className="flex items-center mb-6">
                      <User className="h-5 w-5 text-cyan-600 mr-2" />
                      <h2 className="text-lg font-semibold text-gray-900">
                        User Interface Preferences
                      </h2>
                    </div>

                    <div className="space-y-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-sm font-medium text-gray-900">
                            Enable Dark Mode (Coming Soon)
                          </h3>
                        </div>
                        <Toggle
                          checked={settings.enableDarkMode}
                          onChange={(checked) =>
                            handleInputChange("enableDarkMode", checked)
                          }
                          disabled={true}
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-sm font-medium text-gray-900">
                            Enable Sound Effects (Coming Soon)
                          </h3>
                        </div>
                        <Toggle
                          checked={settings.enableSoundEffects}
                          onChange={(checked) =>
                            handleInputChange("enableSoundEffects", checked)
                          }
                          disabled={true}
                        />
                      </div>
                    </div>
                  </div>
                )} */}

                {/* Currency Rate - Owner/Manager only */}
                {user?.role !== "staff" && (
                  <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                    <div className="flex items-center mb-6">
                      <DollarSign className="h-5 w-5 text-cyan-600 mr-2" />
                      <h2 className="text-lg font-semibold text-gray-900">
                        Currency Rate
                      </h2>
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-sm font-medium text-gray-900">
                            {getCurrencyRateDisplay().from} →{" "}
                            {getCurrencyRateDisplay().to}
                          </h3>
                          <p className="text-xs text-gray-500 mt-1">
                            {getCurrencyRateDisplay().description}
                          </p>
                        </div>
                        <div className="w-32">
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={
                              settings.currencyRate === 0
                                ? ""
                                : settings.currencyRate
                            }
                            onChange={(e) =>
                              handleInputChange(
                                "currencyRate",
                                e.target.value === ""
                                  ? 0
                                  : parseFloat(e.target.value),
                              )
                            }
                            className="text-right"
                            placeholder="0.00"
                          />
                        </div>
                      </div>

                      {settings.currencyRate > 0 && (
                        <div className="bg-cyan-50 border border-blue-200 rounded-lg p-3">
                          <p className="text-sm text-blue-800">
                            <span className="font-medium">Exchange Rate:</span>{" "}
                            1 {getCurrencyRateDisplay().fromSymbol} ={" "}
                            {settings.currencyRate}{" "}
                            {getCurrencyRateDisplay().toSymbol}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Loyalty Program Settings - Owner/Manager only */}
                {user?.role !== "staff" && (
                  <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                    <div className="flex items-center mb-6">
                      <Gift className="h-5 w-5 text-purple-600 mr-2" />
                      <h2 className="text-lg font-semibold text-gray-900">
                        Loyalty Program Settings
                      </h2>
                    </div>

                    <div className="space-y-6">
                      {/* Enable/Disable Loyalty Program */}
                      <div className="flex items-center justify-between pb-4 border-b border-gray-200">
                        <div>
                          <h3 className="text-sm font-medium text-gray-900">
                            Enable Loyalty Program
                          </h3>
                          <p className="text-xs text-gray-500 mt-1">
                            Reward customers with points for every purchase
                          </p>
                        </div>
                        <Toggle
                          checked={settings.loyaltySettings?.enabled || false}
                          onChange={(checked) =>
                            handleLoyaltySettingChange("enabled", checked)
                          }
                        />
                      </div>

                      {/* Show settings only if enabled */}
                      {settings.loyaltySettings?.enabled && (
                        <>
                          {/* Points Earning Configuration */}
                          <div className="bg-purple-50 rounded-lg p-4 space-y-4">
                            <h3 className="text-sm font-semibold text-purple-900">
                              Points Earning Rules
                            </h3>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                <label className="block text-sm font-medium text-gray-900 mb-2">
                                  Minimum Spend Amount ({settings.defaultCurrency === "THB" ? "฿" : "Ks"})
                                </label>
                                <Input
                                  type="number"
                                  min="0"
                                  step="10"
                                  value={settings.loyaltySettings?.minimumSpendAmount || 0}
                                  onChange={(e) =>
                                    handleLoyaltySettingChange(
                                      "minimumSpendAmount",
                                      parseFloat(e.target.value) || 0
                                    )
                                  }
                                  placeholder="500"
                                />
                                <p className="text-xs text-gray-600 mt-1">
                                  Minimum purchase amount to earn points
                                </p>
                              </div>

                              <div>
                                <label className="block text-sm font-medium text-gray-900 mb-2">
                                  Points Per Purchase
                                </label>
                                <Input
                                  type="number"
                                  min="1"
                                  step="1"
                                  value={settings.loyaltySettings?.pointsPerPurchase || 1}
                                  onChange={(e) =>
                                    handleLoyaltySettingChange(
                                      "pointsPerPurchase",
                                      parseInt(e.target.value) || 1
                                    )
                                  }
                                  placeholder="1"
                                />
                                <p className="text-xs text-gray-600 mt-1">
                                  Points earned per qualifying purchase
                                </p>
                              </div>
                            </div>

                            <div className="bg-white rounded p-3 border border-purple-200">
                              <p className="text-sm text-gray-700">
                                <span className="font-medium">Example:</span> Customer spends{" "}
                                {settings.defaultCurrency === "THB" ? "฿" : "Ks"}
                                {settings.loyaltySettings?.minimumSpendAmount || 500} or more →
                                Earns <span className="font-semibold text-purple-600">
                                  {settings.loyaltySettings?.pointsPerPurchase || 1} point(s)
                                </span>
                              </p>
                            </div>
                          </div>

                          {/* Coupon Packages */}
                          <div className="bg-green-50 rounded-lg p-4 space-y-4">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <h3 className="text-sm font-semibold text-green-900">
                                  Coupon Packages
                                </h3>
                                <p className="text-xs text-green-800 mt-1">
                                  Define one or more reward tiers. When a customer
                                  reaches a tier they receive that coupon, and using
                                  it deducts that tier&apos;s points.
                                </p>
                              </div>
                              <Button
                                type="button"
                                variant="outline"
                                onClick={handleAddCouponPackage}
                                className="shrink-0 whitespace-nowrap"
                              >
                                <Plus className="h-4 w-4 mr-1" />
                                Add Package
                              </Button>
                            </div>

                            {couponPackages.length === 0 ? (
                              <div className="bg-white rounded border border-dashed border-green-300 p-6 text-center">
                                <Gift className="h-8 w-8 text-green-300 mx-auto mb-2" />
                                <p className="text-sm text-gray-600">
                                  No coupon packages yet. Add one so customers can
                                  earn rewards.
                                </p>
                              </div>
                            ) : (
                              <div className="space-y-3">
                                {couponPackages.map((pkg, index) => {
                                  const currencySymbol =
                                    settings.defaultCurrency === "THB" ? "฿" : "Ks";

                                  return (
                                    <div
                                      key={pkg.id}
                                      className={`rounded-lg border bg-white p-4 space-y-3 ${
                                        pkg.enabled
                                          ? "border-green-200"
                                          : "border-gray-200 opacity-70"
                                      }`}
                                    >
                                      <div className="flex items-center justify-between gap-3">
                                        <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-800">
                                          Tier {index + 1}
                                        </span>
                                        <div className="flex items-center gap-3">
                                          <label className="flex items-center gap-2 text-xs text-gray-700">
                                            <input
                                              type="checkbox"
                                              checked={pkg.enabled}
                                              onChange={(e) =>
                                                handleCouponPackageChange(
                                                  pkg.id,
                                                  "enabled",
                                                  e.target.checked,
                                                )
                                              }
                                              className="h-4 w-4 rounded border-gray-300 text-green-600"
                                              aria-label={`Enable ${pkg.name}`}
                                            />
                                            Active
                                          </label>
                                          <button
                                            type="button"
                                            onClick={() =>
                                              handleRemoveCouponPackage(pkg.id)
                                            }
                                            className="rounded-md p-1.5 text-red-500 hover:bg-red-50"
                                            aria-label={`Remove ${pkg.name}`}
                                            title="Remove package"
                                          >
                                            <Trash2 className="h-4 w-4" />
                                          </button>
                                        </div>
                                      </div>

                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                          <label className="block text-sm font-medium text-gray-900 mb-2">
                                            Package Name
                                          </label>
                                          <Input
                                            type="text"
                                            value={pkg.name}
                                            onChange={(e) =>
                                              handleCouponPackageChange(
                                                pkg.id,
                                                "name",
                                                e.target.value,
                                              )
                                            }
                                            placeholder="Bronze Reward"
                                          />
                                        </div>

                                        <div>
                                          <label className="block text-sm font-medium text-gray-900 mb-2">
                                            Points Required
                                          </label>
                                          <Input
                                            type="number"
                                            min="1"
                                            step="1"
                                            value={pkg.pointsRequired}
                                            onChange={(e) =>
                                              handleCouponPackageChange(
                                                pkg.id,
                                                "pointsRequired",
                                                parseInt(e.target.value) || 0,
                                              )
                                            }
                                            placeholder="10"
                                          />
                                          <p className="text-xs text-gray-600 mt-1">
                                            Deducted when the coupon is used
                                          </p>
                                        </div>
                                      </div>

                                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div>
                                          <label className="block text-sm font-medium text-gray-900 mb-2">
                                            Discount Type
                                          </label>
                                          <select
                                            title={`Discount type for ${pkg.name}`}
                                            value={pkg.discountType}
                                            onChange={(e) =>
                                              handleCouponPackageChange(
                                                pkg.id,
                                                "discountType",
                                                e.target.value as
                                                  | "percentage"
                                                  | "fixed",
                                              )
                                            }
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-green-500 text-gray-900"
                                          >
                                            <option value="percentage">
                                              Percentage (%)
                                            </option>
                                            <option value="fixed">
                                              Fixed Amount ({currencySymbol})
                                            </option>
                                          </select>
                                        </div>

                                        <div>
                                          <label className="block text-sm font-medium text-gray-900 mb-2">
                                            Discount Value
                                          </label>
                                          <Input
                                            type="number"
                                            min="0"
                                            step={
                                              pkg.discountType === "percentage"
                                                ? "1"
                                                : "10"
                                            }
                                            value={pkg.discountValue}
                                            onChange={(e) =>
                                              handleCouponPackageChange(
                                                pkg.id,
                                                "discountValue",
                                                parseFloat(e.target.value) || 0,
                                              )
                                            }
                                            placeholder="10"
                                          />
                                        </div>

                                        <div>
                                          <label className="block text-sm font-medium text-gray-900 mb-2">
                                            Validity (Days)
                                          </label>
                                          <Input
                                            type="number"
                                            min="1"
                                            step="1"
                                            value={pkg.validityDays}
                                            onChange={(e) =>
                                              handleCouponPackageChange(
                                                pkg.id,
                                                "validityDays",
                                                parseInt(e.target.value) || 30,
                                              )
                                            }
                                            placeholder="30"
                                          />
                                        </div>
                                      </div>

                                      <div className="rounded bg-green-50 px-3 py-2 border border-green-200">
                                        <p className="text-sm text-gray-700">
                                          At{" "}
                                          <span className="font-semibold text-green-700">
                                            {pkg.pointsRequired || 0} points
                                          </span>{" "}
                                          → customer earns{" "}
                                          <span className="font-semibold text-green-700">
                                            {pkg.discountType === "percentage"
                                              ? `${pkg.discountValue || 0}% off`
                                              : `${currencySymbol}${pkg.discountValue || 0} off`}
                                          </span>
                                          , valid {pkg.validityDays || 30} days.
                                          Using it deducts{" "}
                                          <span className="font-semibold text-green-700">
                                            {pkg.pointsRequired || 0} points
                                          </span>
                                          .
                                        </p>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            {couponPackages.filter((pkg) => pkg.enabled).length >
                              1 && (
                              <div className="rounded bg-white p-3 border border-green-200">
                                <p className="text-xs text-gray-700">
                                  With several active tiers, a customer receives the
                                  highest tier they reach. Points keep accumulating,
                                  so cheaper tiers are still awarded along the way.
                                </p>
                              </div>
                            )}
                          </div>

                          {/* Program Summary */}
                          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                            <h3 className="text-sm font-semibold text-blue-900 mb-3">
                              📊 Program Summary
                            </h3>
                            <div className="space-y-2 text-sm text-blue-800">
                              <p>
                                ✓ Customers earn{" "}
                                <span className="font-semibold">
                                  {settings.loyaltySettings?.pointsPerPurchase || 1} point(s)
                                </span>{" "}
                                for purchases of{" "}
                                {settings.defaultCurrency === "THB" ? "฿" : "Ks"}
                                {settings.loyaltySettings?.minimumSpendAmount || 500} or more
                              </p>
                              {couponPackages.filter((pkg) => pkg.enabled)
                                .length === 0 ? (
                                <p>
                                  ⚠ No active coupon packages, so customers cannot
                                  earn rewards yet
                                </p>
                              ) : (
                                [...couponPackages]
                                  .filter((pkg) => pkg.enabled)
                                  .sort(
                                    (a, b) =>
                                      a.pointsRequired - b.pointsRequired,
                                  )
                                  .map((pkg) => (
                                    <p key={pkg.id}>
                                      ✓{" "}
                                      <span className="font-semibold">
                                        {pkg.pointsRequired} points
                                      </span>{" "}
                                      = {pkg.name} (
                                      <span className="font-semibold">
                                        {pkg.discountType === "percentage"
                                          ? `${pkg.discountValue}% off`
                                          : `${settings.defaultCurrency === "THB" ? "฿" : "Ks"}${pkg.discountValue} off`}
                                      </span>
                                      , expires in {pkg.validityDays} days)
                                    </p>
                                  ))
                              )}
                              <p>
                                ✓ Using a coupon deducts the points of its own
                                package
                              </p>
                            </div>
                          </div>
                        </>
                      )}

                      {!settings.loyaltySettings?.enabled && (
                        <div className="text-center py-6">
                          <Gift className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                          <p className="text-sm text-gray-500">
                            Enable the loyalty program to configure rewards
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Deployment Link Section */}
                {/* <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                  <div className="flex items-center mb-4">
                    <h2 className="text-lg font-semibold text-gray-900">
                      Customer Website Deployment
                    </h2>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm text-gray-600 mb-3">
                        Access the customer website:
                        https://pos-clothing-store-web.vercel.app/
                      </p>
                      <a
                        href="https://pos-clothing-store-web.vercel.app/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors duration-200"
                      >
                        <svg
                          className="w-4 h-4 mr-2"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                          />
                        </svg>
                        Open Website
                      </a>
                    </div>
                  </div>
                </div> */}

                {/* Action Buttons - Save button for staff (branch only), full reset/save for owner/manager */}
                <div className="flex justify-end space-x-4 pt-6">
                  {user?.role !== "staff" && (
                    <Button
                      variant="outline"
                      onClick={handleReset}
                      disabled={isLoading || isLoadingData}
                    >
                      Reset
                    </Button>
                  )}
                  <Button
                    onClick={handleSaveSettings}
                    loading={isLoading}
                    disabled={isLoading || isLoadingData}
                  >
                    {user?.role === "staff" ? "Save Branch" : "Save Settings"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

export default function OwnerSettingsPage() {
  return (
    <ProtectedRoute>
      <OwnerSettingsContent />
    </ProtectedRoute>
  );
}
