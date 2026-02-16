"use client";

import { useState, useEffect } from "react";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { Sidebar } from "@/components/ui/Sidebar";
import { TopNavBar } from "@/components/ui/TopNavBar";
import { Button } from "@/components/ui/Button";
import {
  Building2,
  MapPin,
  Phone,
  Plus,
  RefreshCw,
  Edit,
  Trash2,
  Loader2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  Shop,
  CreateShopRequest,
  UpdateShopRequest,
  ShopListResponse,
  ShopResponse,
} from "@/types/shop";

function ShopManagementContent() {
  const [activeMenuItem, setActiveMenuItem] = useState("manage-shops");
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isCartModalOpen, setIsCartModalOpen] = useState(false);

  // Form state
  // Track if all shops are deleted to trigger settings refresh
  const [wasEmpty, setWasEmpty] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    address: "",
    primaryPhone: "",
    secondaryPhone: "",
    township: "",
    city: "",
  });

  // API state
  const [shops, setShops] = useState<Shop[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Edit mode state
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingShopId, setEditingShopId] = useState<string | null>(null);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  // Fetch shops on component mount
  useEffect(() => {
    fetchShops();
  }, []);

  // API Functions
  const fetchShops = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch("/api/shops");
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

      const response = await fetch("/api/shops", {
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
        setFormData({
          name: "",
          address: "",
          primaryPhone: "",
          secondaryPhone: "",
          township: "",
          city: "",
        });
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
      const response = await fetch(`/api/shops/${id}`, {
        method: "DELETE",
      });

      const data: ShopResponse = await response.json();

      if (data.success) {
        setShops((prevShops) => {
          const updatedShops = prevShops.filter((shop) => shop.id !== id);
          // If this deletion results in zero shops, set currentBranch to 'No Branch' in backend
          if (updatedShops.length === 0) {
            fetch("/api/settings", {
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
      const response = await fetch(`/api/shops/${id}`, {
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

    await createShop(shopData);
  };

  const handleDeleteShop = async (id: string) => {
    if (window.confirm("Are you sure you want to delete this shop?")) {
      await deleteShop(id);
    }
  };

  const handleRefresh = () => {
    fetchShops();
  };

  const handleEditShop = (shop: Shop) => {
    setFormData({
      name: shop.name,
      address: shop.address,
      primaryPhone: shop.primaryPhone,
      secondaryPhone: shop.secondaryPhone || "",
      township: shop.township,
      city: shop.city,
    });
    setIsEditMode(true);
    setEditingShopId(shop.id);
    setFormErrors({});
    setError(null);
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
    };

    const success = await updateShop(editingShopId, shopData);
    if (success) {
      handleCancelEdit();
    }
  };

  const handleCancelEdit = () => {
    setIsEditMode(false);
    setEditingShopId(null);
    setFormData({
      name: "",
      address: "",
      primaryPhone: "",
      secondaryPhone: "",
      township: "",
      city: "",
    });
    setFormErrors({});
    setError(null);
  };

  // Pagination calculations
  const totalPages = Math.ceil(shops.length / rowsPerPage);
  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = startIndex + rowsPerPage;
  const currentShops = shops.slice(startIndex, endIndex);

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Desktop Sidebar */}
      <div className="hidden md:block">
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
        className="md:hidden"
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col">
        {/* Top Navigation Bar */}
        <TopNavBar
          onCartModalStateChange={setIsCartModalOpen}
          onMenuToggle={() => setIsMobileSidebarOpen(true)}
        />

        {/* Page Header */}
        <div className="bg-white border-b border-gray-200 px-4 md:px-8 lg:px-12 py-4">
          <div className="flex items-center">
          
            <h1 className="text-2xl font-semibold text-gray-900">
              Shop Management
            </h1>
          </div>
        </div>

        {/* Main Content */}
        <main className="flex-1 py-6 px-4 sm:px-6 lg:px-8">
          <div className="max-w-screen-2xl mx-auto space-y-8">
            {/* Error Display */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center">
                <AlertCircle className="h-5 w-5 text-red-600 mr-3" />
                <div className="text-red-800">{error}</div>
                <button
                  onClick={() => setError(null)}
                  className="ml-auto text-red-600 hover:text-red-800"
                >
                  ×
                </button>
              </div>
            )}

            {/* Add New Shop / Edit Shop Form */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <div className="px-6 py-4 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    {isEditMode ? (
                      <Edit className="h-5 w-5 text-blue-600 mr-2" />
                    ) : (
                      <Plus className="h-5 w-5 text-blue-600 mr-2" />
                    )}
                    <h2 className="text-lg font-semibold text-gray-900">
                      {isEditMode ? "Edit Shop" : "Add New Shop"}
                    </h2>
                  </div>
                  {isEditMode && (
                    <Button
                      variant="outline"
                      onClick={handleCancelEdit}
                      className="text-gray-600 hover:text-gray-900"
                    >
                      Cancel Edit
                    </Button>
                  )}
                </div>
              </div>

              <div className="p-6 space-y-6">
                {/* Shop Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Shop Name <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) =>
                        handleInputChange("name", e.target.value)
                      }
                      placeholder="e.g. Dagon Branch"
                      className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-gray-300 text-gray-900 ${
                        formErrors.name
                          ? "border-red-300 bg-red-50"
                          : "border-gray-300"
                      }`}
                    />
                  </div>
                  {formErrors.name && (
                    <p className="mt-1 text-sm text-red-600">
                      {formErrors.name}
                    </p>
                  )}
                </div>

                {/* Address */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Address <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <textarea
                      value={formData.address}
                      onChange={(e) =>
                        handleInputChange("address", e.target.value)
                      }
                      placeholder="e.g. 123 Main Street"
                      rows={3}
                      className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-gray-300 text-gray-900 resize-none ${
                        formErrors.address
                          ? "border-red-300 bg-red-50"
                          : "border-gray-300"
                      }`}
                    />
                  </div>
                  {formErrors.address && (
                    <p className="mt-1 text-sm text-red-600">
                      {formErrors.address}
                    </p>
                  )}
                </div>

                {/* Phone Numbers */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Primary Phone <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <input
                        type="tel"
                        value={formData.primaryPhone}
                        onChange={(e) =>
                          handleInputChange("primaryPhone", e.target.value)
                        }
                        placeholder="09xxxxxxxxx"
                        className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-gray-300 text-gray-900 ${
                          formErrors.primaryPhone
                            ? "border-red-300 bg-red-50"
                            : "border-gray-300"
                        }`}
                      />
                    </div>
                    {formErrors.primaryPhone && (
                      <p className="mt-1 text-sm text-red-600">
                        {formErrors.primaryPhone}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Secondary Phone{" "}
                      <span className="text-gray-400">(Optional)</span>
                    </label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <input
                        type="tel"
                        value={formData.secondaryPhone}
                        onChange={(e) =>
                          handleInputChange("secondaryPhone", e.target.value)
                        }
                        placeholder="09xxxxxxxxx"
                        className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-gray-300 text-gray-900 ${
                          formErrors.secondaryPhone
                            ? "border-red-300 bg-red-50"
                            : "border-gray-300"
                        }`}
                      />
                    </div>
                    {formErrors.secondaryPhone && (
                      <p className="mt-1 text-sm text-red-600">
                        {formErrors.secondaryPhone}
                      </p>
                    )}
                  </div>
                </div>

                {/* Township and City */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Township <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <input
                        type="text"
                        value={formData.township}
                        onChange={(e) =>
                          handleInputChange("township", e.target.value)
                        }
                        placeholder="e.g. Dagon Township"
                        className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-gray-300 text-gray-900 ${
                          formErrors.township
                            ? "border-red-300 bg-red-50"
                            : "border-gray-300"
                        }`}
                      />
                    </div>
                    {formErrors.township && (
                      <p className="mt-1 text-sm text-red-600">
                        {formErrors.township}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      City <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <Building2 className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <input
                        type="text"
                        value={formData.city}
                        onChange={(e) =>
                          handleInputChange("city", e.target.value)
                        }
                        placeholder="e.g. Yangon"
                        className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-gray-300 text-gray-900 ${
                          formErrors.city
                            ? "border-red-300 bg-red-50"
                            : "border-gray-300"
                        }`}
                      />
                    </div>
                    {formErrors.city && (
                      <p className="mt-1 text-sm text-red-600">
                        {formErrors.city}
                      </p>
                    )}
                  </div>
                </div>

                {/* Submit Button */}
                <div className="flex justify-end">
                  <Button
                    onClick={isEditMode ? handleUpdateShop : handleAddShop}
                    disabled={isSubmitting}
                    className="bg-gray-900 hover:bg-gray-800 disabled:bg-gray-400 text-white px-6 py-3 flex items-center"
                  >
                    {isSubmitting ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Building2 className="h-4 w-4 mr-2" />
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
              </div>
            </div>

            {/* Shops List */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">
                  Shops List
                </h2>
              </div>

              <div className="overflow-x-auto">
                {isLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                    <span className="ml-2 text-gray-600">Loading shops...</span>
                  </div>
                ) : shops.length === 0 ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="text-center">
                      <Building2 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                      <p className="text-gray-500">No shops found</p>
                      <p className="text-sm text-gray-400">
                        Add your first shop using the form above
                      </p>
                    </div>
                  </div>
                ) : (
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Shop Name
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Address
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Phone
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Township/City
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {currentShops.map((shop) => (
                        <tr key={shop.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900">
                              {shop.name}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-sm text-gray-900 max-w-xs truncate">
                              {shop.address}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">
                              {shop.primaryPhone}
                            </div>
                            {shop.secondaryPhone && (
                              <div className="text-sm text-gray-500">
                                {shop.secondaryPhone}
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">
                              {shop.township}
                            </div>
                            <div className="text-sm text-gray-500">
                              {shop.city}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                            <div className="flex items-center space-x-2">
                              <button
                                title="Edit Shop"
                                onClick={() => handleEditShop(shop)}
                                className="text-blue-600 hover:text-blue-900 p-1"
                              >
                                <Edit className="h-4 w-4" />
                              </button>
                              <button
                                title="Delete Shop"
                                onClick={() => handleDeleteShop(shop.id)}
                                className="text-red-600 hover:text-red-900 p-1"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {/* Pagination */}
                {shops.length > 0 && (
                  <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
                    <div className="flex-1 flex justify-between sm:hidden">
                      <button
                        onClick={() =>
                          setCurrentPage(Math.max(1, currentPage - 1))
                        }
                        disabled={currentPage === 1}
                        className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                      >
                        Previous
                      </button>
                      <button
                        onClick={() =>
                          setCurrentPage(Math.min(totalPages, currentPage + 1))
                        }
                        disabled={currentPage === totalPages}
                        className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                      >
                        Next
                      </button>
                    </div>
                    <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                      <div className="flex items-center space-x-2">
                        <p className="text-sm text-gray-700">Rows per page:</p>
                        <select
                          title="Select number of rows per page"
                          value={rowsPerPage}
                          onChange={(e) => {
                            setRowsPerPage(Number(e.target.value));
                            setCurrentPage(1);
                          }}
                          className="border border-gray-300 rounded px-2 py-1 text-sm text-gray-900"
                        >
                          <option value={10}>10</option>
                          <option value={25}>25</option>
                          <option value={50}>50</option>
                          <option value={100}>100</option>
                        </select>
                        <p className="text-sm text-gray-700">
                          Showing {startIndex + 1}–
                          {Math.min(endIndex, shops.length)} of {shops.length}{" "}
                          shops
                        </p>
                      </div>
                      <div>
                        <nav
                          className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px"
                          aria-label="Pagination"
                        >
                          <button
                            title="Go to previous page"
                            onClick={() =>
                              setCurrentPage(Math.max(1, currentPage - 1))
                            }
                            disabled={currentPage === 1}
                            className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                          >
                            <ChevronLeft className="h-5 w-5" />
                          </button>
                          <button
                            title="Go to next page"
                            onClick={() =>
                              setCurrentPage(
                                Math.min(totalPages, currentPage + 1)
                              )
                            }
                            disabled={currentPage === totalPages}
                            className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                          >
                            <ChevronRight className="h-5 w-5" />
                          </button>
                        </nav>
                      </div>
                    </div>
                  </div>
                )}
                )
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

export default function ShopManagementPage() {
  return (
    <ProtectedRoute>
      <ShopManagementContent />
    </ProtectedRoute>
  );
}
