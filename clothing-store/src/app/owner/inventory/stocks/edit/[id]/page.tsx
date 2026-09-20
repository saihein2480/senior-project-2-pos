"use client";

import { toast } from "react-hot-toast";
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

              // Show feedback if colors were detected
              if (extractedColors && extractedColors.length > 0) {
                toast.success(`Detected ${extractedColors.length} colors`);
              } else {
                toast.success(
                  "No colors detected. You can manually enter a color code.",
                );
              }
            } catch (error) {
              console.error(
                "Failed to extract colors from uploaded image:",
                error,
              );
              toast.error(
                "Could not analyze image for colors. Please enter color manually.",
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

        // Show feedback
        if (extractedColors && extractedColors.length > 0) {
          toast.success(`Detected ${extractedColors.length} colors`);
        } else {
          toast.success(
            "No colors detected. You can manually enter a color code.",
          );
        }
      } catch (error) {
        console.error("Failed to extract colors from image:", error);
        toast.error(
          "Could not analyze image for colors. Please enter color manually.",
        );
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
              <button id="manual-submit" class="px-4 py-2 bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 text-white rounded">OK</button>
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
    <div className="flex min-h-screen bg-white">
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
        <div className="bg-white border-b border-gray-200 px-3 md:px-4 lg:px-6 py-3 md:py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <button
                title="Go back to stock list"
                onClick={() => router.back()}
                className="mr-2 md:mr-4 p-2 hover:bg-gray-100 rounded-md touch-manipulation"
              >
                <ArrowLeft className="h-5 w-5 md:h-6 md:w-6 text-gray-600" />
              </button>
              <h1 className="text-lg md:text-xl lg:text-2xl font-semibold text-gray-900">
                Edit Stock Entry
              </h1>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-screen-2xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-4 md:py-6 lg:py-8">
            {/* Success Message */}
            {successMessage && (
              <div className="mb-6 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-md">
                {successMessage}
              </div>
            )}

            {/* Group Image and Info Section - Side by Side */}
            <div className="bg-white rounded-lg shadow mb-4 md:mb-6">
              <div className="px-4 md:px-6 py-3 md:py-4 border-b border-gray-200">
                <h2 className="text-base md:text-lg font-medium text-gray-900">
                  Group Details
                </h2>
              </div>
              <div className="p-4 md:p-6">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Left - Group Image */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Group Image
                    </label>
                    <ImageUpload
                      value={groupImage}
                      onChange={setGroupImage}
                      folder="pos-clothing-store/groups"
                      placeholder="Upload group image"
                    />
                  </div>

                  {/* Right - Group Info (spans 2 columns) */}
                  <div className="lg:col-span-2">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Group Name
                        </label>
                        <input
                          type="text"
                          value={groupName}
                          onChange={(e) => setGroupName(e.target.value)}
                          placeholder="Enter group name"
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-cyan-400 focus:border-blue-500 text-gray-900 bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Category
                        </label>
                        <div className="flex gap-2">
                          <select
                            title="category"
                            value={category}
                            onChange={(e) => setCategory(e.target.value)}
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-cyan-400 focus:border-blue-500 text-gray-900 bg-white"
                          >
                            <option value="">Select category</option>
                            {categories.map((cat) => (
                              <option key={cat} value={cat}>
                                {cat}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => setShowCategoryModal(true)}
                            className="px-3 md:px-4 py-2 bg-gray-100 text-gray-700 text-sm md:text-base rounded-md hover:bg-gray-200 focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 whitespace-nowrap touch-manipulation"
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
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-cyan-400 focus:border-blue-500 text-gray-900 bg-white"
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
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-cyan-400 focus:border-blue-500 text-gray-900 bg-white"
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
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-cyan-400 focus:border-blue-500 text-gray-900 bg-white"
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
                                    className="rounded border-gray-300 text-cyan-600 focus:ring-cyan-400 mr-2"
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
                          className="rounded border-gray-300 text-cyan-600 focus:ring-cyan-400"
                        />
                        <span className="ml-2 text-sm text-gray-700">
                          Is colorless stock?
                        </span>
                      </label>
                    </div>
                  </div>
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
                  className="flex items-center bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 text-white shadow-md"
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
                            value={
                              tier.minQuantity === 0 ? "" : tier.minQuantity
                            }
                            onChange={(e) =>
                              updateWholesaleTier(
                                tier.id,
                                "minQuantity",
                                e.target.value === ""
                                  ? 0
                                  : parseInt(e.target.value, 10),
                              )
                            }
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-cyan-400 focus:border-blue-500 text-gray-900 bg-white"
                          />
                        </div>
                        <div className="flex-1">
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Price ({currencySymbol})
                          </label>
                          <input
                            aria-label="Enter price"
                            type="number"
                            value={tier.price === 0 ? "" : tier.price}
                            onChange={(e) =>
                              updateWholesaleTier(
                                tier.id,
                                "price",
                                e.target.value === ""
                                  ? 0
                                  : parseFloat(e.target.value),
                              )
                            }
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-cyan-400 focus:border-blue-500 text-gray-900 bg-white"
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
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 mb-6 overflow-hidden">
                <div className="px-4 sm:px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-pink-50 to-rose-50">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-1.5 h-8 bg-gradient-to-b from-pink-500 to-rose-500 rounded-full shrink-0"></div>
                      <div className="min-w-0">
                        <h2 className="text-lg font-semibold text-gray-900 truncate">
                          Color Variants
                        </h2>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {colorVariants.length} {colorVariants.length === 1 ? 'variant' : 'variants'}
                        </p>
                      </div>
                    </div>
                    {colorVariants.length > 0 && (
                      <button
                        type="button"
                        onClick={addColorVariant}
                        className="shrink-0 inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 bg-gradient-to-r from-rose-500 to-pink-500 text-white text-sm font-medium rounded-lg hover:from-rose-600 hover:to-pink-600 transition-all shadow-sm hover:shadow-md"
                      >
                        <Plus className="w-4 h-4" />
                        <span className="hidden sm:inline">Add Variant</span>
                        <span className="sm:hidden">Add</span>
                      </button>
                    )}
                  </div>
                </div>
                <div className="p-6 bg-gray-50/50">
                  {colorVariants.length === 0 ? (
                    <div className="text-center py-16 bg-white rounded-xl border-2 border-dashed border-gray-200">
                      <div className="inline-flex items-center justify-center w-16 h-16 bg-pink-100 rounded-2xl mb-4">
                        <Plus className="w-8 h-8 text-pink-600" />
                      </div>
                      <p className="text-gray-700 font-medium text-lg">No color variants added yet</p>
                      <p className="text-sm text-gray-500 mt-1 mb-4">
                        Add colors and sizes to organize your inventory
                      </p>
                      <button
                        onClick={addColorVariant}
                        className="inline-flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-pink-500 to-rose-500 text-white font-medium rounded-lg hover:from-pink-600 hover:to-rose-600 transition-all shadow-md hover:shadow-lg"
                      >
                        <Plus className="w-4 h-4" />
                        Add First Variant
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {colorVariants.map((variant, idx) => (
                        <div
                          key={variant.id}
                          className="bg-white rounded-xl border border-gray-200 hover:border-pink-300 hover:shadow-md transition-all overflow-hidden"
                        >
                          {/* Header */}
                          <div className="px-4 py-3 bg-gradient-to-r from-gray-50 to-white border-b border-gray-100 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div 
                                className="w-8 h-8 rounded-lg border-2 border-white shadow-md ring-2 ring-gray-200" 
                                style={{ backgroundColor: variant.colorCode }}
                              ></div>
                              <div>
                                <h3 className="text-sm font-semibold text-gray-900">
                                  Color #{idx + 1}
                                </h3>
                                {variant.color && (
                                  <p className="text-xs text-gray-500 font-medium">
                                    {variant.color}
                                  </p>
                                )}
                              </div>
                            </div>
                            <button
                              aria-label="Remove color variant"
                              onClick={() => removeColorVariant(variant.id)}
                              className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors group"
                            >
                              <X className="h-4 w-4 group-hover:scale-110 transition-transform" />
                            </button>
                          </div>

                          {/* Content */}
                          <div className="p-4 sm:p-5">
                            {/* Stacks below lg: the barcode row and quantity
                                grid need real width, and a 12-column split at
                                md squeezed them badly. */}
                            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                              {/* Image Upload */}
                              <div className="lg:col-span-3 min-w-0">
                                <label className="block text-xs font-semibold text-gray-700 mb-2 uppercase tracking-wide">
                                  Variant Image
                                </label>
                                <ImageUpload
                                  value={variant.image || ""}
                                  onChange={(url) =>
                                    handleImageUpload(variant.id, url)
                                  }
                                  folder="pos-clothing-store/variants"
                                  placeholder="Upload"
                                />
                              </div>

                              {/* Colour code (left) + available sizes (right),
                                  with stock quantities full width underneath */}
                              <div className="lg:col-span-9 min-w-0 space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  {/* Left column */}
                                  <div className="min-w-0 space-y-4">
                                {/* Color Code */}
                                <div>
                                  <label className="block text-xs font-semibold text-gray-700 mb-2 uppercase tracking-wide">
                                    Color Code
                                  </label>
                                  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
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
                                      className="w-12 h-12 shrink-0 border-2 border-white rounded-lg cursor-pointer shadow-sm ring-2 ring-gray-200 hover:ring-pink-300 transition-all"
                                    />
                                    <div className="flex-1 min-w-0">
                                      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                                        Hex Value
                                      </div>
                                      <div className="text-sm font-mono font-bold text-gray-900">
                                        {variant.colorCode}
                                      </div>
                                    </div>
                                  </div>
                                </div>

                                {/* Detected Colors */}
                                {detectedColors[variant.id] &&
                                  detectedColors[variant.id].length > 0 && (
                                    <div>
                                      <label className="block text-xs font-semibold text-gray-700 mb-2 uppercase tracking-wide">
                                        Detected Colors
                                      </label>
                                      <div className="flex flex-wrap gap-2 p-3 bg-pink-50 rounded-lg border border-pink-100">
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
                                              className="w-10 h-10 rounded-lg border-2 border-white shadow-sm ring-2 ring-pink-200 hover:ring-pink-400 hover:scale-110 transition-all cursor-pointer"
                                              style={{ backgroundColor: color }}
                                              title={`Use color ${color}`}
                                              aria-label={`Select detected color ${color}`}
                                            />
                                          ),
                                        )}
                                      </div>
                                    </div>
                                  )}

                                {/* Barcode */}
                                {/* <div>
                                  <label className="block text-xs font-semibold text-gray-700 mb-2 uppercase tracking-wide">
                                    EAN-13 Barcode
                                  </label>
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
                                      placeholder="Enter or scan barcode"
                                      className="flex-1 min-w-0 px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent text-gray-900 bg-white text-sm transition-all font-mono"
                                    />
                                    <button
                                      type="button"
                                      onClick={() =>
                                        generateBarcode(variant.id)
                                      }
                                      className="shrink-0 p-2.5 border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 hover:border-gray-400 focus:ring-2 focus:ring-pink-500 transition-all group"
                                      title="Generate barcode automatically"
                                    >
                                      <BarChart3 className="w-5 h-5 group-hover:scale-110 transition-transform" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => scanBarcode(variant.id)}
                                      className="shrink-0 p-2.5 border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 hover:border-gray-400 focus:ring-2 focus:ring-pink-500 transition-all group"
                                      title="Scan existing barcode"
                                    >
                                      <ScanLine className="w-5 h-5 group-hover:scale-110 transition-transform" />
                                    </button>
                                  </div>
                                </div> */}
                                  </div>

                                  {/* Right column */}
                                  <div className="min-w-0">
                                    <label className="block text-xs font-semibold text-gray-700 mb-2 uppercase tracking-wide">
                                      Available Sizes
                                    </label>
                                    <div className="flex flex-wrap gap-1.5 p-3 bg-gray-50 rounded-lg border border-gray-200">
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
                                            className={`px-3 py-1.5 border-2 text-xs font-bold rounded-lg cursor-pointer transition-all ${
                                              isSelected
                                                ? "bg-gradient-to-r from-pink-500 to-rose-500 border-pink-500 text-white shadow-md scale-105"
                                                : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400 hover:scale-105"
                                            }`}
                                          >
                                            {size}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                </div>

                                {/* Quantity Inputs */}
                                {variant.sizeQuantities.length > 0 && (
                                  <div>
                                    <label className="block text-xs font-semibold text-gray-700 mb-2 uppercase tracking-wide">
                                      Stock Quantities
                                    </label>
                                    <div className="grid grid-cols-6 gap-2 p-3 bg-gradient-to-br from-pink-50 to-rose-50 rounded-lg border border-pink-100">
                                      {variant.sizeQuantities.map((sizeQty) => (
                                        <div
                                          key={sizeQty.size}
                                          className="flex flex-col p-2.5 bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-shadow"
                                        >
                                          <span className="text-xs font-bold text-gray-600 mb-1.5 uppercase">
                                            {sizeQty.size}
                                          </span>
                                          <input
                                            type="number"
                                            min="0"
                                            value={
                                              sizeQty.quantity === 0
                                                ? ""
                                                : sizeQty.quantity
                                            }
                                            onChange={(e) =>
                                              updateSizeQuantity(
                                                variant.id,
                                                sizeQty.size,
                                                e.target.value === ""
                                                  ? 0
                                                  : parseInt(
                                                      e.target.value,
                                                      10,
                                                    ),
                                              )
                                            }
                                            className="w-full px-2 py-1.5 border-2 border-gray-300 rounded-md focus:ring-2 focus:ring-pink-500 focus:border-pink-500 text-gray-900 bg-white text-sm font-semibold text-center transition-all"
                                            placeholder="0"
                                            title={sizeQty.quantity > 0 ? `Quantity: ${sizeQty.quantity}` : "Enter quantity"}
                                          />
                                        </div>
                                      ))}
                                    </div>
                                    <div className="mt-2 px-3 py-2 bg-pink-50 rounded-lg border border-pink-100">
                                      <div className="flex items-center justify-between text-xs">
                                        <span className="font-semibold text-pink-900">Total Stock:</span>
                                        <span className="font-bold text-pink-700 text-sm">
                                          {variant.sizeQuantities.reduce((sum, sq) => sum + sq.quantity, 0)} units
                                        </span>
                                      </div>
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
                      Multiple Images
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
                    New Variant
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
                  className="bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Updating...
                    </>
                  ) : (
                    "Update Stock Entry"
                  )}
                </Button>
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* Add Category Modal */}
      {showCategoryModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4 text-gray-900">
              Manage Categories
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
                              toast.error(
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
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-cyan-400 focus:border-blue-500 text-gray-900 bg-white"
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
                        toast.error(
                          "Failed to add category. Please try again.",
                        );
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
                      toast.error("Failed to add category. Please try again.");
                    }
                  }
                }}
                className="flex-1 px-4 py-2 bg-gradient-to-r from-rose-500 to-pink-500 text-white rounded-md hover:from-rose-600 hover:to-pink-600 disabled:opacity-50"
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
