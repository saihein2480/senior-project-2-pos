"use client";

import { useState, useEffect, useMemo, useRef, type ReactNode } from "react";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { usePermissions } from "@/hooks/usePermissions";
import { useSettings } from "@/contexts/SettingsContext";
import { Sidebar } from "@/components/ui/Sidebar";
import { TopNavBar } from "@/components/ui/TopNavBar";
import { Button } from "@/components/ui/Button";
import {
  Building2,
  Clock,
  MapPin,
  Phone,
  Plus,
  RefreshCw,
  Pencil,
  Trash2,
  Loader2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Search,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  Shop,
  CreateShopRequest,
  UpdateShopRequest,
  ShopListResponse,
  ShopResponse,
} from "@/types/shop";
import { authFetch } from "@/lib/authFetch";

const EMPTY_FORM = {
  name: "",
  address: "",
  primaryPhone: "",
  secondaryPhone: "",
  township: "",
  city: "",
  openingHours: "",
};

const PAGE_SIZE_OPTIONS = [6, 9, 12, 24];

/** Shared input styling; red border and tint when the field has an error. */
const inputClass = (hasError: boolean, withIcon = true) =>
  `w-full ${withIcon ? "pl-10" : "pl-3.5"} pr-3.5 py-2.5 rounded-xl border bg-white text-sm text-gray-900 placeholder-gray-400 shadow-sm transition-all focus:outline-none focus:ring-4 ${
    hasError
      ? "border-red-300 bg-red-50/40 focus:border-red-400 focus:ring-red-100"
      : "border-gray-200 hover:border-gray-300 focus:border-rose-400 focus:ring-rose-100"
  }`;

/** Label, icon slot, error and hint around one form control. */
function Field({
  id,
  label,
  required = false,
  optional = false,
  icon: Icon,
  error,
  hint,
  alignIconTop = false,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  optional?: boolean;
  icon?: LucideIcon;
  error?: string;
  hint?: string;
  alignIconTop?: boolean;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-gray-800">
        {label}
        {required && <span className="ml-0.5 text-rose-500">*</span>}
        {optional && <span className="ml-1 font-normal text-gray-400">(Optional)</span>}
      </label>
      <div className="relative">
        {Icon && (
          <Icon
            className={`pointer-events-none absolute left-3.5 h-4 w-4 text-gray-400 ${
              alignIconTop ? "top-3.5" : "top-1/2 -translate-y-1/2"
            }`}
            aria-hidden="true"
          />
        )}
        {children}
      </div>
      {error ? (
        <p className="mt-1.5 text-xs font-medium text-red-600">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-gray-500">{hint}</p>
      ) : null}
    </div>
  );
}

