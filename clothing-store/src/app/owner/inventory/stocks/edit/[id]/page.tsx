"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { Sidebar } from "@/components/ui/Sidebar";
import { TopNavBar } from "@/components/ui/TopNavBar";
import { Button } from "@/components/ui/Button";
import { ImageUpload } from "@/components/ui/ImageUpload";
import {
  ArrowLeft,
  Plus,
  DollarSign,
  X,
  BarChart3,
  ScanLine,
} from "lucide-react";
import {
  WholesaleTier,
  ColorVariant,
  CreateStockRequest,
  SizeQuantity,
  StockItem,
} from "@/types/stock";
import { Shop, ShopListResponse } from "@/types/shop";
import { SettingsService } from "@/services/settingsService";
import { CategoryService } from "@/services/categoryService";
import { detectColorName, extractColorsFromImage } from "@/lib/colorUtils";

// Type declaration for BarcodeDetector API
interface BarcodeDetector {
  detect(image: HTMLVideoElement): Promise<{ rawValue: string }[]>;
}

declare global {
  interface Window {
    BarcodeDetector?: {
      new (): BarcodeDetector;
    };
  }
}

function EditStockContent() {
  const router = useRouter();
  const params = useParams();
  const stockId = params.id as string;
  const [activeItem, setActiveItem] = useState("inventory");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isCartModalOpen, setIsCartModalOpen] = useState(false);

  // Form state
  const [groupImage, setGroupImage] = useState<string>("");
  const [groupName, setGroupName] = useState("");
  const [category, setCategory] = useState("");
  const [categories, setCategories] = useState<string[]>([
    "Shirt",
    "Pants",
    "Dress",
    "Jacket",
    "Accessories",
  ]);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [originalPrice, setOriginalPrice] = useState("");
  const [releaseDate, setReleaseDate] = useState("");
  const [selectedShops, setSelectedShops] = useState<string[]>([]);

  // Currency state
  const [defaultCurrency, setDefaultCurrency] = useState<string>("THB");
  const [currencySymbol, setCurrencySymbol] = useState<string>("฿");

  const [isColorless, setIsColorless] = useState(false);
  const [wholesaleTiers, setWholesaleTiers] = useState<WholesaleTier[]>([]);
  const [colorVariants, setColorVariants] = useState<ColorVariant[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);

  // Track detected colors for each variant
  const [detectedColors, setDetectedColors] = useState<
    Record<string, string[]>
  >({});

  // Loading and error states
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingShops, setIsLoadingShops] = useState(false);
  const [isLoadingStock, setIsLoadingStock] = useState(true);
  const [isUploadingMultiple, setIsUploadingMultiple] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{
    current: number;
    total: number;
  }>({ current: 0, total: 0 });
  const [error, setError] = useState<string>("");
  const [successMessage, setSuccessMessage] = useState<string>("");

  // Fetch shops from the API
  const fetchShops = async () => {
    setIsLoadingShops(true);
    try {
      const response = await fetch("/api/shops");
      if (!response.ok) {
        throw new Error("Failed to fetch shops");
      }
      const data: ShopListResponse = await response.json();
      setShops(data.data || []);
    } catch (error) {
      console.error("Error fetching shops:", error);
      setError("Failed to load shops");
    } finally {
      setIsLoadingShops(false);
    }
  };

  // Fetch existing stock data
  const fetchStockData = async () => {
    setIsLoadingStock(true);
    try {
      const response = await fetch(`/api/stocks/${stockId}`);
      if (!response.ok) {
        throw new Error("Failed to fetch stock data");
      }
      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || "Failed to load stock data");
      }

      const stock: StockItem = result.data;

      // Populate form with existing data
      setGroupImage(stock.groupImage || "");
      setGroupName(stock.groupName || "");
      setCategory(stock.category || "");
      setUnitPrice(stock.unitPrice?.toString() || "");
      setOriginalPrice(stock.originalPrice?.toString() || "");
      setReleaseDate(stock.releaseDate || "");
      setSelectedShops(stock.shop ? [stock.shop] : []);
      setIsColorless(stock.isColorless || false);

      // Set wholesale tiers with original IDs preserved
      setWholesaleTiers(
        (stock.wholesaleTiers || []).map((tier, index) => ({
          id: tier.id || `tier-${stock.id}-${index}`, // Use original ID or create unique fallback
          minQuantity: tier.minQuantity,
          price: tier.price,
        })),
      );

      // Set color variants with proper IDs
      setColorVariants(
        (stock.colorVariants || []).map((variant, index) => ({
          id: `variant-${index}`,
          color: variant.color,
          colorCode: variant.colorCode,
          barcode: variant.barcode,
          sizeQuantities: variant.sizeQuantities || [],
          image: variant.image,
        })),
      );
    } catch (error) {
      console.error("Error fetching stock data:", error);
      setError(
        error instanceof Error ? error.message : "Failed to load stock data",
      );
    } finally {
      setIsLoadingStock(false);
    }
  };

  // Fetch currency settings
  const fetchCurrencySettings = async () => {
    try {
      const settings = await SettingsService.getBusinessSettings();
      setDefaultCurrency(settings?.defaultCurrency || "THB");
      const currencyInfo = SettingsService.getCurrencyInfo(
        (settings?.defaultCurrency as "THB" | "MMK") || "THB",
      );
      setCurrencySymbol(currencyInfo.symbol);
    } catch (error) {
      console.error("Error fetching currency settings:", error);
    }
  };

  // Load shops, stock data, and currency settings on component mount
  useEffect(() => {
    fetchShops();
    fetchCurrencySettings();
    if (stockId) {
      fetchStockData();
    }
  }, [stockId]);

  // Load categories from Firebase
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const cats = await CategoryService.getCategories();
        setCategories(cats);
      } catch (error) {
        console.error("Error fetching categories:", error);
      }
    };
    fetchCategories();

    // Subscribe to real-time category updates
    const unsubscribe = CategoryService.subscribeToCategories((cats) => {
      setCategories(cats);
    });

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);

  const addWholesaleTier = () => {
    const newTier: WholesaleTier = {
      id: Date.now().toString(),
      minQuantity: 0,
      price: 0,
    };
    setWholesaleTiers([...wholesaleTiers, newTier]);
  };

  const updateWholesaleTier = (
    id: string,
    field: keyof WholesaleTier,
    value: number,
  ) => {
    setWholesaleTiers((tiers) =>
      tiers.map((tier) =>
        tier.id === id ? { ...tier, [field]: value } : tier,
      ),
    );
  };

  const removeWholesaleTier = (id: string) => {
    setWholesaleTiers((tiers) => tiers.filter((tier) => tier.id !== id));
  };

  const addColorVariant = () => {
    const newVariant: ColorVariant = {
      id: Date.now().toString(),
      color: "",
      colorCode: "#000000",
      barcode: "",
      sizeQuantities: [],
    };
    setColorVariants([...colorVariants, newVariant]);
  };

  const handleMultipleImageUpload = () => {
    // Create a hidden file input for multiple image selection
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept = "image/*";

    input.onchange = async (event) => {
      const files = (event.target as HTMLInputElement).files;
      if (!files || files.length === 0) return;

      // Start loading state
      setIsUploadingMultiple(true);
      setUploadProgress({ current: 0, total: files.length });
      setError("");

      const newVariants: ColorVariant[] = [];
      let validFiles = 0;

      // First pass: validate all files
      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        // Validate file type
        if (!file.type.startsWith("image/")) {
          setError((prev) => prev + `${file.name} is not an image file. `);
          continue;
        }

        // Validate file size (max 5MB)
        if (file.size > 5 * 1024 * 1024) {
          setError((prev) => prev + `${file.name} is too large (max 5MB). `);
          continue;
        }

        validFiles++;
      }

      if (validFiles === 0) {
        setIsUploadingMultiple(false);
        setUploadProgress({ current: 0, total: 0 });
        return;
      }

      // Update total with valid files only
      setUploadProgress({ current: 0, total: validFiles });

      // Process each valid file
      let processedCount = 0;
      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        // Skip invalid files
        if (!file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) {
          continue;
        }

        try {
          // Upload image to Cloudinary
          const formData = new FormData();
          formData.append("file", file);
          formData.append("folder", "pos-clothing-store/variants");

          const response = await fetch("/api/cloudflare/upload", {
            method: "POST",
            body: formData,
          });

          const data = await response.json();

          if (response.ok && data.success) {
            // Create new color variant with uploaded image
            const newVariant: ColorVariant = {
              id: (Date.now() + i).toString(),
              color: "",
              colorCode: "#000000",
              barcode: "",
              sizeQuantities: [],
              image: data.url,
            };
            newVariants.push(newVariant);

            // Extract colors from the uploaded image
            try {
              const extractedColors = await extractColorsFromImage(data.url);
              setDetectedColors((prev) => ({
                ...prev,
                [newVariant.id]: extractedColors,
              }));
            } catch (error) {
              console.error(
                "Failed to extract colors from uploaded image:",
                error,
              );
            }
          } else {
            setError((prev) => prev + `Failed to upload ${file.name}. `);
          }
        } catch (error) {
          setError((prev) => prev + `Error uploading ${file.name}. `);
        }

        // Update progress
        processedCount++;
        setUploadProgress({ current: processedCount, total: validFiles });
      }

      // Add all successfully uploaded variants
      if (newVariants.length > 0) {
        setColorVariants([...colorVariants, ...newVariants]);
      }

      // End loading state
      setIsUploadingMultiple(false);
      setUploadProgress({ current: 0, total: 0 });
    };

    // Trigger file selection dialog
    input.click();
  };

  const updateColorVariant = (
    id: string,
    field: keyof ColorVariant,
    value: string | number,
  ) => {
    // For colorCode updates, don't call setState on every input event.
    if (field === "colorCode" && typeof value === "string") {
      // store pending value and schedule a RAF commit
      pendingColorRef.current[id] = value;
      if (!rafScheduledRef.current[id]) {
        rafScheduledRef.current[id] = true;
        requestAnimationFrame(() => {
          const pending = pendingColorRef.current[id];
          if (pending !== undefined) {
            setColorVariants((variants) =>
              variants.map((variant) =>
                variant.id === id
                  ? { ...variant, colorCode: pending }
                  : variant,
              ),
            );
            delete pendingColorRef.current[id];
          }
          rafScheduledRef.current[id] = false;
        });
      }

      // debounce heavy color name detection separately
      const key = id;
      const timers = detectionTimersRef.current;
      if (timers[key]) {
        clearTimeout(timers[key]);
      }
      timers[key] = window.setTimeout(() => {
        try {
          const detected = detectColorName(value);
          setColorVariants((variants) =>
            variants.map((variant) =>
              variant.id === id ? { ...variant, color: detected } : variant,
            ),
          );
        } catch (e) {
          // ignore
        }
        delete timers[key];
      }, 150);
      return;
    }

    // Non-colorCode fields update immediately
    setColorVariants((variants) =>
      variants.map((variant) => {
        if (variant.id !== id) return variant;
        return { ...variant, [field]: value } as ColorVariant;
      }),
    );
  };

  // Handle image upload with automatic color detection
  const handleImageUpload = async (id: string, imageUrl: string) => {
    // First update the image
    updateColorVariant(id, "image", imageUrl);

    // Then extract colors from the image
    if (imageUrl) {
      try {
        const extractedColors = await extractColorsFromImage(imageUrl);
        setDetectedColors((prev) => ({
          ...prev,
          [id]: extractedColors,
        }));
      } catch (error) {
        console.error("Failed to extract colors from image:", error);
      }
    } else {
      // Clear detected colors if image is removed
      setDetectedColors((prev) => ({
        ...prev,
        [id]: [],
      }));
    }
  };

  // Debounce timers per-variant for color detection
  const detectionTimersRef = useRef<Record<string, number>>({});
  // Pending colorCode updates to batch commits via rAF
  const pendingColorRef = useRef<Record<string, string>>({});
  const rafScheduledRef = useRef<Record<string, boolean>>({});

  const removeColorVariant = (id: string) => {
    setColorVariants((variants) =>
      variants.filter((variant) => variant.id !== id),
    );
  };

  // Size management functions
  const availableSizes = [
    "Free",
    "XXS",
    "XS",
    "S",
    "M",
    "L",
    "XL",
    "2XL",
    "3XL",
    "4XL",
    "5XL",
    "6XL",
  ];

  const addSizeToVariant = (variantId: string, size: string) => {
    setColorVariants((variants) =>
      variants.map((variant) => {
        if (variant.id === variantId) {
          // Check if size already exists
          const existingSize = variant.sizeQuantities.find(
            (sq) => sq.size === size,
          );
          if (existingSize) {
            return variant; // Don't add duplicate size
          }

          const newSizeQuantity: SizeQuantity = {
            size,
            quantity: 0,
          };
          return {
            ...variant,
            sizeQuantities: [...variant.sizeQuantities, newSizeQuantity],
          };
        }
        return variant;
      }),
    );
  };

  const updateSizeQuantity = (
    variantId: string,
    size: string,
    quantity: number,
  ) => {
    setColorVariants((variants) =>
      variants.map((variant) => {
        if (variant.id === variantId) {
          return {
            ...variant,
            sizeQuantities: variant.sizeQuantities.map((sq) =>
              sq.size === size ? { ...sq, quantity } : sq,
            ),
          };
        }
        return variant;
      }),
    );
  };

  const removeSizeFromVariant = (variantId: string, size: string) => {
    setColorVariants((variants) =>
      variants.map((variant) => {
        if (variant.id === variantId) {
          return {
            ...variant,
            sizeQuantities: variant.sizeQuantities.filter(
              (sq) => sq.size !== size,
            ),
          };
        }
        return variant;
      }),
    );
  };

  // EAN-13 barcode generation function
  const generateBarcode = (variantId: string) => {
    // EAN-13 format: Country(2-3) + Manufacturer(4-5) + Product(5) + Check(1) = 13 digits

    // Country code (Thailand = 885, Myanmar = 858) - using 885 for Thailand
    const countryCode = "885";

    // Manufacturer code (4 digits) - using a fixed code for this store
    const manufacturerCode = "1001";

    // Product code (5 digits) - using timestamp for uniqueness
    const timestamp = Date.now().toString();
    const productCode = timestamp.slice(-5);

    // First 12 digits without check digit
    const first12Digits = countryCode + manufacturerCode + productCode;

    // Calculate EAN-13 check digit
    const calculateCheckDigit = (digits: string): string => {
      let sum = 0;
      for (let i = 0; i < 12; i++) {
        const digit = parseInt(digits[i]);
        sum += i % 2 === 0 ? digit : digit * 3;
      }
      const checkDigit = (10 - (sum % 10)) % 10;
      return checkDigit.toString();
    };

    const checkDigit = calculateCheckDigit(first12Digits);
    const generatedBarcode = first12Digits + checkDigit;

    updateColorVariant(variantId, "barcode", generatedBarcode);
  };

  // Barcode scanning function
  const scanBarcode = async (variantId: string) => {
    try {
      // Check if the browser supports the Barcode Detection API
      if ("BarcodeDetector" in window) {
        // Use the native Barcode Detection API if available
        const barcodeDetector = new window.BarcodeDetector!();

        // Request camera access
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });

        // Create a video element to display camera feed
        const video = document.createElement("video");
        video.srcObject = stream;
        video.play();

        // Create a modal for scanning
        const modal = document.createElement("div");
        modal.className =
          "fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50";
        modal.innerHTML = `
          <div class="bg-white p-6 rounded-lg max-w-md w-full mx-4">
            <h3 class="text-lg font-semibold mb-4">Scan Barcode</h3>
            <div class="relative">
              <video id="scanner-video" class="w-full h-64 bg-black rounded" autoplay></video>
              <div class="absolute inset-0 border-2 border-red-500 rounded pointer-events-none"></div>
            </div>
            <div class="flex gap-2 mt-4">
              <button id="cancel-scan" class="flex-1 px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600">Cancel</button>
              <input id="manual-barcode" type="text" placeholder="Or enter manually" class="flex-1 px-3 py-2 border rounded">
              <button id="manual-submit" class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">OK</button>
            </div>
          </div>
        `;

        document.body.appendChild(modal);
        const videoElement = modal.querySelector(
          "#scanner-video",
        ) as HTMLVideoElement;
        videoElement.srcObject = stream;

        // Handle manual input
        const manualInput = modal.querySelector(
          "#manual-barcode",
        ) as HTMLInputElement;
        const manualSubmit = modal.querySelector(
          "#manual-submit",
        ) as HTMLButtonElement;
        const cancelButton = modal.querySelector(
          "#cancel-scan",
        ) as HTMLButtonElement;

        let cleanup = () => {
          stream.getTracks().forEach((track) => track.stop());
          document.body.removeChild(modal);
        };

        manualSubmit.onclick = () => {
          if (manualInput.value.trim()) {
            updateColorVariant(variantId, "barcode", manualInput.value.trim());
            cleanup();
          }
        };

        cancelButton.onclick = cleanup;

        // Try to detect barcodes from video
        const detectBarcodes = async () => {
          try {
            const barcodes = await barcodeDetector.detect(videoElement);
            if (barcodes.length > 0) {
              updateColorVariant(variantId, "barcode", barcodes[0].rawValue);
              cleanup();
            }
          } catch (error) {
            console.log("Barcode detection failed:", error);
          }
        };

        // Check for barcodes every 500ms
        const interval = setInterval(detectBarcodes, 500);

        // Cleanup interval when modal is closed
        const originalCleanup = cleanup;
        cleanup = () => {
          clearInterval(interval);
          originalCleanup();
        };
      } else {
        // Fallback: prompt for manual input
        const barcode = prompt("Enter barcode manually:");
        if (barcode && barcode.trim()) {
          updateColorVariant(variantId, "barcode", barcode.trim());
        }
      }
    } catch (error) {
      console.error("Error accessing camera:", error);
      // Fallback to manual input
      const barcode = prompt("Camera access failed. Enter barcode manually:");
      if (barcode && barcode.trim()) {
        updateColorVariant(variantId, "barcode", barcode.trim());
      }
    }
  };

  const handleUpdateStock = async () => {
    setError("");
    setSuccessMessage("");

    // Validation
    if (!groupName.trim()) {
      setError("Group name is required");
      return;
    }

    if (!unitPrice || parseFloat(unitPrice) <= 0) {
      setError("Valid unit price is required");
      return;
    }

    if (!originalPrice || parseFloat(originalPrice) <= 0) {
      setError("Valid original price is required");
      return;
    }

    if (!releaseDate) {
      setError("Release date is required");
      return;
    }

    if (selectedShops.length === 0) {
      setError("At least one shop must be selected");
      return;
    }

    setIsLoading(true);

    try {
      // Ensure there's at least one variant to attach a barcode to (handles colorless items)
      let variantsToUse = colorVariants;
      if (!variantsToUse || variantsToUse.length === 0) {
        variantsToUse = [
          {
            id: Date.now().toString(),
            color: "",
            colorCode: "#000000",
            barcode: "",
            sizeQuantities: [],
          },
        ];
      }

      // Auto-generate barcodes for variants that don't have one
      const variantsWithBarcodes = variantsToUse.map((variant, index) => {
        if (!variant.barcode || variant.barcode.trim() === "") {
          // Generate unique barcode for this variant using index to ensure uniqueness
          const countryCode = "885"; // Thailand country code
          const manufacturerCode = "1001";
          const timestamp = Date.now().toString();
          const variantNumber = (index + 1).toString().padStart(2, "0"); // Add variant index
          const productCode = (timestamp.slice(-3) + variantNumber).slice(0, 5);
          const first12Digits = countryCode + manufacturerCode + productCode;

          // Calculate EAN-13 check digit
          let sum = 0;
          for (let i = 0; i < 12; i++) {
            const digit = parseInt(first12Digits[i]);
            sum += i % 2 === 0 ? digit : digit * 3;
          }
          const checkDigit = (10 - (sum % 10)) % 10;
          const generatedBarcode = first12Digits + checkDigit.toString();

          return {
            ...variant,
            barcode: generatedBarcode,
          };
        }
        return variant;
      });

      // First, update the current stock
      const stockData: CreateStockRequest = {
        groupName: groupName.trim(),
        category: category || undefined,
        unitPrice: parseFloat(unitPrice),
        originalPrice: parseFloat(originalPrice),
        releaseDate,
        shop: selectedShops[0],
        isColorless,
        groupImage: groupImage,
        wholesaleTiers: wholesaleTiers.map((tier) => ({
          minQuantity: tier.minQuantity,
          price: tier.price,
        })),
        colorVariants: variantsWithBarcodes.map((variant) => ({
          color: variant.color,
          colorCode: variant.colorCode,
          barcode: variant.barcode,
          sizeQuantities: variant.sizeQuantities,
          image: variant.image,
        })),
      };

      // Update the current stock (first shop)
      const updateResponse = await fetch(`/api/stocks/${stockId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(stockData),
      });

      const updateResult = await updateResponse.json();

      if (!updateResponse.ok || !updateResult.success) {
        throw new Error(updateResult.error || "Failed to update stock item");
      }

      // Create stocks for additional shops (if any)
      if (selectedShops.length > 1) {
        const additionalShops = selectedShops.slice(1);
        const createPromises = additionalShops.map(async (shopId) => {
          const newStockData: CreateStockRequest = {
            ...stockData,
            shop: shopId,
          };

          const response = await fetch("/api/stocks", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(newStockData),
          });

          const result = await response.json();

          if (!response.ok || !result.success) {
            throw new Error(
              result.error || `Failed to create stock item for shop ${shopId}`,
            );
          }

          return result;
        });

        await Promise.all(createPromises);
      }

      // Success
      setSuccessMessage("Stock item(s) updated successfully!");

      // Redirect after a delay
      setTimeout(() => {
        router.push("/owner/inventory/stocks");
      }, 2000);
    } catch (error) {
      console.error("Error updating stock:", error);
      setError(
        error instanceof Error ? error.message : "Failed to update stock item",
      );
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoadingStock) {
    return (
      <div className="flex h-screen bg-gray-50">
        <Sidebar
          activeItem={activeItem}
          onItemClick={(item) => setActiveItem(item.id)}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          isCartModalOpen={isCartModalOpen}
        />
        <div className="flex-1 flex flex-col overflow-hidden">
          <TopNavBar onCartModalStateChange={setIsCartModalOpen} />
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-4 text-gray-600">Loading stock data...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar
        activeItem={activeItem}
        onItemClick={(item) => setActiveItem(item.id)}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        isCartModalOpen={isCartModalOpen}
      />

      <div className="flex-1 flex flex-col">
        {/* Top Navigation Bar */}
        <TopNavBar onCartModalStateChange={setIsCartModalOpen} />

        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <button
                title="Go back to stock list"
                onClick={() => router.back()}
                className="mr-4 p-2 hover:bg-gray-100 rounded-md"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <h1 className="text-2xl font-semibold text-gray-900">
                Edit Stock Entry
              </h1>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <main className="flex-1">
          <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {/* Success Message */}
            {successMessage && (
              <div className="mb-6 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-md">
                {successMessage}
              </div>
            )}

            {/* Group Image Section */}
            <div className="bg-white rounded-lg shadow mb-6">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-medium text-gray-900">
                  Group Image
                </h2>
              </div>
              <div className="p-6">
                <ImageUpload
                  value={groupImage}
                  onChange={setGroupImage}
                  folder="pos-clothing-store/groups"
                  placeholder="Upload group image"
                />
              </div>
            </div>

            {/* Group Info Section */}
            <div className="bg-white rounded-lg shadow mb-6">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-medium text-gray-900">
                  Group Info
                </h2>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Group Name
                    </label>
                    <input
                      type="text"
                      value={groupName}
                      onChange={(e) => setGroupName(e.target.value)}
                      placeholder="Enter group name"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Category
                    </label>
                    <div className="flex gap-2">
                      <select
                        title="Category"
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
                      >
                        <option value="">Select Category</option>
                        {categories.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => setShowCategoryModal(true)}
                        className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 whitespace-nowrap"
                      >
                        + Add New
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Unit Price ({currencySymbol})
                    </label>
                    <input
                      type="number"
                      value={unitPrice}
                      onChange={(e) => setUnitPrice(e.target.value)}
                      placeholder="Enter unit price"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Original Price ({currencySymbol})
                    </label>
                    <input
                      type="number"
                      value={originalPrice}
                      onChange={(e) => setOriginalPrice(e.target.value)}
                      placeholder="Enter original price"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Release Date
                    </label>
                    <input
                      title="Select release date"
                      type="date"
                      value={releaseDate}
                      onChange={(e) => setReleaseDate(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Shops ({selectedShops.length} selected)
                    </label>
                    <div className="w-full px-3 py-2 border border-gray-300 rounded-md focus-within:ring-blue-500 focus-within:border-blue-500 bg-white min-h-[42px] max-h-40 overflow-y-auto">
                      {isLoadingShops ? (
                        <div className="text-gray-500 text-sm">
                          Loading shops...
                        </div>
                      ) : shops && shops.length > 0 ? (
                        <div className="space-y-2">
                          {shops.map((shop) => (
                            <label
                              key={shop.id}
                              className="flex items-center cursor-pointer hover:bg-gray-50 p-1 rounded"
                            >
                              <input
                                type="checkbox"
                                checked={selectedShops.includes(shop.id)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedShops((prev) => [
                                      ...prev,
                                      shop.id,
                                    ]);
                                  } else {
                                    setSelectedShops((prev) =>
                                      prev.filter((id) => id !== shop.id),
                                    );
                                  }
                                }}
                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 mr-2"
                              />
                              <span className="text-sm text-gray-900">
                                {shop.name}
                              </span>
                            </label>
                          ))}
                        </div>
                      ) : (
                        <div className="text-gray-500 text-sm">
                          No shops available
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="mt-6">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={isColorless}
                      onChange={(e) => setIsColorless(e.target.checked)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="ml-2 text-sm text-gray-700">
                      Is colorless stock?
                    </span>
                  </label>
                </div>
              </div>
            </div>

            {/* Wholesale Pricing Tiers Section */}
            <div className="bg-white rounded-lg shadow mb-6">
              <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                <h2 className="text-lg font-medium text-gray-900">
                  Wholesale Pricing Tiers
                </h2>
                <Button
                  onClick={addWholesaleTier}
                  className="flex items-center"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Tier
                </Button>
              </div>
              <div className="p-6">
                {wholesaleTiers.length === 0 ? (
                  <div className="text-center py-8">
                    <DollarSign className="mx-auto h-12 w-12 text-gray-400" />
                    <p className="mt-4 text-gray-500">No wholesale tiers</p>
                    <p className="text-sm text-gray-400">
                      Get started by adding your first wholesale pricing tier.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {wholesaleTiers.map((tier) => (
                      <div
                        key={tier.id}
                        className="flex items-center space-x-4 p-4 border border-gray-200 rounded-lg"
                      >
                        <div className="flex-1">
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Min Quantity
                          </label>
                          <input
                            aria-label="Enter minimum quantity"
                            type="number"
                            value={tier.minQuantity}
                            onChange={(e) =>
                              updateWholesaleTier(
                                tier.id,
                                "minQuantity",
                                parseInt(e.target.value) || 0,
                              )
                            }
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
                          />
                        </div>
                        <div className="flex-1">
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Price ({currencySymbol})
                          </label>
                          <input
                            aria-label="Enter price"
                            type="number"
                            value={tier.price}
                            onChange={(e) =>
                              updateWholesaleTier(
                                tier.id,
                                "price",
                                parseFloat(e.target.value) || 0,
                              )
                            }
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
                          />
                        </div>
                        <button
                          title="Remove wholesale tier"
                          onClick={() => removeWholesaleTier(tier.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-md"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Color Variants Section */}
            {!isColorless && (
              <div className="bg-white rounded-lg shadow mb-6">
                <div className="px-6 py-4 border-b border-gray-200">
                  <h2 className="text-lg font-medium text-gray-900">
                    Color Variants
                  </h2>
                </div>
                <div className="p-6">
                  {colorVariants.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-gray-500">
                        No color variants added yet. Click &quot;+ Add
                        Variant&quot; to begin.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {colorVariants.map((variant) => (
                        <div
                          key={variant.id}
                          className="p-4 border border-gray-200 rounded-lg"
                        >
                          <div className="flex items-start justify-between mb-4">
                            <h3 className="text-sm font-medium text-gray-700">
                              Variant #{variant.id.slice(-4)}
                            </h3>
                            <button
                              aria-label="Remove color variant"
                              onClick={() => removeColorVariant(variant.id)}
                              className="p-1 text-red-600 hover:bg-red-50 rounded-md"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>

                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Left side - Image Upload */}
                            <div>
                              <ImageUpload
                                value={variant.image || ""}
                                onChange={(url) =>
                                  handleImageUpload(variant.id, url)
                                }
                                folder="pos-clothing-store/variants"
                                placeholder="Upload variant image"
                                className="h-48"
                              />
                            </div>

                            {/* Right side - Form Fields */}
                            <div className="space-y-4">
                              {/* Color Detection Display */}
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                  Color
                                </label>
                                <div className="flex items-center space-x-3">
                                  <input
                                    aria-label="Select color code"
                                    type="color"
                                    value={variant.colorCode}
                                    onChange={(e) =>
                                      updateColorVariant(
                                        variant.id,
                                        "colorCode",
                                        e.target.value,
                                      )
                                    }
                                    className="w-10 h-10 border-gray-300"
                                  />

                                  {/* Display Barcode */}
                                  <div className="flex-1">
                                    <label className="sr-only">Barcode</label>
                                    <div className="flex gap-2">
                                      <input
                                        type="text"
                                        value={variant.barcode}
                                        onChange={(e) =>
                                          updateColorVariant(
                                            variant.id,
                                            "barcode",
                                            e.target.value,
                                          )
                                        }
                                        placeholder="Enter EAN-13 Barcode"
                                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
                                      />
                                      <button
                                        type="button"
                                        onClick={() =>
                                          generateBarcode(variant.id)
                                        }
                                        className="p-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
                                        title="Generate barcode automatically"
                                      >
                                        <BarChart3 className="w-4 h-4" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => scanBarcode(variant.id)}
                                        className="p-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
                                        title="Scan existing barcode"
                                      >
                                        <ScanLine className="w-4 h-4" />
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* Detected Colors Display */}
                              {detectedColors[variant.id] &&
                                detectedColors[variant.id].length > 0 && (
                                  <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                      Detected Colors
                                    </label>
                                    <div className="flex flex-wrap gap-2">
                                      {detectedColors[variant.id].map(
                                        (color, index) => (
                                          <button
                                            key={index}
                                            type="button"
                                            onClick={() =>
                                              updateColorVariant(
                                                variant.id,
                                                "colorCode",
                                                color,
                                              )
                                            }
                                            className="w-8 h-8 rounded-full border-2 border-gray-300 hover:border-gray-500 transition-colors shadow-sm hover:shadow-md"
                                            style={{ backgroundColor: color }}
                                            title={`Use color ${color}`}
                                            aria-label={`Select detected color ${color}`}
                                          />
                                        ),
                                      )}
                                    </div>
                                  </div>
                                )}

                              {/* Size Selector */}
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                  Available Sizes
                                </label>
                                <div className="flex flex-wrap items-center gap-2 mb-3">
                                  {availableSizes.map((size) => {
                                    const isSelected =
                                      variant.sizeQuantities.some(
                                        (sq) => sq.size === size,
                                      );
                                    return (
                                      <button
                                        key={size}
                                        type="button"
                                        onClick={() => {
                                          if (isSelected) {
                                            removeSizeFromVariant(
                                              variant.id,
                                              size,
                                            );
                                          } else {
                                            addSizeToVariant(variant.id, size);
                                          }
                                        }}
                                        className={`flex items-center justify-center px-3 py-2 border border-gray-300 rounded-md cursor-pointer transition-colors min-h-[38px] ${
                                          isSelected
                                            ? "bg-blue-500 border-blue-500 text-white font-semibold"
                                            : "bg-white border-gray-300 text-gray-500 hover:bg-gray-50 hover:border-gray-400"
                                        }`}
                                      >
                                        <span className="text-sm font-semibold">
                                          {size}
                                        </span>
                                      </button>
                                    );
                                  })}
                                </div>

                                {/* Quantity inputs for selected sizes - grid 4 per row */}
                                {variant.sizeQuantities.length > 0 && (
                                  <div>
                                    <h4 className="text-sm font-medium text-gray-700 mb-2">
                                      Quantities by Size
                                    </h4>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                      {variant.sizeQuantities.map((sizeQty) => (
                                        <div
                                          key={sizeQty.size}
                                          className="flex items-center space-x-2 p-2 "
                                        >
                                          <span className="text-sm font-medium text-gray-600 w-12">
                                            {sizeQty.size}:
                                          </span>
                                          <input
                                            type="number"
                                            min="0"
                                            value={sizeQty.quantity}
                                            onChange={(e) =>
                                              updateSizeQuantity(
                                                variant.id,
                                                sizeQty.size,
                                                parseInt(e.target.value) || 0,
                                              )
                                            }
                                            className="w-16 px-2 py-1 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
                                            placeholder="0"
                                          />
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <Button
                  variant="outline"
                  onClick={handleMultipleImageUpload}
                  disabled={isUploadingMultiple}
                  className="flex items-center"
                >
                  {isUploadingMultiple ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
                      {uploadProgress.total > 0
                        ? `Uploading ${uploadProgress.current}/${uploadProgress.total}`
                        : "Uploading..."}
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4 mr-2" />
                      Multiple
                    </>
                  )}
                </Button>
                {!isColorless && (
                  <Button
                    variant="outline"
                    onClick={addColorVariant}
                    className="flex items-center"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    New
                  </Button>
                )}
              </div>
              <div className="flex flex-col items-end space-y-2">
                {error && (
                  <div className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-md border border-red-200">
                    {error}
                  </div>
                )}
                <Button
                  onClick={handleUpdateStock}
                  disabled={isLoading}
                  className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? "Updating..." : "Update Stock Entry"}
                </Button>
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* Add Category Modal */}
      {showCategoryModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4 text-gray-900">
              Add New Category
            </h3>

            {/* Current Categories List */}
            <div className="mb-4">
              <h4 className="text-sm font-medium text-gray-700 mb-2">
                Current Categories
              </h4>
              <div className="space-y-2 max-h-48 overflow-y-auto border border-gray-200 rounded-md p-2">
                {categories.length === 0 ? (
                  <p className="text-gray-500 text-center py-2 text-sm">
                    No categories available
                  </p>
                ) : (
                  categories.map((cat) => (
                    <div
                      key={cat}
                      className="flex items-center justify-between p-2 bg-gray-50 rounded-md hover:bg-gray-100"
                    >
                      <span className="text-gray-900 text-sm">{cat}</span>
                      <button
                        onClick={async () => {
                          if (
                            confirm(
                              `Are you sure you want to delete "${cat}" category?`,
                            )
                          ) {
                            try {
                              const updatedCategories =
                                await CategoryService.deleteCategory(cat);
                              setCategories(updatedCategories);
                              if (category === cat) {
                                setCategory("");
                              }
                            } catch (error) {
                              console.error("Error deleting category:", error);
                              alert(
                                "Failed to delete category. Please try again.",
                              );
                            }
                          }
                        }}
                        className="px-2 py-1 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 rounded-md transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Add New Category Input */}
            <div className="mb-4">
              <h4 className="text-sm font-medium text-gray-700 mb-2">
                Add New Category
              </h4>
              <input
                type="text"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="Enter category name"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
                onKeyDown={async (e) => {
                  if (e.key === "Enter") {
                    if (
                      newCategoryName.trim() &&
                      !categories.includes(newCategoryName.trim())
                    ) {
                      try {
                        const updatedCategories =
                          await CategoryService.addCategory(
                            newCategoryName.trim(),
                          );
                        setCategories(updatedCategories);
                        setCategory(newCategoryName.trim());
                        setNewCategoryName("");
                      } catch (error) {
                        console.error("Error adding category:", error);
                        alert("Failed to add category. Please try again.");
                      }
                    }
                  }
                }}
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={async () => {
                  if (
                    newCategoryName.trim() &&
                    !categories.includes(newCategoryName.trim())
                  ) {
                    try {
                      const updatedCategories =
                        await CategoryService.addCategory(
                          newCategoryName.trim(),
                        );
                      setCategories(updatedCategories);
                      setCategory(newCategoryName.trim());
                      setNewCategoryName("");
                    } catch (error) {
                      console.error("Error adding category:", error);
                      alert("Failed to add category. Please try again.");
                    }
                  }
                }}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                disabled={
                  !newCategoryName.trim() ||
                  categories.includes(newCategoryName.trim())
                }
              >
                Add Category
              </button>
              <button
                onClick={() => {
                  setNewCategoryName("");
                  setShowCategoryModal(false);
                }}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function EditStockPage() {
  return (
    <ProtectedRoute requiredRole={["owner", "manager"]}>
      <EditStockContent />
    </ProtectedRoute>
  );
}
