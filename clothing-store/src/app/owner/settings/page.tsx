"use client";

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
import { Building2, Receipt, User, DollarSign, Store } from "lucide-react";

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
  receiptPaperSize: ReceiptPaperSize;
  enableDarkMode: boolean;
  enableSoundEffects: boolean;
  currencyRate: number;
  currentBranch?: string;
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
    receiptPaperSize: "80mm",
    enableDarkMode: false,
    enableSoundEffects: false,
    currencyRate: 0,
    currentBranch: "No Branch",
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
          if (user?.uid) {
            const userBranch = localStorage.getItem(`userBranch_${user.uid}`);
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

  const handleSaveSettings = async () => {
    setIsLoading(true);
    setError("");

    try {
      // Save branch to localStorage for all users (user-specific)
      if (user?.uid && settings.currentBranch) {
        localStorage.setItem(`userBranch_${user.uid}`, settings.currentBranch);
      }

      // Staff and Manager: Only save branch (already done above)
      if (user?.role === "staff" || user?.role === "manager") {
        // Refresh settings context to reflect the new branch
        await refreshSettings();
        alert("Branch saved successfully!");
      }
      // Owner: Save all other settings globally (excluding currentBranch)
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
          alert("Settings saved successfully!");
        } else {
          setError(result.error || "Failed to save settings");
          alert(
            "Failed to save settings: " + (result.error || "Unknown error"),
          );
        }
      }
    } catch (err) {
      console.error("Error saving settings:", err);
      setError("Failed to save settings");
      alert("Failed to save settings. Please try again.");
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
          alert("Settings reset successfully!");
        } else {
          setError(result.error || "Failed to reset settings");
          alert(
            "Failed to reset settings: " + (result.error || "Unknown error"),
          );
        }
      } catch (err) {
        console.error("Error resetting settings:", err);
        setError("Failed to reset settings");
        alert("Failed to reset settings. Please try again.");
      } finally {
        setIsLoading(false);
      }
    }
  };

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Desktop Sidebar */}
      <div className="hidden md:block">
        <Sidebar
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          isCartModalOpen={isCartModalOpen}
        />
      </div>

      {/* Mobile Sidebar (overlay) */}
      <Sidebar
        isMobileOpen={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        isCartModalOpen={isCartModalOpen}
        className="md:hidden"
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
                      <Store className="h-5 w-5 text-blue-600 mr-2" />
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
                      <Receipt className="h-5 w-5 text-blue-600 mr-2" />
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
                          <span className="text-lg font-bold text-blue-600">
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
                      <DollarSign className="h-5 w-5 text-blue-600 mr-2" />
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
                          <span className="text-lg font-bold text-blue-600">
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
                      <Building2 className="h-5 w-5 text-blue-600 mr-2" />
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
                        <div>
                          <label className="block text-sm font-normal text-gray-900 mb-2">
                            Default Currency
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
                        </div>
                        <Input
                          label="Tax Rate (%) (e.g., 5 for 5%)"
                          type="number"
                          value={settings.taxRate}
                          onChange={(e) =>
                            handleInputChange(
                              "taxRate",
                              parseFloat(e.target.value) || 0,
                            )
                          }
                          placeholder="0"
                        />
                      </div>

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
                            Select the branch for new transactions
                          </p>
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
                      <Receipt className="h-5 w-5 text-blue-600 mr-2" />
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
                {user?.role !== "staff" && (
                  <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                    <div className="flex items-center mb-6">
                      <User className="h-5 w-5 text-blue-600 mr-2" />
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
                )}

                {/* Currency Rate - Owner/Manager only */}
                {user?.role !== "staff" && (
                  <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                    <div className="flex items-center mb-6">
                      <DollarSign className="h-5 w-5 text-blue-600 mr-2" />
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
                            value={settings.currencyRate}
                            onChange={(e) =>
                              handleInputChange(
                                "currencyRate",
                                parseFloat(e.target.value) || 0,
                              )
                            }
                            className="text-right"
                            placeholder="0.00"
                          />
                        </div>
                      </div>

                      {settings.currencyRate > 0 && (
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
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

                {/* Deployment Link Section */}
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
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
                </div>

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