function ShopManagementContent() {
  const permissions = usePermissions();
  const { branch: workingBranch, defaultBranch } = useSettings();
  const [activeMenuItem, setActiveMenuItem] = useState("manage-shops");
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isCartModalOpen, setIsCartModalOpen] = useState(false);

  // Form state
  // Track if all shops are deleted to trigger settings refresh
  const [wasEmpty, setWasEmpty] = useState(false);
  const [formData, setFormData] = useState(EMPTY_FORM);

  // API state
  const [shops, setShops] = useState<Shop[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Edit mode state
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingShopId, setEditingShopId] = useState<string | null>(null);

  // Dialogs
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [deletingShop, setDeletingShop] = useState<Shop | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  // Search & pagination state
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(9);

  // Fetch shops on component mount
  useEffect(() => {
    fetchShops();
  }, []);

  // API Functions
  const fetchShops = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await authFetch("/api/shops");
      const data: ShopListResponse = await response.json();

      if (data.success && data.data) {
        setShops(data.data);
      } else {
        setError(data.error || "Failed to fetch shops");
      }
    } catch (err) {
      setError("Failed to fetch shops");
      console.error("Error fetching shops:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const createShop = async (shopData: CreateShopRequest) => {
    try {
      setIsSubmitting(true);
      setFormErrors({});

      const response = await authFetch("/api/shops", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(shopData),
      });

      const data: ShopResponse = await response.json();

      if (data.success && data.data) {
        setShops((prev) => [...prev, data.data!]);
        // Reset form
        setFormData(EMPTY_FORM);
        return true;
      } else {
        setError(data.error || "Failed to create shop");
        return false;
      }
    } catch (err) {
      setError("Failed to create shop");
      console.error("Error creating shop:", err);
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  const deleteShop = async (id: string) => {
    try {
      const response = await authFetch(`/api/shops/${id}`, {
        method: "DELETE",
      });

      const data: ShopResponse = await response.json();

      if (data.success) {
        setShops((prevShops) => {
          const updatedShops = prevShops.filter((shop) => shop.id !== id);
          // If this deletion results in zero shops, set currentBranch to 'No Branch' in backend
          if (updatedShops.length === 0) {
            authFetch("/api/settings", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ currentBranch: "No Branch" }),
            }).finally(() => {
              if (typeof window !== "undefined" && window.dispatchEvent) {
                window.dispatchEvent(new CustomEvent("refreshSettings"));
              }
            });
          }
          return updatedShops;
        });
        return true;
      } else {
        setError(data.error || "Failed to delete shop");
        return false;
      }
    } catch (err) {
      setError("Failed to delete shop");
      console.error("Error deleting shop:", err);
      return false;
    }
  };
  // Effect: when shops become empty, trigger settings refresh (outside render)
  useEffect(() => {
    // Only track wasEmpty for UI logic, not for backend update
    if (shops.length === 0 && !wasEmpty) {
      setWasEmpty(true);
    } else if (shops.length > 0 && wasEmpty) {
      setWasEmpty(false);
    }
  }, [shops, wasEmpty]);

  const updateShop = async (id: string, shopData: UpdateShopRequest) => {
    try {
      setIsSubmitting(true);
      const response = await authFetch(`/api/shops/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(shopData),
      });

      const data: ShopResponse = await response.json();

      if (data.success && data.data) {
        setShops((prev) =>
          prev.map((shop) => (shop.id === id ? data.data! : shop))
        );
        return true;
      } else {
        setError(data.error || "Failed to update shop");
        return false;
      }
    } catch (err) {
      setError("Failed to update shop");
      console.error("Error updating shop:", err);
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
    // Clear field error when user starts typing
    if (formErrors[field]) {
      setFormErrors((prev) => ({
        ...prev,
        [field]: "",
      }));
    }
  };

  const validateForm = () => {
    const errors: Record<string, string> = {};

    if (!formData.name.trim()) {
      errors.name = "Shop name is required";
    }

    if (!formData.address.trim()) {
      errors.address = "Address is required";
    }

    if (!formData.primaryPhone.trim()) {
      errors.primaryPhone = "Primary phone is required";
    } else if (!/^\d{7,17}$/.test(formData.primaryPhone.trim())) {
      errors.primaryPhone = "Invalid phone format. Must be 7-17 digits";
    }

    // secondaryPhone is optional, but if provided, must match format
    if (
      formData.secondaryPhone.trim() &&
      !/^\d{7,17}$/.test(formData.secondaryPhone.trim())
    ) {
      errors.secondaryPhone = "Invalid phone format. Must be 7-17 digits";
    }

    if (!formData.township.trim()) {
      errors.township = "Township is required";
    }

    if (!formData.city.trim()) {
      errors.city = "City is required";
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleAddShop = async () => {
    // Doc: "Add New Shop" - Owner only.
    if (!permissions.canManageShops) {
      setError("Only the owner can add shops.");
      return;
    }

    if (!validateForm()) {
      return;
    }

    // Only include secondaryPhone if it is non-empty after trim
    let shopData: CreateShopRequest = {
      name: formData.name.trim(),
      address: formData.address.trim(),
      primaryPhone: formData.primaryPhone.trim(),
      township: formData.township.trim(),
      city: formData.city.trim(),
    };
    const secondaryPhoneTrimmed = formData.secondaryPhone.trim();
    if (secondaryPhoneTrimmed) {
      shopData = {
        ...shopData,
        secondaryPhone: secondaryPhoneTrimmed,
      };
    }
    const openingHoursTrimmed = formData.openingHours.trim();
    if (openingHoursTrimmed) {
      shopData = {
        ...shopData,
        openingHours: openingHoursTrimmed,
      };
    }

    const created = await createShop(shopData);
    if (created) {
      setIsFormOpen(false);
      // Show the new shop: it is added at the end of the list.
      setSearchTerm("");
      setCurrentPage(Math.max(1, Math.ceil((shops.length + 1) / rowsPerPage)));
    }
  };

  /** Ask before deleting (dialog below). */
  const handleDeleteShop = (shop: Shop) => {
    // Doc: "Delete Shop" - Owner only.
    if (!permissions.canManageShops) {
      setError("Only the owner can delete shops.");
      return;
    }
    setError(null);
    setDeletingShop(shop);
  };

  const confirmDeleteShop = async () => {
    if (!deletingShop) return;
    setIsDeleting(true);
    const deleted = await deleteShop(deletingShop.id);
    setIsDeleting(false);
    if (deleted) setDeletingShop(null);
  };

  const handleRefresh = () => {
    fetchShops();
  };

  const openAddForm = () => {
    if (!permissions.canManageShops) {
      setError("Only the owner can add shops.");
      return;
    }
    setIsEditMode(false);
    setEditingShopId(null);
    setFormData(EMPTY_FORM);
    setFormErrors({});
    setError(null);
    setIsFormOpen(true);
  };

  const handleEditShop = (shop: Shop) => {
    setFormData({
      name: shop.name,
      address: shop.address,
      primaryPhone: shop.primaryPhone,
      secondaryPhone: shop.secondaryPhone || "",
      township: shop.township,
      city: shop.city,
      openingHours: shop.openingHours || "",
    });
    setIsEditMode(true);
    setEditingShopId(shop.id);
    setFormErrors({});
    setError(null);
    setIsFormOpen(true);
  };

  const handleUpdateShop = async () => {
    if (!validateForm() || !editingShopId) {
      return;
    }

    const shopData: UpdateShopRequest = {
      name: formData.name.trim(),
      address: formData.address.trim(),
      primaryPhone: formData.primaryPhone.trim(),
      secondaryPhone: formData.secondaryPhone.trim() || undefined,
      township: formData.township.trim(),
      city: formData.city.trim(),
      openingHours: formData.openingHours.trim() || undefined,
    };

    const success = await updateShop(editingShopId, shopData);
    if (success) {
      handleCancelEdit();
    }
  };

  const handleCancelEdit = () => {
    setIsEditMode(false);
    setEditingShopId(null);
    setFormData(EMPTY_FORM);
    setFormErrors({});
    setError(null);
    setIsFormOpen(false);
  };

  // Escape closes whichever dialog is open; the form focuses its first field.
  useEffect(() => {
    if (!isFormOpen && !deletingShop) return;
    if (isFormOpen) firstFieldRef.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (deletingShop && !isDeleting) setDeletingShop(null);
      else if (isFormOpen && !isSubmitting) handleCancelEdit();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isFormOpen, deletingShop, isDeleting, isSubmitting]);

  // Search runs on name, address, area and phone numbers.
  const filteredShops = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return shops;
    return shops.filter((shop) =>
      [
        shop.name,
        shop.address,
        shop.township,
        shop.city,
        shop.primaryPhone,
        shop.secondaryPhone,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [shops, searchTerm]);

  // Pagination calculations
  const totalPages = Math.max(1, Math.ceil(filteredShops.length / rowsPerPage));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * rowsPerPage;
  const endIndex = startIndex + rowsPerPage;
  const currentShops = filteredShops.slice(startIndex, endIndex);

  // A delete or a narrower search can leave the page past the end.
  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const pageNumbers = useMemo(() => {
    const maxButtons = 5;
    let start = Math.max(1, safePage - Math.floor(maxButtons / 2));
    const end = Math.min(totalPages, start + maxButtons - 1);
    if (end - start + 1 < maxButtons) start = Math.max(1, end - maxButtons + 1);
    const pages: number[] = [];
    for (let page = start; page <= end; page++) pages.push(page);
    return pages;
  }, [safePage, totalPages]);

  const cityCount = useMemo(
    () => new Set(shops.map((shop) => shop.city.trim().toLowerCase()).filter(Boolean)).size,
    [shops],
  );

  return (
    <div className="min-h-screen bg-canvas flex">
      {/* Desktop Sidebar */}
      <div className="hidden lg:block">
        <Sidebar
          activeItem={activeMenuItem}
          onItemClick={(item) => setActiveMenuItem(item.id)}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          isCartModalOpen={isCartModalOpen}
          className="h-screen"
        />
      </div>

      {/* Mobile Sidebar (overlay) */}
      <Sidebar
        isMobileOpen={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
        activeItem={activeMenuItem}
        onItemClick={(item) => setActiveMenuItem(item.id)}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        isCartModalOpen={isCartModalOpen}
        className="lg:hidden"
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Navigation Bar */}
        <TopNavBar
          onCartModalStateChange={setIsCartModalOpen}
          onMenuToggle={() => setIsMobileSidebarOpen(true)}
        />

        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6">
          <div className="max-w-screen-2xl mx-auto space-y-5">
            {/* Header */}
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-gray-900">
                  Shop Management
                </h1>
                <p className="text-sm text-gray-500">
                  {isLoading
                    ? "Create, edit, and manage your shop locations"
                    : `${shops.length} ${shops.length === 1 ? "shop" : "shops"} across ${cityCount} ${cityCount === 1 ? "city" : "cities"}`}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative flex-1 md:w-72 md:flex-none">
                  <Search
                    className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
                    aria-hidden="true"
                  />
                  <input
                    type="search"
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setCurrentPage(1);
                    }}
                    placeholder="Search shops, areas, phones..."
                    aria-label="Search shops"
                    className="h-10 w-full rounded-xl border border-gray-200 bg-white pl-10 pr-9 text-sm text-gray-900 placeholder-gray-400 shadow-sm focus:border-rose-400 focus:outline-none focus:ring-4 focus:ring-rose-100 [&::-webkit-search-cancel-button]:hidden"
                  />
                  {searchTerm && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchTerm("");
                        setCurrentPage(1);
                      }}
                      aria-label="Clear search"
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleRefresh}
                  disabled={isLoading}
                  aria-label="Refresh shops"
                  title="Refresh"
                  className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600 shadow-sm hover:bg-gray-50 hover:text-gray-900 disabled:opacity-60"
                >
                  <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} aria-hidden="true" />
                </button>
                {permissions.canManageShops && (
                  <Button onClick={openAddForm} className="h-10 flex-shrink-0 gap-2">
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    <span className="hidden sm:inline">Add Shop</span>
                  </Button>
                )}
              </div>
            </div>

            {/* Error Display (page level; the form shows its own) */}
            {error && !isFormOpen && !deletingShop && (
              <div role="alert" className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-4">
                <AlertCircle className="h-5 w-5 flex-shrink-0 text-red-600" aria-hidden="true" />
                <div className="flex-1 text-sm font-medium text-red-800">{error}</div>
                <button
                  type="button"
                  onClick={() => setError(null)}
                  aria-label="Dismiss"
                  className="rounded-lg p-1 text-red-600 hover:bg-red-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            {/* Shop cards */}
            {isLoading ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3" aria-busy="true">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-[232px] animate-pulse rounded-2xl border border-gray-200/80 bg-white" />
                ))}
              </div>
            ) : shops.length === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-white px-6 py-16 text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-400">
                  <Building2 className="h-7 w-7" aria-hidden="true" />
                </div>
                <p className="text-base font-semibold text-gray-900">No shops yet</p>
                <p className="mt-1 text-sm text-gray-500">
                  Add your first shop to start selling from a branch.
                </p>
                {permissions.canManageShops && (
                  <Button onClick={openAddForm} className="mt-5 gap-2">
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Add Shop
                  </Button>
                )}
              </div>
            ) : filteredShops.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-14 text-center">
                <p className="text-base font-semibold text-gray-900">No shops match “{searchTerm}”</p>
                <button
                  type="button"
                  onClick={() => setSearchTerm("")}
                  className="mt-3 text-sm font-semibold text-rose-600 hover:text-rose-700"
                >
                  Clear search
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {currentShops.map((shop) => {
                  const isInactive = shop.status === "inactive";
                  const isWorking = workingBranch.id === shop.id;
                  const isDefault = defaultBranch.id === shop.id;
                  return (
                    <article
                      key={shop.id}
                      className="group flex flex-col rounded-2xl border border-gray-200/80 bg-white shadow-sm transition-all hover:border-rose-200 hover:shadow-md"
                    >
                      {/* Title */}
                      <div className="flex items-start gap-3 p-5 pb-4">
                        <div
                          className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl ${
                            isInactive ? "bg-gray-100 text-gray-400" : "bg-rose-50 text-rose-500"
                          }`}
                        >
                          <Building2 className="h-5 w-5" aria-hidden="true" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h2 className="truncate text-base font-bold text-gray-900" title={shop.name}>
                            {shop.name}
                          </h2>
                          <p className="truncate text-sm text-gray-500">
                            {[shop.township, shop.city].filter(Boolean).join(", ")}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                isInactive
                                  ? "bg-gray-100 text-gray-600"
                                  : "bg-emerald-50 text-emerald-700"
                              }`}
                            >
                              <span
                                className={`h-1.5 w-1.5 rounded-full ${isInactive ? "bg-gray-400" : "bg-emerald-500"}`}
                                aria-hidden="true"
                              />
                              {isInactive ? "Inactive" : "Active"}
                            </span>
                            {isDefault && (
                              <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700 ring-1 ring-inset ring-rose-200">
                                Default
                              </span>
                            )}
                            {isWorking && (
                              <span className="rounded-full bg-gray-900 px-2 py-0.5 text-[11px] font-semibold text-white">
                                Your branch
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Details */}
                      <dl className="flex-1 space-y-2.5 border-t border-gray-100 px-5 py-4 text-sm">
                        <div className="flex gap-2.5">
                          <dt className="sr-only">Address</dt>
                          <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400" aria-hidden="true" />
                          <dd className="line-clamp-2 text-gray-700" title={shop.address}>
                            {shop.address}
                          </dd>
                        </div>
                        <div className="flex gap-2.5">
                          <dt className="sr-only">Phone</dt>
                          <Phone className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400" aria-hidden="true" />
                          <dd className="text-gray-700 tabular">
                            <a href={`tel:${shop.primaryPhone}`} className="hover:text-rose-600">
                              {shop.primaryPhone}
                            </a>
                            {shop.secondaryPhone && (
                              <>
                                <span className="mx-1.5 text-gray-300">·</span>
                                <a href={`tel:${shop.secondaryPhone}`} className="hover:text-rose-600">
                                  {shop.secondaryPhone}
                                </a>
                              </>
                            )}
                          </dd>
                        </div>
                        <div className="flex gap-2.5">
                          <dt className="sr-only">Opening hours</dt>
                          <Clock className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400" aria-hidden="true" />
                          <dd className={shop.openingHours ? "text-gray-700" : "italic text-gray-400"}>
                            {shop.openingHours || "Opening hours not set"}
                          </dd>
                        </div>
                      </dl>

                      {/* Actions */}
                      {permissions.canManageShops && (
                        <div className="flex items-center gap-2 border-t border-gray-100 px-5 py-3">
                          <button
                            type="button"
                            onClick={() => handleEditShop(shop)}
                            className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700 transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
                          >
                            <Pencil className="h-4 w-4" aria-hidden="true" />
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteShop(shop)}
                            aria-label={`Delete ${shop.name}`}
                            title="Delete shop"
                            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-400 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}

            {/* Pagination */}
            {!isLoading && filteredShops.length > 0 && (
              <div className="flex flex-col items-center justify-between gap-3 rounded-2xl border border-gray-200/80 bg-white px-4 py-3 shadow-sm sm:flex-row">
                <div className="flex items-center gap-3 text-sm text-gray-600">
                  <span className="tabular">
                    Showing <span className="font-semibold text-gray-900">{startIndex + 1}</span>–
                    <span className="font-semibold text-gray-900">{Math.min(endIndex, filteredShops.length)}</span> of{" "}
                    <span className="font-semibold text-gray-900">{filteredShops.length}</span>
                  </span>
                  <label className="hidden items-center gap-2 sm:flex">
                    <span className="text-gray-400">·</span>
                    Per page
                    <select
                      value={rowsPerPage}
                      onChange={(e) => {
                        setRowsPerPage(Number(e.target.value));
                        setCurrentPage(1);
                      }}
                      className="h-8 rounded-lg border border-gray-200 bg-white px-2 text-sm text-gray-900 focus:border-rose-400 focus:outline-none focus:ring-4 focus:ring-rose-100"
                    >
                      {PAGE_SIZE_OPTIONS.map((size) => (
                        <option key={size} value={size}>
                          {size}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                {totalPages > 1 && (
                  <nav aria-label="Pagination" className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setCurrentPage(Math.max(1, safePage - 1))}
                      disabled={safePage === 1}
                      aria-label="Previous page"
                      className="flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    {pageNumbers.map((page) => (
                      <button
                        key={page}
                        type="button"
                        onClick={() => setCurrentPage(page)}
                        aria-current={page === safePage ? "page" : undefined}
                        className={`h-9 min-w-[36px] rounded-xl px-3 text-sm font-semibold tabular transition-all ${
                          page === safePage
                            ? "bg-brand text-white shadow-brand"
                            : "text-gray-700 hover:bg-gray-50"
                        }`}
                      >
                        {page}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setCurrentPage(Math.min(totalPages, safePage + 1))}
                      disabled={safePage === totalPages}
                      aria-label="Next page"
                      className="flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </nav>
                )}
              </div>
            )}
          </div>
        </main>
      </div>

      {/* ============ Add / Edit dialog ============ */}
      {isFormOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-gray-900/40 backdrop-blur-sm sm:items-center sm:p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !isSubmitting) handleCancelEdit();
          }}
        >
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="shop-form-title"
            onSubmit={(e) => {
              e.preventDefault();
              void (isEditMode ? handleUpdateShop() : handleAddShop());
            }}
            noValidate
            className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-w-2xl sm:rounded-3xl"
          >
            <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-6 py-4">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-rose-500">
                  {isEditMode ? <Pencil className="h-5 w-5" aria-hidden="true" /> : <Plus className="h-5 w-5" aria-hidden="true" />}
                </span>
                <div>
                  <h2 id="shop-form-title" className="text-lg font-bold text-gray-900">
                    {isEditMode ? "Edit Shop Details" : "Add New Shop"}
                  </h2>
                  <p className="text-xs text-gray-500">Fields marked * are required.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCancelEdit}
                disabled={isSubmitting}
                aria-label="Close"
                className="rounded-xl p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
              {error && (
                <div role="alert" className="flex items-center gap-2.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-sm font-medium text-red-800">
                  <AlertCircle className="h-4 w-4 flex-shrink-0 text-red-600" aria-hidden="true" />
                  {error}
                </div>
              )}

              <Field id="shop-name" label="Shop Name" required icon={Building2} error={formErrors.name}>
                <input
                  ref={firstFieldRef}
                  id="shop-name"
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleInputChange("name", e.target.value)}
                  placeholder="e.g. Dagon Branch"
                  aria-invalid={!!formErrors.name || undefined}
                  className={inputClass(!!formErrors.name)}
                />
              </Field>

              <Field id="shop-address" label="Address" required icon={MapPin} error={formErrors.address} alignIconTop>
                <textarea
                  id="shop-address"
                  value={formData.address}
                  onChange={(e) => handleInputChange("address", e.target.value)}
                  placeholder="e.g. 123 Main Street"
                  rows={2}
                  aria-invalid={!!formErrors.address || undefined}
                  className={`${inputClass(!!formErrors.address)} resize-none`}
                />
              </Field>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field id="shop-township" label="Township" required icon={MapPin} error={formErrors.township}>
                  <input
                    id="shop-township"
                    type="text"
                    value={formData.township}
                    onChange={(e) => handleInputChange("township", e.target.value)}
                    placeholder="e.g. Dagon Township"
                    aria-invalid={!!formErrors.township || undefined}
                    className={inputClass(!!formErrors.township)}
                  />
                </Field>
                <Field id="shop-city" label="City" required icon={Building2} error={formErrors.city}>
                  <input
                    id="shop-city"
                    type="text"
                    value={formData.city}
                    onChange={(e) => handleInputChange("city", e.target.value)}
                    placeholder="e.g. Yangon"
                    aria-invalid={!!formErrors.city || undefined}
                    className={inputClass(!!formErrors.city)}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field id="shop-primary-phone" label="Primary Phone" required icon={Phone} error={formErrors.primaryPhone}>
                  <input
                    id="shop-primary-phone"
                    type="tel"
                    inputMode="numeric"
                    value={formData.primaryPhone}
                    onChange={(e) => handleInputChange("primaryPhone", e.target.value)}
                    placeholder="09xxxxxxxxx"
                    aria-invalid={!!formErrors.primaryPhone || undefined}
                    className={inputClass(!!formErrors.primaryPhone)}
                  />
                </Field>
                <Field id="shop-secondary-phone" label="Secondary Phone" optional icon={Phone} error={formErrors.secondaryPhone}>
                  <input
                    id="shop-secondary-phone"
                    type="tel"
                    inputMode="numeric"
                    value={formData.secondaryPhone}
                    onChange={(e) => handleInputChange("secondaryPhone", e.target.value)}
                    placeholder="09xxxxxxxxx"
                    aria-invalid={!!formErrors.secondaryPhone || undefined}
                    className={inputClass(!!formErrors.secondaryPhone)}
                  />
                </Field>
              </div>

              <Field
                id="shop-opening-hours"
                label="Opening Hours"
                optional
                icon={Clock}
                hint="Shown to online customers and used by the storefront AI assistant. Leave blank if you would rather it not answer opening-hours questions."
              >
                <input
                  id="shop-opening-hours"
                  type="text"
                  value={formData.openingHours}
                  onChange={(e) => handleInputChange("openingHours", e.target.value)}
                  placeholder="e.g. Mon-Sat 9:00 AM - 8:00 PM, Sun 10:00 AM - 6:00 PM"
                  className={inputClass(false)}
                />
              </Field>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-gray-100 bg-gray-50/60 px-6 py-4">
              <Button type="button" variant="outline" onClick={handleCancelEdit} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting} className="min-w-[140px] gap-2">
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : isEditMode ? (
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Plus className="h-4 w-4" aria-hidden="true" />
                )}
                {isSubmitting
                  ? isEditMode
                    ? "Updating..."
                    : "Adding..."
                  : isEditMode
                    ? "Update Shop"
                    : "Add Shop"}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* ============ Delete confirmation ============ */}
      {deletingShop && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-900/40 p-4 backdrop-blur-sm"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !isDeleting) setDeletingShop(null);
          }}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-shop-title"
            aria-describedby="delete-shop-description"
            className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl"
          >
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-500">
              <Trash2 className="h-6 w-6" aria-hidden="true" />
            </div>
            <h2 id="delete-shop-title" className="text-center text-lg font-bold text-gray-900">
              Delete {deletingShop.name}?
            </h2>
            <p id="delete-shop-description" className="mt-2 text-center text-sm text-gray-500">
              The shop is removed from the branch list. Sales and stock already recorded
              for it are kept. This cannot be undone.
            </p>
            {error && (
              <div role="alert" className="mt-4 flex items-center gap-2.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-sm font-medium text-red-800">
                <AlertCircle className="h-4 w-4 flex-shrink-0 text-red-600" aria-hidden="true" />
                {error}
              </div>
            )}
            <div className="mt-6 grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDeletingShop(null)}
                disabled={isDeleting}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="danger"
                onClick={() => void confirmDeleteShop()}
                disabled={isDeleting}
                className="gap-2"
              >
                {isDeleting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ShopManagementPage() {
  return (
    <ProtectedRoute requiredRole="owner">
      <ShopManagementContent />
    </ProtectedRoute>
  );
}
