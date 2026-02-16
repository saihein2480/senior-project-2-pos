"use client";

import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { Sidebar } from "@/components/ui/Sidebar";
import { TopNavBar } from "@/components/ui/TopNavBar";
import { Button } from "@/components/ui/Button";
import Image from "next/image";
import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Printer, Search, Package, QrCode, Settings } from "lucide-react";
import { ClothingInventoryItem } from "@/types/schemas";
import { InventoryService } from "@/services/InventoryService";
import { ShopService } from "@/services/shopService";
import { Shop } from "@/types/shop";
import { useCurrency } from "@/contexts/CurrencyContext";

// Interface for individual variants
interface InventoryVariant {
  id: string; // unique variant ID
  parentId: string; // original item ID
  name: string; // item name
  shop: string; // branch/shop information
  color: string;
  colorCode: string;
  size: string;
  barcode: string;
  price: number;
  quantity: number;
  image?: string;
}

function LabelPrintContent() {
  const router = useRouter();
  const [activeMenuItem, setActiveMenuItem] = useState("label-print");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isCartModalOpen, setIsCartModalOpen] = useState(false);

  // State for inventory variants (individual color-size combinations)
  const [inventoryVariants, setInventoryVariants] = useState<
    InventoryVariant[]
  >([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [shopNameMap, setShopNameMap] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search and filter state
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedShop, setSelectedShop] = useState("all");
  const [selectedVariants, setSelectedVariants] = useState<string[]>([]);

  // Label settings loaded from localStorage (configured in Print Settings page)
  interface LabelSettings {
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

  const [labelSettings, setLabelSettings] = useState<LabelSettings>({
    labelWidth: 50,
    labelHeight: 30,
    labelGap: 3,
    standard: "EAN-13",
    gs1CompanyPrefix: "8851234",
    autoSequence: 1,
    showCompany: true,
    showDates: false,
    showPrice: true,
  });

  // For backward compatibility with existing code
  const labelWidth = labelSettings.labelWidth;
  const labelHeight = labelSettings.labelHeight;
  const labelGap = labelSettings.labelGap;
  const standard = labelSettings.standard;
  const gs1CompanyPrefix = labelSettings.gs1CompanyPrefix;
  const showCompany = labelSettings.showCompany;
  const showDates = labelSettings.showDates;
  const showPrice = labelSettings.showPrice;
  const includeBarcode = true;

  // Individual quantity tracking for each selected item
  const [itemQuantities, setItemQuantities] = useState<Record<string, number>>(
    {},
  );

  const { formatPrice } = useCurrency();

  // Helper function to generate numeric barcode from string ID
  const generateNumericBarcode = (stringId: string, index: number): string => {
    // If the stringId is already a numeric barcode (all digits, 12-13 characters), use it directly
    if (/^\d{12,13}$/.test(stringId)) {
      return stringId.slice(0, 13); // Return first 13 digits for EAN-13
    }

    // Otherwise, create a hash from the string ID
    let hash = 0;
    for (let i = 0; i < stringId.length; i++) {
      const char = stringId.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }

    // Take absolute value and convert to string
    const hashStr = Math.abs(hash).toString();

    // Generate a 12-digit number (EAN-13 uses 12 digits + 1 check digit)
    const baseNumber = `${gs1CompanyPrefix}${hashStr.slice(0, 5)}`;
    const paddedNumber = (baseNumber + index.toString())
      .padEnd(12, "0")
      .slice(0, 12);

    return paddedNumber;
  };

  // Load label settings from localStorage (configured in Print Settings page)
  useEffect(() => {
    const saved = localStorage.getItem("labelSettings");
    if (saved) {
      try {
        const settings = JSON.parse(saved);
        setLabelSettings(settings);
      } catch (e) {
        console.error("Error loading label settings:", e);
      }
    }
  }, []);

  // Fetch inventory items and convert to variants
  useEffect(() => {
    fetchInventoryItems();
  }, []);

  // Filter variants based on search and shop
  const filteredVariants = useMemo(() => {
    let filtered = inventoryVariants;

    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter(
        (variant) =>
          variant.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          variant.shop.toLowerCase().includes(searchTerm.toLowerCase()) ||
          variant.color.toLowerCase().includes(searchTerm.toLowerCase()) ||
          variant.size.toLowerCase().includes(searchTerm.toLowerCase()) ||
          variant.barcode.toLowerCase().includes(searchTerm.toLowerCase()),
      );
    }

    // Apply shop filter
    if (selectedShop !== "all") {
      filtered = filtered.filter((variant) => variant.shop === selectedShop);
    }

    return filtered;
  }, [inventoryVariants, searchTerm, selectedShop]);

  const fetchInventoryItems = async () => {
    try {
      setIsLoading(true);

      // Fetch both inventory items and shops
      const [items, shopsData] = await Promise.all([
        InventoryService.getAllClothingInventory(),
        ShopService.getAllShops(),
      ]);

      // Create shop ID to name mapping
      const nameMap: Record<string, string> = {};
      shopsData.forEach((shop) => {
        nameMap[shop.id] = shop.name;
      });

      setShops(shopsData);
      setShopNameMap(nameMap);

      const variants = convertItemsToVariants(items, nameMap);
      setInventoryVariants(variants);
      setError(null);
    } catch (err) {
      console.error("Error fetching inventory:", err);
      setError("Failed to load inventory items");
    } finally {
      setIsLoading(false);
    }
  };

  // Convert ClothingInventoryItem[] to InventoryVariant[]
  const convertItemsToVariants = (
    items: ClothingInventoryItem[],
    shopNameMap: Record<string, string>,
  ): InventoryVariant[] => {
    const variants: InventoryVariant[] = [];

    items.forEach((item) => {
      if (item.colorVariants && item.colorVariants.length > 0) {
        // Create variants for each color-size combination
        item.colorVariants.forEach((colorVariant) => {
          if (
            colorVariant.sizeQuantities &&
            colorVariant.sizeQuantities.length > 0
          ) {
            colorVariant.sizeQuantities.forEach((sizeQty, sizeIndex) => {
              if (sizeQty.quantity > 0) {
                // Only include variants with stock
                // Use a combination of item.id, color, and size to ensure uniqueness
                const colorId =
                  colorVariant.id || colorVariant.color.replace(/\s+/g, "-");
                const uniqueId = `${item.id}-${colorId}-${sizeQty.size}`;

                variants.push({
                  id: uniqueId,
                  parentId: item.id,
                  name: item.name,
                  shop: shopNameMap[item.shop] || item.shop, // Convert shop ID to name
                  color: colorVariant.color,
                  colorCode: colorVariant.colorCode,
                  size: sizeQty.size,
                  barcode: colorVariant.barcode || uniqueId, // Use actual barcode from database, fallback to uniqueId
                  price: item.price,
                  quantity: sizeQty.quantity,
                  image: colorVariant.image || item.image,
                });
              }
            });
          }
        });
      } else {
        // For items without color variants, create a single variant
        variants.push({
          id: item.id,
          parentId: item.id,
          name: item.name,
          shop: shopNameMap[item.shop] || item.shop, // Convert shop ID to name
          color: "Default",
          colorCode: "#808080",
          size: "One Size",
          barcode: item.barcode || item.id,
          price: item.price,
          quantity: item.stock,
          image: item.image,
        });
      }
    });

    return variants;
  };

  const handleSelectVariant = (variantId: string) => {
    setSelectedVariants((prev) => {
      const isCurrentlySelected = prev.includes(variantId);
      if (isCurrentlySelected) {
        // Remove from selection and clear its quantity
        setItemQuantities((prevQuantities) => {
          const newQuantities = { ...prevQuantities };
          delete newQuantities[variantId];
          return newQuantities;
        });
        return prev.filter((id) => id !== variantId);
      } else {
        // Add to selection and initialize quantity to 1
        setItemQuantities((prevQuantities) => ({
          ...prevQuantities,
          [variantId]: 1,
        }));
        return [...prev, variantId];
      }
    });
  };

  const handleSelectAll = () => {
    if (selectedVariants.length === filteredVariants.length) {
      // Deselect all and clear all quantities
      setSelectedVariants([]);
      setItemQuantities({});
    } else {
      // Select all and initialize quantities to 1
      const allVariantIds = filteredVariants.map((variant) => variant.id);
      setSelectedVariants(allVariantIds);
      const newQuantities: Record<string, number> = {};
      allVariantIds.forEach((id) => {
        newQuantities[id] = 1;
      });
      setItemQuantities(newQuantities);
    }
  };

  const updateItemQuantity = (variantId: string, quantity: number) => {
    if (quantity < 1) return; // Minimum quantity is 1
    setItemQuantities((prev) => ({
      ...prev,
      [variantId]: quantity,
    }));
  };

  const handlePrintLabels = async () => {
    if (selectedVariants.length === 0) {
      alert("Please select at least one variant to print barcode labels");
      return;
    }

    // Create print content with pre-generated barcodes
    const selectedVariantsData = inventoryVariants.filter((variant) =>
      selectedVariants.includes(variant.id),
    );

    try {
      const printContent =
        await generatePrintContentWithBarcodes(selectedVariantsData);

      // Open print window
      const printWindow = window.open("", "_blank");
      if (printWindow) {
        printWindow.document.write(printContent);
        printWindow.document.close();
        printWindow.print();
      }
    } catch (error) {
      console.error("Error generating print content:", error);
      alert("Error generating barcode labels. Please try again.");
    }
  };

  const generateSimpleBarcodeSVG = (barcodeNumber: string): string => {
    // Create realistic barcode patterns that vary significantly based on the barcode number
    const bars: string[] = [];
    const barHeight = 40;
    const totalWidth = 100;
    let currentX = 3; // Start with margin

    // Create distinct patterns based on each digit of the barcode
    const barcodePattern: number[] = [];

    // Define different bar patterns for each digit (0-9)
    const digitPatterns = {
      "0": [1, 1, 3, 1, 1],
      "1": [2, 1, 1, 2, 1],
      "2": [1, 2, 1, 1, 2],
      "3": [3, 1, 1, 1, 1],
      "4": [1, 1, 2, 1, 2],
      "5": [2, 1, 2, 1, 1],
      "6": [1, 3, 1, 1, 1],
      "7": [1, 1, 1, 3, 1],
      "8": [1, 1, 1, 1, 3],
      "9": [2, 2, 1, 1, 1],
    };

    // Generate pattern based on barcode digits
    for (let i = 0; i < barcodeNumber.length; i++) {
      const digit = barcodeNumber[i];
      const pattern = digitPatterns[digit as keyof typeof digitPatterns] || [
        1, 1, 1, 1, 1,
      ];
      barcodePattern.push(...pattern);

      // Add separator between digit groups
      if (i < barcodeNumber.length - 1) {
        barcodePattern.push(1); // Small separator
      }
    }

    // Calculate bar widths to fit the available space
    const totalPatternWidth = barcodePattern.reduce(
      (sum, width) => sum + width,
      0,
    );
    const availableWidth = totalWidth - 6; // Account for margins
    const scaleFactor = availableWidth / totalPatternWidth;

    // Generate bars based on the pattern
    for (
      let i = 0;
      i < barcodePattern.length && currentX < totalWidth - 3;
      i++
    ) {
      const patternWidth = barcodePattern[i];
      const isBlackBar = i % 2 === 0; // Alternate black and white
      const barWidth = Math.max(0.5, patternWidth * scaleFactor); // Minimum 0.5px width

      if (isBlackBar && currentX + barWidth < totalWidth - 3) {
        bars.push(
          `<rect x="${currentX.toFixed(1)}" y="0" width="${barWidth.toFixed(1)}" height="${barHeight}" fill="#000"/>`,
        );
      }

      currentX += barWidth;
    }

    // Add start and end guard bars
    bars.unshift(
      `<rect x="0" y="0" width="2" height="${barHeight}" fill="#000"/>`,
    );
    bars.unshift(
      `<rect x="2.5" y="0" width="1" height="${barHeight}" fill="#000"/>`,
    );
    bars.push(
      `<rect x="${totalWidth - 3.5}" y="0" width="1" height="${barHeight}" fill="#000"/>`,
    );
    bars.push(
      `<rect x="${totalWidth - 2}" y="0" width="2" height="${barHeight}" fill="#000"/>`,
    );

    return `<svg width="${totalWidth}" height="${barHeight}" viewBox="0 0 ${totalWidth} ${barHeight}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#fff"/>
      ${bars.join("")}
    </svg>`;
  };

  const generatePrintContentWithBarcodes = async (
    variants: InventoryVariant[],
  ) => {
    // Generate simple barcode SVGs for each variant
    const barcodeMap = new Map<string, string>();
    const barcodeCache = new Map<string, string>(); // Cache to ensure same barcode number = same visual

    variants.forEach((variant, variantIndex) => {
      const quantity = itemQuantities[variant.id] || 1;
      for (let i = 0; i < quantity; i++) {
        // Generate numeric barcode from the variant's unique ID
        const barcodeNumber = generateNumericBarcode(
          variant.barcode,
          variantIndex,
        );

        const uniqueId = `barcode-${variantIndex}-${i}`;

        try {
          // Check if we already generated this barcode pattern
          let svgString = barcodeCache.get(barcodeNumber);
          if (!svgString) {
            // Generate a simple barcode SVG pattern
            svgString = generateSimpleBarcodeSVG(barcodeNumber);
            barcodeCache.set(barcodeNumber, svgString);
          }
          barcodeMap.set(uniqueId, svgString);
        } catch (error) {
          console.error(`Failed to generate barcode for ${uniqueId}:`, error);
          // Fallback: create a simple black rectangle
          barcodeMap.set(
            uniqueId,
            `<svg width="100" height="40" xmlns="http://www.w3.org/2000/svg">
            <rect width="100%" height="100%" fill="#000"/>
          </svg>`,
          );
        }
      }
    });

    return generatePrintContentWithPreGeneratedBarcodes(variants, barcodeMap);
  };

  const generatePrintContentWithPreGeneratedBarcodes = (
    variants: InventoryVariant[],
    barcodeMap: Map<string, string>,
  ) => {
    let content = `
      <html>
        <head>
          <title>Barcode Labels</title>
          <style>
            body { margin: 0; padding: 10px; font-family: Arial, sans-serif; }
            .label-container { display: flex; flex-wrap: wrap; gap: 10px; }
            .label { 
              width: ${labelWidth}mm; 
              height: ${labelHeight}mm; 
              border: 1px solid #000; 
              padding: 5px; 
              box-sizing: border-box; 
              display: flex; 
              flex-direction: column; 
              justify-content: space-between;
              page-break-inside: avoid;
            }
            .product-name { font-size: 12px; font-weight: bold; margin-bottom: 2px; }
            .product-details { font-size: 10px; color: #666; margin-bottom: 2px; }
            .company-info { font-size: 9px; color: #888; }
            .date-info { font-size: 8px; color: #888; }
            .barcode-container { text-align: center; margin: 5px 0; }
            .barcode-svg { max-width: 100%; height: 40px; }
            .barcode-number { font-family: 'Courier New', monospace; font-size: 10px; text-align: center; margin-top: 2px; }
            .price { font-size: 11px; font-weight: bold; text-align: right; }
          </style>
        </head>
        <body>
          <div class="label-container">
    `;

    variants.forEach((variant, variantIndex) => {
      const quantity = itemQuantities[variant.id] || 1;
      for (let i = 0; i < quantity; i++) {
        // Generate numeric barcode from the variant's unique ID
        const barcodeNumber = generateNumericBarcode(
          variant.barcode,
          variantIndex,
        );

        const currentDate = new Date().toLocaleDateString();
        const uniqueId = `barcode-${variantIndex}-${i}`;
        const barcodeSvg = barcodeMap.get(uniqueId) || "";

        content += `
          <div class="label">
            <div>
              <div class="product-name">${variant.name}</div>
              <div class="product-details">
                ${variant.color} - ${variant.size}
              </div>
              ${showCompany ? `<div class="company-info">${variant.shop}</div>` : ""}
              ${showDates ? `<div class="date-info">${currentDate}</div>` : ""}
            </div>
            ${
              includeBarcode
                ? `<div class="barcode-container">
                     ${barcodeSvg}
                     <div class="barcode-number">${barcodeNumber}</div>
                   </div>`
                : ""
            }
            ${
              showPrice
                ? `<div class="price">${formatPrice(variant.price)}</div>`
                : ""
            }
          </div>
        `;
      }
    });

    content += `
          </div>
        </body>
      </html>
    `;

    return content;
  };

  const generatePrintContent = (variants: InventoryVariant[]) => {
    let content = `
      <html>
        <head>
          <title>Barcode Labels</title>
          <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
          <style>
            body { margin: 0; padding: 20px; font-family: Arial, sans-serif; }
            .label-container { display: flex; flex-wrap: wrap; gap: ${typeof labelGap === "number" ? labelGap : 90}px; }
            .label { 
              width: ${typeof labelWidth === "number" ? labelWidth : 50}mm;
              height: ${typeof labelHeight === "number" ? labelHeight : 90}mm;
              border: 1px solid #000; 
              padding: 8px; 
              display: flex; 
              flex-direction: column; 
              justify-content: space-between;
              page-break-inside: avoid;
              margin-bottom: ${typeof labelGap === "number" ? labelGap : 90}px;
            }
            .product-name { font-size: 12px; font-weight: bold; margin-bottom: 4px; }
            .product-details { font-size: 10px; margin-bottom: 4px; }
            .company-info { font-size: 9px; color: #666; margin-bottom: 2px; }
            .date-info { font-size: 9px; color: #666; margin-bottom: 2px; }
            .barcode-container { text-align: center; margin: 4px 0; }
            .barcode-svg { max-width: 100%; height: auto; }
            .barcode-number { font-family: 'Courier New', monospace; font-size: 10px; text-align: center; margin-top: 2px; }
            .price { font-size: 11px; font-weight: bold; text-align: right; }
          </style>
        </head>
        <body>
          <div class="label-container">
    `;

    // Collect all barcode data for script generation
    const barcodeData: Array<{ uniqueId: string; barcodeNumber: string }> = [];

    variants.forEach((variant, variantIndex) => {
      const quantity = itemQuantities[variant.id] || 1;
      for (let i = 0; i < quantity; i++) {
        // Generate numeric barcode from the variant's unique ID
        const barcodeNumber = generateNumericBarcode(
          variant.barcode,
          variantIndex,
        );

        const currentDate = new Date().toLocaleDateString();
        const uniqueId = `barcode-${variantIndex}-${i}`;

        // Store barcode data for script generation
        barcodeData.push({ uniqueId, barcodeNumber });

        content += `
          <div class="label">
            <div>
              <div class="product-name">${variant.name}</div>
              <div class="product-details">
                ${variant.color} - ${variant.size}
              </div>
              ${showCompany ? `<div class="company-info">${variant.shop}</div>` : ""}
              ${showDates ? `<div class="date-info">${currentDate}</div>` : ""}
            </div>
            ${
              includeBarcode
                ? `<div class="barcode-container">
                     <svg id="${uniqueId}" class="barcode-svg"></svg>
                     <div class="barcode-number">${barcodeNumber}</div>
                   </div>`
                : ""
            }
            ${
              showPrice
                ? `<div class="price">${formatPrice(variant.price)}</div>`
                : ""
            }
          </div>
        `;
      }
    });

    content += `
          </div>
          <script>
            function generateBarcodes() {
              if (typeof JsBarcode === 'undefined') {
                console.error('JsBarcode library not loaded');
                return;
              }
              
              console.log('Generating barcodes...');
              
              ${barcodeData
                .map(
                  ({ uniqueId, barcodeNumber }) => `
                try {
                  const element = document.getElementById('${uniqueId}');
                  if (element) {
                    JsBarcode('#${uniqueId}', '${barcodeNumber}', {
                      format: '${standard === "EAN-13" ? "EAN13" : "CODE128"}',
                      width: 1,
                      height: 40,
                      displayValue: false,
                      margin: 0
                    });
                    console.log('Generated barcode for ${uniqueId}');
                  } else {
                    console.error('Element not found: ${uniqueId}');
                  }
                } catch(e) {
                  console.error('Barcode generation failed for ${uniqueId}:', e);
                  // Fallback: create a simple visual barcode
                  const element = document.getElementById('${uniqueId}');
                  if (element) {
                    element.innerHTML = '<rect width="100%" height="40" fill="#000" stroke="#000" stroke-width="1"/>';
                  }
                }
              `,
                )
                .join("")}
            }
            
            // Try multiple times to ensure JsBarcode is loaded
            let attempts = 0;
            function tryGenerateBarcodes() {
              attempts++;
              if (typeof JsBarcode !== 'undefined') {
                generateBarcodes();
              } else if (attempts < 10) {
                setTimeout(tryGenerateBarcodes, 100);
              } else {
                console.error('JsBarcode failed to load after multiple attempts');
              }
            }
            
            window.onload = function() {
              tryGenerateBarcodes();
            };
          </script>
        </body>
      </html>
    `;

    return content;
  };

  const getUniqueShops = () => {
    const shops = inventoryVariants.map((variant) => variant.shop);
    return [...new Set(shops)].sort();
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
        <div className="flex-1 flex flex-col overflow-auto">
          <TopNavBar onCartModalStateChange={setIsCartModalOpen} />
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-4 text-gray-600">Loading inventory...</p>
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

      <div className="flex-1 flex flex-col overflow-auto">
        <TopNavBar onCartModalStateChange={setIsCartModalOpen} />

        {/* Header */}
        <div className="bg-white border-b border-gray-100 px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div>
                <h1 className="text-xl font-semibold text-gray-800">
                  Label Printing
                </h1>
                <p className="text-sm text-gray-500 mt-1">
                  Create barcode labels for your products
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <Button
                onClick={() => router.push("/owner/barcode/print-settings")}
                variant="outline"
                className="border-gray-200 text-gray-600 hover:bg-gray-50"
              >
                <Settings className="h-4 w-4 mr-2" />
                Label Settings
              </Button>
              <Button
                onClick={handlePrintLabels}
                disabled={selectedVariants.length === 0}
                className="bg-blue-600 hover:bg-blue-700 text-white disabled:bg-gray-300"
              >
                <Printer className="h-4 w-4 mr-2" />
                Print Selected ({selectedVariants.length})
              </Button>
            </div>
          </div>

          {/* Current Settings Summary */}
          <div className="mt-4 flex items-center gap-4 text-sm text-gray-600">
            <span className="px-3 py-1 bg-gray-100 rounded-full">
              Label: {labelWidth}×{labelHeight}mm
            </span>
            <span className="px-3 py-1 bg-gray-100 rounded-full">
              {standard}
            </span>
            {showCompany && (
              <span className="px-3 py-1 bg-gray-100 rounded-full">
                Shop Name
              </span>
            )}
            {showPrice && (
              <span className="px-3 py-1 bg-gray-100 rounded-full">Price</span>
            )}
            {showDates && (
              <span className="px-3 py-1 bg-gray-100 rounded-full">Date</span>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          <div className="min-h-full">
            {/* Main Content */}
            <div className="flex-1 flex flex-col">
              {/* Search and Filters */}
              <div className="bg-gray-50/50 border-b border-gray-100 px-6 py-5">
                <div className="flex items-center gap-4">
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search products..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200  focus:ring-2 focus:ring-gray-500/20 focus:border-gray-300 text-gray-900 placeholder-gray-400 transition-all"
                    />
                  </div>
                  <select
                    title="selectedShop"
                    value={selectedShop}
                    onChange={(e) => setSelectedShop(e.target.value)}
                    className="w-44 px-4 py-2 bg-white border border-gray-200 focus:ring-2 focus:ring-gray-500/20 focus:border-gray-300 text-gray-700 transition-all"
                  >
                    <option value="all">All Shops</option>
                    {getUniqueShops().map((shop) => (
                      <option key={shop} value={shop}>
                        {shop}
                      </option>
                    ))}
                  </select>
                  <Button
                    onClick={handleSelectAll}
                    variant="outline"
                    className="whitespace-nowrap px-4 py-2 border-gray-200 text-gray-600 hover:bg-gray-50 transition-all"
                  >
                    {selectedVariants.length === filteredVariants.length
                      ? "Deselect All"
                      : "Select All"}
                  </Button>
                </div>
              </div>

              {/* Variants List */}
              <div className="p-6">
                {error ? (
                  <div className="text-center py-12">
                    <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md mx-auto">
                      <Package className="h-12 w-12 text-red-400 mx-auto mb-4" />
                      <p className="text-red-600 font-medium mb-4">{error}</p>
                      <Button
                        onClick={fetchInventoryItems}
                        className="bg-red-600 hover:bg-red-700"
                      >
                        <Package className="h-4 w-4 mr-2" />
                        Retry Loading
                      </Button>
                    </div>
                  </div>
                ) : filteredVariants.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 max-w-md mx-auto">
                      <Package className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                      <h3 className="text-lg font-medium text-gray-900 mb-2">
                        No Items Found
                      </h3>
                      <p className="text-gray-500">
                        Try adjusting your search or filter criteria
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
                    {filteredVariants.map((variant) => (
                      <div
                        key={variant.id}
                        className={`group relative bg-white rounded-lg border cursor-pointer transition-all duration-200 ${
                          selectedVariants.includes(variant.id)
                            ? "border-blue-400 bg-blue-50/50 shadow-lg shadow-blue-100/50"
                            : "border-gray-200 hover:border-gray-300 hover:shadow-md"
                        }`}
                        onClick={() => handleSelectVariant(variant.id)}
                      >
                        {/* Product Image */}
                        <div className="relative aspect-square bg-gray-50 overflow-hidden rounded-t-lg">
                          {variant.image ? (
                            <Image
                              src={variant.image}
                              alt={`${variant.name} - ${variant.color} - ${variant.size}`}
                              width={120}
                              height={120}
                              className="w-full h-full object-cover group-hover:scale-102 transition-transform duration-300"
                            />
                          ) : (
                            <div className="absolute inset-0 flex items-center justify-center bg-gray-50">
                              <div className="text-center">
                                <Package className="h-10 w-10 text-gray-300 mx-auto mb-2" />
                                <p className="text-xs text-gray-400">
                                  No Image
                                </p>
                              </div>
                            </div>
                          )}

                          {/* Selection Indicator */}
                          <div
                            className={`absolute top-3 right-3 w-5 h-5 rounded-full border flex items-center justify-center transition-all ${
                              selectedVariants.includes(variant.id)
                                ? "bg-blue-500 border-blue-500"
                                : "bg-white/80 border-gray-300 group-hover:border-blue-400"
                            }`}
                          >
                            {selectedVariants.includes(variant.id) && (
                              <svg
                                className="w-3 h-3 text-white"
                                fill="currentColor"
                                viewBox="0 0 20 20"
                              >
                                <path
                                  fillRule="evenodd"
                                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                  clipRule="evenodd"
                                />
                              </svg>
                            )}
                          </div>

                          {/* Stock Badge */}
                          <div className="absolute top-3 left-3">
                            <span className="inline-flex items-center px-2 py-1 rounded-lg text-xs font-medium backdrop-blur-sm bg-white/90 text-gray-700 border border-gray-200">
                              {variant.quantity}
                            </span>
                          </div>
                        </div>

                        {/* Product Details */}
                        <div className="p-3">
                          <div className="mb-2">
                            <h3 className="font-medium text-gray-900 text-xs mb-1 line-clamp-2">
                              {variant.name}
                            </h3>
                            <p className="text-xs text-gray-500 font-medium">
                              {variant.shop}
                            </p>
                          </div>

                          {/* Variant Details */}
                          <div className="space-y-1 mb-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-gray-400">
                                Color
                              </span>
                              <div className="flex items-center gap-1">
                                <div
                                  className="w-2 h-2 rounded-full border border-gray-200"
                                  style={{
                                    backgroundColor:
                                      variant.colorCode || "#gray",
                                  }}
                                ></div>
                                <span className="text-xs text-gray-700">
                                  {variant.color}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-gray-400">
                                Size
                              </span>
                              <span className="text-xs text-gray-700 bg-gray-50 px-1 py-0.5 rounded">
                                {variant.size}
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-gray-400">
                                Barcode
                              </span>
                              <span className="text-xs text-gray-700 font-mono">
                                {variant.barcode}
                              </span>
                            </div>
                          </div>

                          {/* Price */}
                          <div className="flex items-center justify-between pt-1 border-t border-gray-100">
                            <div className="text-sm font-semibold text-gray-900">
                              {formatPrice(variant.price)}
                            </div>
                            <div
                              className={`text-xs px-3 py-1 rounded-full font-medium ${
                                selectedVariants.includes(variant.id)
                                  ? "bg-blue-100 text-blue-600"
                                  : "bg-gray-100 text-gray-500"
                              }`}
                            >
                              {selectedVariants.includes(variant.id)
                                ? "Selected"
                                : "Select"}
                            </div>
                          </div>

                          {/* Quantity Control - Only show when selected */}
                          {selectedVariants.includes(variant.id) && (
                            <div className="mt-2 pt-2 border-t border-gray-100">
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-gray-500 font-medium">
                                  Print Quantity:
                                </span>
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      updateItemQuantity(
                                        variant.id,
                                        Math.max(
                                          1,
                                          (itemQuantities[variant.id] || 1) - 1,
                                        ),
                                      );
                                    }}
                                    className="w-6 h-6 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600 text-sm font-medium"
                                  >
                                    -
                                  </button>
                                  <span className="w-8 text-center text-xs font-medium text-gray-900">
                                    {itemQuantities[variant.id] || 1}
                                  </span>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      updateItemQuantity(
                                        variant.id,
                                        (itemQuantities[variant.id] || 1) + 1,
                                      );
                                    }}
                                    className="w-6 h-6 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600 text-sm font-medium"
                                  >
                                    +
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LabelPrintPage() {
  return (
    <ProtectedRoute>
      <LabelPrintContent />
    </ProtectedRoute>
  );
}
