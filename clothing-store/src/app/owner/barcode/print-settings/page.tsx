"use client";

import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { Sidebar } from "@/components/ui/Sidebar";
import { TopNavBar } from "@/components/ui/TopNavBar";
import { Button } from "@/components/ui/Button";
import { SettingsService } from "@/services/settingsService";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Save,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  QrCode,
  ArrowRight,
} from "lucide-react";

// Barcode Label Settings Interface
interface BarcodeLabelSettings {
  labelWidth: number;
  labelHeight: number;
  labelGap: number;
  standard: string;
  gs1CompanyPrefix: string;
  autoSequence: number;
  showCompany: boolean;
  showDates: boolean;
  showPrice: boolean;
}

const DEFAULT_LABEL_SETTINGS: BarcodeLabelSettings = {
  labelWidth: 50,
  labelHeight: 30,
  labelGap: 3,
  standard: "EAN-13",
  gs1CompanyPrefix: "8851234",
  autoSequence: 1,
  showCompany: true,
  showDates: false,
  showPrice: true,
};

function PrintSettingsContent() {
  const router = useRouter();
  const [activeMenuItem, setActiveMenuItem] = useState("print-settings");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isCartModalOpen, setIsCartModalOpen] = useState(false);

  // Barcode Label Settings state
  const [barcodeLabelSettings, setBarcodeLabelSettings] =
    useState<BarcodeLabelSettings>(DEFAULT_LABEL_SETTINGS);

  // UI state
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Load settings on component mount
  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setIsLoading(true);
      let loadedSettings: BarcodeLabelSettings | null = null;

      // 1) Try shared cloud settings first
      try {
        const businessSettings = await SettingsService.getBusinessSettings();
        if (businessSettings?.labelSettings) {
          loadedSettings = {
            ...DEFAULT_LABEL_SETTINGS,
            ...businessSettings.labelSettings,
          };
        }
      } catch (cloudError) {
        console.warn("Could not load cloud label settings:", cloudError);
      }

      // 2) Fallback to local browser settings
      if (!loadedSettings) {
        const savedLabelSettings = localStorage.getItem("labelSettings");
        if (savedLabelSettings) {
          loadedSettings = {
            ...DEFAULT_LABEL_SETTINGS,
            ...JSON.parse(savedLabelSettings),
          };
        }
      }

      if (loadedSettings) {
        setBarcodeLabelSettings(loadedSettings);
      }
    } catch (err) {
      console.error("Error loading settings:", err);
      setError("Failed to load settings");
    } finally {
      setIsLoading(false);
    }
  };

  const saveSettings = async () => {
    try {
      setIsSaving(true);
      setError(null);

      // Keep local backup for offline fallback
      localStorage.setItem(
        "labelSettings",
        JSON.stringify(barcodeLabelSettings),
      );

      // Save into shared business settings for all allowed roles/devices
      const existingSettings = await SettingsService.getBusinessSettings();
      if (existingSettings) {
        await SettingsService.saveBusinessSettings({
          businessName: existingSettings.businessName,
          shortName: existingSettings.shortName,
          defaultCurrency: existingSettings.defaultCurrency,
          taxRate: existingSettings.taxRate,
          registeredBy: existingSettings.registeredBy,
          registeredAt: existingSettings.registeredAt,
          businessLogo: existingSettings.businessLogo,
          showBusinessLogoOnInvoice:
            existingSettings.showBusinessLogoOnInvoice,
          autoPrintReceiptAfterCheckout:
            existingSettings.autoPrintReceiptAfterCheckout,
          invoiceFooterMessage: existingSettings.invoiceFooterMessage,
          invoiceFooterImage: existingSettings.invoiceFooterImage,
          receiptPaperSize: existingSettings.receiptPaperSize,
          enableDarkMode: existingSettings.enableDarkMode,
          enableSoundEffects: existingSettings.enableSoundEffects,
          currencyRate: existingSettings.currencyRate,
          currentBranch: existingSettings.currentBranch,
          labelSettings: barcodeLabelSettings,
        });
      }

      setSuccess("Settings saved successfully!");
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error("Error saving settings:", err);
      setError("Failed to save settings");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-screen bg-gray-50">
        <Sidebar
          activeItem={activeMenuItem}
          onItemClick={(item) => setActiveMenuItem(item.id)}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          isCartModalOpen={isCartModalOpen}
        />
        <div className="flex-1 flex flex-col overflow-hidden">
          <TopNavBar onCartModalStateChange={setIsCartModalOpen} />
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-4 text-gray-600">Loading settings...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar
        activeItem={activeMenuItem}
        onItemClick={(item) => setActiveMenuItem(item.id)}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        isCartModalOpen={isCartModalOpen}
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        <TopNavBar onCartModalStateChange={setIsCartModalOpen} />

        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  Barcode Label Settings
                </h1>
                <p className="text-sm text-gray-500">
                  Configure barcode label dimensions and content
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <Button
                onClick={saveSettings}
                disabled={isSaving}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {isSaving ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Save Settings
              </Button>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Success/Error Messages */}
          {success && (
            <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4 flex items-center">
              <CheckCircle className="h-5 w-5 text-green-600 mr-3" />
              <span className="text-green-800">{success}</span>
            </div>
          )}

          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 flex items-center">
              <AlertCircle className="h-5 w-5 text-red-600 mr-3" />
              <span className="text-red-800">{error}</span>
            </div>
          )}

          <div className="space-y-6 max-w-5xl mx-auto">
            {/* Quick Link to Label Print */}
            <div className="bg-gradient-to-r from-blue-50 to-blue-50 rounded-lg border border-blue-200 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div>
                    <h3 className="font-medium text-gray-900">
                      Ready to Print Labels?
                    </h3>
                    <p className="text-sm text-gray-600">
                      Go to Label Print to select products and print barcodes
                    </p>
                  </div>
                </div>
                <Button
                  onClick={() => router.push("/owner/barcode/label-print")}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  Print Labels
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </div>

            {/* Label Dimensions */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Label Dimensions
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Label Width (mm)
                  </label>
                  <input
                    title="number"
                    type="number"
                    value={barcodeLabelSettings.labelWidth}
                    onChange={(e) =>
                      setBarcodeLabelSettings((prev) => ({
                        ...prev,
                        labelWidth: parseInt(e.target.value) || 50,
                      }))
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-300 focus:border-transparent text-gray-900"
                    min="20"
                    max="100"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Label Height (mm)
                  </label>
                  <input
                    title="number"
                    type="number"
                    value={barcodeLabelSettings.labelHeight}
                    onChange={(e) =>
                      setBarcodeLabelSettings((prev) => ({
                        ...prev,
                        labelHeight: parseInt(e.target.value) || 30,
                      }))
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-300 focus:border-transparent text-gray-900"
                    min="15"
                    max="100"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Gap Between Labels (mm)
                  </label>
                  <input
                    title="number"
                    type="number"
                    value={barcodeLabelSettings.labelGap}
                    onChange={(e) =>
                      setBarcodeLabelSettings((prev) => ({
                        ...prev,
                        labelGap: parseInt(e.target.value) || 3,
                      }))
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-300 focus:border-transparent text-gray-900"
                    min="0"
                    max="20"
                  />
                </div>
              </div>
            </div>

            {/* Barcode Configuration */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Barcode Configuration
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Barcode Standard
                  </label>
                  <select
                    title="label"
                    value={barcodeLabelSettings.standard}
                    onChange={(e) =>
                      setBarcodeLabelSettings((prev) => ({
                        ...prev,
                        standard: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-300 focus:border-transparent text-gray-900"
                  >
                    <option value="EAN-13">EAN-13 (International)</option>
                    <option value="UPC-A">UPC-A (North America)</option>
                    <option value="Code-128">Code-128 (Alphanumeric)</option>
                    <option value="QR-Code">QR Code</option>
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    EAN-13 is recommended for retail products
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    GS1 Company Prefix
                  </label>
                  <input
                    type="text"
                    value={barcodeLabelSettings.gs1CompanyPrefix}
                    onChange={(e) =>
                      setBarcodeLabelSettings((prev) => ({
                        ...prev,
                        gs1CompanyPrefix: e.target.value
                          .replace(/\D/g, "")
                          .slice(0, 7),
                      }))
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-300 focus:border-transparent text-gray-900"
                    placeholder="8851234"
                    maxLength={7}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    7-digit prefix assigned by GS1 (885 = Thailand)
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Starting Sequence Number
                  </label>
                  <input
                    title="number"
                    type="number"
                    value={barcodeLabelSettings.autoSequence}
                    onChange={(e) =>
                      setBarcodeLabelSettings((prev) => ({
                        ...prev,
                        autoSequence: parseInt(e.target.value) || 1,
                      }))
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-300 focus:border-transparent text-gray-900"
                    min="1"
                    max="99999"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Used for auto-generating new barcodes
                  </p>
                </div>
              </div>
            </div>

            {/* Label Content */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Label Content
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <label className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors">
                  <input
                    type="checkbox"
                    checked={barcodeLabelSettings.showCompany}
                    onChange={(e) =>
                      setBarcodeLabelSettings((prev) => ({
                        ...prev,
                        showCompany: e.target.checked,
                      }))
                    }
                    className="h-4 w-4 accent-blue-600 focus:ring-gray-300 border-gray-300 rounded"
                  />
                  <div>
                    <span className="text-sm font-medium text-gray-700">
                      Show Shop/Branch
                    </span>
                    <p className="text-xs text-gray-500">
                      Display store name on label
                    </p>
                  </div>
                </label>
                <label className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors">
                  <input
                    type="checkbox"
                    checked={barcodeLabelSettings.showDates}
                    onChange={(e) =>
                      setBarcodeLabelSettings((prev) => ({
                        ...prev,
                        showDates: e.target.checked,
                      }))
                    }
                    className="h-4 w-4 accent-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <div>
                    <span className="text-sm font-medium text-gray-700">
                      Show Print Date
                    </span>
                    <p className="text-xs text-gray-500">
                      Add date when printed
                    </p>
                  </div>
                </label>
                <label className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors">
                  <input
                    type="checkbox"
                    checked={barcodeLabelSettings.showPrice}
                    onChange={(e) =>
                      setBarcodeLabelSettings((prev) => ({
                        ...prev,
                        showPrice: e.target.checked,
                      }))
                    }
                    className="h-4 w-4 accent-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <div>
                    <span className="text-sm font-medium text-gray-700">
                      Show Price
                    </span>
                    <p className="text-xs text-gray-500">
                      Display product price
                    </p>
                  </div>
                </label>
              </div>
            </div>

            {/* Label Preview */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Label Preview
              </h2>
              <div className="bg-gray-100 rounded-lg p-8 flex justify-center">
                <div
                  className="bg-white border-2 border-dashed border-gray-300 rounded p-3 flex flex-col justify-between"
                  style={{
                    width: `${Math.max(barcodeLabelSettings.labelWidth * 3, 120)}px`,
                    height: `${Math.max(barcodeLabelSettings.labelHeight * 3, 90)}px`,
                  }}
                >
                  <div>
                    <div className="font-bold text-xs text-gray-900 truncate">
                      Sample Product
                    </div>
                    <div className="text-xs text-gray-600">Blue - Size M</div>
                    {barcodeLabelSettings.showCompany && (
                      <div className="text-xs text-gray-500 mt-0.5">
                        Main Store
                      </div>
                    )}
                    {barcodeLabelSettings.showDates && (
                      <div className="text-xs text-gray-400">
                        {new Date().toLocaleDateString()}
                      </div>
                    )}
                  </div>
                  <div className="my-1">
                    <div className="flex justify-center items-end space-x-px">
                      {[
                        1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 1, 0, 1, 0, 1,
                        1, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1,
                      ].map((bar, i) => (
                        <div
                          key={i}
                          className={`${bar ? "bg-black" : "bg-white"} w-0.5 h-6`}
                        />
                      ))}
                    </div>
                    <div className="text-center text-xs font-mono mt-0.5 text-gray-700">
                      {barcodeLabelSettings.gs1CompanyPrefix}
                      {barcodeLabelSettings.autoSequence
                        .toString()
                        .padStart(5, "0")}
                      0
                    </div>
                  </div>
                  {barcodeLabelSettings.showPrice && (
                    <div className="text-right font-bold text-sm text-gray-900">
                      ฿299
                    </div>
                  )}
                </div>
              </div>
              <p className="text-center text-xs text-gray-500 mt-3">
                Preview based on current settings (
                {barcodeLabelSettings.labelWidth}×
                {barcodeLabelSettings.labelHeight}mm)
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PrintSettingsPage() {
  return (
    <ProtectedRoute requiredRole={["owner", "manager"]}>
      <PrintSettingsContent />
    </ProtectedRoute>
  );
}
