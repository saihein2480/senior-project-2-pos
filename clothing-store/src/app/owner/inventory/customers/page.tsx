"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useCurrency } from "@/contexts/CurrencyContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { Sidebar } from "@/components/ui/Sidebar";
import { TopNavBar } from "@/components/ui/TopNavBar";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  Users,
  Store,
  Building2,
  CreditCard,
  Search,
  Plus,
  RefreshCw,
  Loader2,
  AlertCircle,
  User,
  Mail,
  Phone,
  MapPin,
  MoreVertical,
  Edit,
  Trash2,
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  Customer,
  CustomerStats,
  CustomerListResponse,
  CustomerStatsResponse,
  CreateCustomerRequest,
} from "@/types/customer";
import NewCustomerModal from "@/components/customers/NewCustomerModal";
import { DeleteConfirmationModal } from "@/components/customers/DeleteConfirmationModal";

function CustomerPageContent() {
  const { formatPrice } = useCurrency();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [stats, setStats] = useState<CustomerStats>({
    totalCustomers: 0,
    retailerCustomers: 0,
    wholesalerCustomers: 0,
    totalReceivables: 0,
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [dropdownPosition, setDropdownPosition] = useState<{
    top: number;
    right: number;
  } | null>(null);
  const buttonRefs = useRef<{ [key: string]: HTMLButtonElement | null }>({});

  // Delete modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingCustomer, setDeletingCustomer] = useState<Customer | null>(
    null,
  );
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Pagination state - separate for each customer type table
  const [retailerPage, setRetailerPage] = useState(1);
  const [wholesalerPage, setWholesalerPage] = useState(1);
  const [distributorPage, setDistributorPage] = useState(1);
  const [individualPage, setIndividualPage] = useState(1);
  const [unassignedPage, setUnassignedPage] = useState(1);
  const [rowsPerPage] = useState(10);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [selectedCustomerType, setSelectedCustomerType] = useState<string | null>(null);

  // Fetch customers from API
  const fetchCustomers = async () => {
    try {
      setError(null);

      const response = await fetch("/api/customers");
      const data: CustomerListResponse = await response.json();

      if (data.success && data.data) {
        setCustomers(data.data);
      } else {
        setError(data.error || "Failed to fetch customers");
      }
    } catch (err) {
      setError("Failed to fetch customers");
      console.error("Error fetching customers:", err);
    }
  };

  // Fetch customer statistics
  const fetchStats = async () => {
    try {
      const response = await fetch("/api/customers/stats");
      const data: CustomerStatsResponse = await response.json();

      if (data.success && data.data) {
        setStats(data.data);
      } else {
        console.error("Failed to fetch customer stats:", data.error);
      }
    } catch (err) {
      console.error("Error fetching customer stats:", err);
    }
  };

  // Initial data fetch
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      await Promise.all([fetchCustomers(), fetchStats()]);
      setIsLoading(false);
    };

    loadData();
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (openDropdown) {
        const target = event.target as Element;

        // Check if click is on the dropdown button
        const isDropdownButton = Object.values(buttonRefs.current).some(
          (button) => button && button.contains(target),
        );

        // Check if click is inside the dropdown menu
        const isInsideDropdown = target.closest("[data-dropdown-menu]");

        // Close dropdown only if click is outside both button and dropdown
        if (!isDropdownButton && !isInsideDropdown) {
          setOpenDropdown(null);
          setDropdownPosition(null);
        }
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [openDropdown]);

  // Handle dropdown toggle with position calculation
  const handleDropdownToggle = (customerId: string) => {
    if (openDropdown === customerId) {
      setOpenDropdown(null);
      setDropdownPosition(null);
    } else {
      const button = buttonRefs.current[customerId];
      if (button) {
        const rect = button.getBoundingClientRect();
        setDropdownPosition({
          top: rect.bottom + window.scrollY + 4,
          right: window.innerWidth - rect.right + window.scrollX,
        });
      }
      setOpenDropdown(customerId);
    }
  };

  // Handle refresh
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([fetchCustomers(), fetchStats()]);
    setIsRefreshing(false);
  };

  // Handle edit customer
  const handleEditCustomer = (customer: Customer) => {
    setEditingCustomer(customer);
    setIsModalOpen(true);
    setOpenDropdown(null);
    setDropdownPosition(null);
  };

  // Handle delete customer - open modal
  const handleDeleteCustomer = (customer: Customer) => {
    setDeletingCustomer(customer);
    setShowDeleteModal(true);
    setDeleteError(null);
    setOpenDropdown(null);
    setDropdownPosition(null);
  };

  // Confirm delete customer
  const confirmDeleteCustomer = async () => {
    if (!deletingCustomer) return;

    setIsDeleting(true);
    setDeleteError(null);

    try {
      const response = await fetch(`/api/customers/${deletingCustomer.uid}`, {
        method: "DELETE",
      });

      if (response.ok) {
        // Show success message
        setSuccessMessage(
          `Customer "${
            deletingCustomer.displayName || deletingCustomer.email
          }" has been deleted successfully.`,
        );

        // Refresh the customer list
        await fetchCustomers();
        await fetchStats();
        setShowDeleteModal(false);
        setDeletingCustomer(null);

        // Auto-hide success message after 5 seconds
        setTimeout(() => setSuccessMessage(null), 5000);
      } else {
        setDeleteError("Failed to delete customer");
      }
    } catch (err) {
      setDeleteError("Failed to delete customer");
      console.error("Error deleting customer:", err);
    } finally {
      setIsDeleting(false);
    }
  };

  // Cancel delete customer
  const cancelDeleteCustomer = () => {
    setShowDeleteModal(false);
    setDeletingCustomer(null);
    setDeleteError(null);
    setIsDeleting(false);
  };

  const handleSubmitCustomer = async (customerData: CreateCustomerRequest) => {
    try {
      if (editingCustomer) {
        // Update existing customer
        const response = await fetch(`/api/customers/${editingCustomer.uid}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(customerData),
        });

        if (!response.ok) {
          throw new Error("Failed to update customer");
        }

        const result = await response.json();

        if (result.success) {
          // Update the customer in the list
          setCustomers((prev) =>
            prev.map((customer) =>
              customer.uid === editingCustomer.uid ? result.data : customer,
            ),
          );

          // Refresh stats to ensure accuracy
          await fetchStats();
        }
      } else {
        // Create new customer
        const response = await fetch("/api/customers", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(customerData),
        });

        if (!response.ok) {
          throw new Error("Failed to create customer");
        }

        const result = await response.json();

        if (result.success) {
          // Add the new customer to the list
          setCustomers((prev) => [result.data, ...prev]);

          // Update stats
          setStats((prev) => ({
            ...prev,
            totalCustomers: prev.totalCustomers + 1,
            retailerCustomers:
              result.data.customerType === "retailer"
                ? prev.retailerCustomers + 1
                : prev.retailerCustomers,
            wholesalerCustomers:
              result.data.customerType === "wholesaler"
                ? prev.wholesalerCustomers + 1
                : prev.wholesalerCustomers,
          }));
        }
      }

      // Reset editing state
      setEditingCustomer(null);
    } catch (error) {
      console.error("Error submitting customer:", error);
      throw error;
    }
  };

  // Filter customers based on search term only
  const searchFilteredCustomers = customers.filter(
    (customer) =>
      customer.displayName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.phone?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Group customers by type from the search-filtered list
  const retailerCustomers = searchFilteredCustomers.filter(
    (customer) => customer.customerType === "retailer",
  );
  const wholesalerCustomers = searchFilteredCustomers.filter(
    (customer) => customer.customerType === "wholesaler",
  );
  const distributorCustomers = searchFilteredCustomers.filter(
    (customer) => customer.customerType === "distributor",
  );
  const individualCustomers = searchFilteredCustomers.filter(
    (customer) => customer.customerType === "individual",
  );
  const unassignedCustomers = searchFilteredCustomers.filter(
    (customer) => !customer.customerType || (customer.customerType !== "retailer" && customer.customerType !== "wholesaler" && customer.customerType !== "distributor" && customer.customerType !== "individual"),
  );

  // Calculate total filtered customers for the "no customers found" message
  const filteredCustomers = searchFilteredCustomers;

  // Pagination calculations for each type
  const retailerTotalPages = Math.ceil(retailerCustomers.length / rowsPerPage);
  const retailerStartIndex = (retailerPage - 1) * rowsPerPage;
  const retailerEndIndex = retailerStartIndex + rowsPerPage;
  const retailerPageCustomers = retailerCustomers.slice(retailerStartIndex, retailerEndIndex);

  const wholesalerTotalPages = Math.ceil(wholesalerCustomers.length / rowsPerPage);
  const wholesalerStartIndex = (wholesalerPage - 1) * rowsPerPage;
  const wholesalerEndIndex = wholesalerStartIndex + rowsPerPage;
  const wholesalerPageCustomers = wholesalerCustomers.slice(wholesalerStartIndex, wholesalerEndIndex);

  const distributorTotalPages = Math.ceil(distributorCustomers.length / rowsPerPage);
  const distributorStartIndex = (distributorPage - 1) * rowsPerPage;
  const distributorEndIndex = distributorStartIndex + rowsPerPage;
  const distributorPageCustomers = distributorCustomers.slice(distributorStartIndex, distributorEndIndex);

  const individualTotalPages = Math.ceil(individualCustomers.length / rowsPerPage);
  const individualStartIndex = (individualPage - 1) * rowsPerPage;
  const individualEndIndex = individualStartIndex + rowsPerPage;
  const individualPageCustomers = individualCustomers.slice(individualStartIndex, individualEndIndex);

  const unassignedTotalPages = Math.ceil(unassignedCustomers.length / rowsPerPage);
  const unassignedStartIndex = (unassignedPage - 1) * rowsPerPage;
  const unassignedEndIndex = unassignedStartIndex + rowsPerPage;
  const unassignedPageCustomers = unassignedCustomers.slice(unassignedStartIndex, unassignedEndIndex);

  // Format date
  const formatDate = (date: Date | string) => {
    const d = typeof date === "string" ? new Date(date) : date;
    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <ProtectedRoute>
      <div className="flex h-screen bg-gray-50">
        <div className="hidden lg:block">
          <Sidebar activeItem="customers" onItemClick={() => {}} />
        </div>

        <div className="lg:hidden">
          <Sidebar
            activeItem="customers"
            onItemClick={() => setIsMobileSidebarOpen(false)}
            isMobileOpen={isMobileSidebarOpen}
            onCloseMobile={() => setIsMobileSidebarOpen(false)}
          />
        </div>

        <div className="flex-1 flex flex-col overflow-hidden">
          <TopNavBar
            onCartModalStateChange={() => {}}
            onMenuToggle={() => setIsMobileSidebarOpen((s) => !s)}
          />

          <main className="flex-1 overflow-x-hidden overflow-y-auto">
            <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
              {/* Header */}
              <div className="mb-8">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h1 className="text-3xl font-bold text-gray-900">
                      Customers
                    </h1>
                    <p className="mt-1 text-sm text-gray-500">
                      Manage your customer database and relationships
                    </p>
                  </div>
                  <Button
                    className="flex items-center bg-gradient-to-r from-pink-400 to-pink-300 hover:from-pink-500 hover:to-pink-400 text-white font-medium shadow-md border-0"
                    onClick={() => setIsModalOpen(true)}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    New Customer
                  </Button>
                </div>
              </div>

              {/* Customer Type Filter Tabs */}
              <div className="mb-6 flex flex-wrap gap-2">
                <button
                  onClick={() => {
                    setSelectedCustomerType(null);
                  }}
                  className={`px-4 py-2 rounded-xl font-medium transition-all border-0 ${
                    selectedCustomerType === null
                      ? "bg-gradient-to-r from-pink-400 to-pink-300 text-white shadow-md"
                      : "bg-white text-gray-700 shadow-sm hover:bg-pink-50"
                  }`}
                >
                  All Types
                </button>
                <button
                  onClick={() => {
                    setSelectedCustomerType("retailer");
                  }}
                  className={`px-4 py-2 rounded-xl font-medium transition-all flex items-center gap-2 border-0 ${
                    selectedCustomerType === "retailer"
                      ? "bg-gradient-to-r from-pink-400 to-pink-300 text-white shadow-md"
                      : "bg-white text-gray-700 shadow-sm hover:bg-pink-50"
                  }`}
                >
                  <Store className="h-4 w-4" />
                  Retailer
                </button>
                <button
                  onClick={() => {
                    setSelectedCustomerType("wholesaler");
                  }}
                  className={`px-4 py-2 rounded-xl font-medium transition-all flex items-center gap-2 border-0 ${
                    selectedCustomerType === "wholesaler"
                      ? "bg-gradient-to-r from-pink-400 to-pink-300 text-white shadow-md"
                      : "bg-white text-gray-700 shadow-sm hover:bg-pink-50"
                  }`}
                >
                  <Building2 className="h-4 w-4" />
                  Wholesaler
                </button>
                <button
                  onClick={() => {
                    setSelectedCustomerType("distributor");
                  }}
                  className={`px-4 py-2 rounded-xl font-medium transition-all flex items-center gap-2 border-0 ${
                    selectedCustomerType === "distributor"
                      ? "bg-gradient-to-r from-pink-400 to-pink-300 text-white shadow-md"
                      : "bg-white text-gray-700 shadow-sm hover:bg-pink-50"
                  }`}
                >
                  <Building2 className="h-4 w-4" />
                  Distributor
                </button>
                <button
                  onClick={() => {
                    setSelectedCustomerType("individual");
                  }}
                  className={`px-4 py-2 rounded-xl font-medium transition-all flex items-center gap-2 border-0 ${
                    selectedCustomerType === "individual"
                      ? "bg-gradient-to-r from-pink-400 to-pink-300 text-white shadow-md"
                      : "bg-white text-gray-700 shadow-sm hover:bg-pink-50"
                  }`}
                >
                  <User className="h-4 w-4" />
                  Individual
                </button>
                <button
                  onClick={() => {
                    setSelectedCustomerType("others");
                  }}
                  className={`px-4 py-2 rounded-xl font-medium transition-all flex items-center gap-2 border-0 ${
                    selectedCustomerType === "others"
                      ? "bg-gradient-to-r from-pink-400 to-pink-300 text-white shadow-md"
                      : "bg-white text-gray-700 shadow-sm hover:bg-pink-50"
                  }`}
                >
                  <Users className="h-4 w-4" />
                  Others
                </button>
              </div>

              {/* Statistics Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                {/* Total Customers */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        Total Customers
                      </p>
                      <p className="text-3xl font-bold text-gray-900 mt-2">
                        {stats.totalCustomers}
                      </p>
                    </div>
                    <div className="p-3 bg-cyan-100 rounded-xl">
                      <Users className="h-6 w-6 text-cyan-600" />
                    </div>
                  </div>
                </div>

                {/* Retailer */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        Retailer
                      </p>
                      <p className="text-3xl font-bold text-gray-900 mt-2">
                        {stats.retailerCustomers}
                      </p>
                    </div>
                    <div className="p-3 bg-purple-100 rounded-xl">
                      <Store className="h-6 w-6 text-purple-600" />
                    </div>
                  </div>
                </div>

                {/* Wholesaler */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        Wholesaler
                      </p>
                      <p className="text-3xl font-bold text-gray-900 mt-2">
                        {stats.wholesalerCustomers}
                      </p>
                    </div>
                    <div className="p-3 bg-orange-100 rounded-xl">
                      <Building2 className="h-6 w-6 text-orange-600" />
                    </div>
                  </div>
                </div>

                {/* Receivables */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        Receivables
                      </p>
                      <p className="text-3xl font-bold text-gray-900 mt-2">
                        {formatPrice(stats.totalReceivables)}
                      </p>
                    </div>
                    <div className="p-3 bg-red-100 rounded-xl">
                      <CreditCard className="h-6 w-6 text-red-600" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Search Bar */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-6">
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <Input
                    type="text"
                    placeholder="Search by name, email, or phone..."
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setRetailerPage(1);
                      setWholesalerPage(1);
                      setDistributorPage(1);
                      setIndividualPage(1);
                      setUnassignedPage(1);
                    }}
                    className="pl-12 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-cyan-400 focus:border-transparent text-base"
                  />
                </div>
              </div>

              {/* Customer List */}
              {isLoading ? (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-16">
                  <div className="flex items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                    <span className="ml-3 text-gray-600 font-medium">
                      Loading customers...
                    </span>
                  </div>
                </div>
              ) : error ? (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-16">
                  <div className="flex items-center justify-center">
                    <div className="text-center">
                      <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-3" />
                      <p className="text-red-600 font-medium">{error}</p>
                    </div>
                  </div>
                </div>
              ) : filteredCustomers.length === 0 ? (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-16">
                  <div className="flex flex-col items-center justify-center">
                    <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                      <Users className="h-10 w-10 text-gray-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                      No customers found
                    </h3>
                    <p className="text-gray-500 text-center max-w-sm mb-6">
                      {searchTerm
                        ? "No customers match your search criteria."
                        : "Get started by adding your first customer."}
                    </p>
                    <Button
                      className="flex items-center bg-gradient-to-r from-pink-400 to-pink-300 hover:from-pink-500 hover:to-pink-400 text-white font-medium shadow-md border-0"
                      onClick={() => setIsModalOpen(true)}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add Customer
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-8">
                  {/* Show message if no customers after filtering */}
                  {retailerCustomers.length === 0 && wholesalerCustomers.length === 0 && distributorCustomers.length === 0 && individualCustomers.length === 0 && unassignedCustomers.length === 0 && (
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-16">
                      <div className="flex flex-col items-center justify-center">
                        <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                          <Users className="h-10 w-10 text-gray-400" />
                        </div>
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">
                          No customers to display
                        </h3>
                        <p className="text-gray-500 text-center max-w-sm mb-2">
                          Total customers: {filteredCustomers.length}
                        </p>
                        <p className="text-xs text-gray-400">
                          This might be a data structure issue. Check console for details.
                        </p>
                      </div>
                    </div>
                  )}
                  
                  {/* Retailer Customers Section */}
                  {(selectedCustomerType === null || selectedCustomerType === "retailer") && retailerCustomers.length > 0 && (
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                      <div className="bg-gradient-to-r from-blue-50 to-cyan-50 border-b border-blue-100 px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2.5 bg-white rounded-xl shadow-sm">
                            <Store className="h-5 w-5 text-blue-600" />
                          </div>
                          <div>
                            <h2 className="text-lg font-bold text-gray-900">Retailer Customers</h2>
                            <p className="text-sm text-gray-600">{retailerCustomers.length} {retailerCustomers.length === 1 ? 'retailer' : 'retailers'}</p>
                          </div>
                        </div>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                                Customer
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                                Contact
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                                Total Spent
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                                Receivables
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                                Joined
                              </th>
                              <th className="relative px-6 py-3">
                                <span className="sr-only">Actions</span>
                              </th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {retailerPageCustomers.map((customer) => (
                              <tr key={customer.uid} className="hover:bg-blue-50/30 transition-colors">
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <div className="flex items-center gap-3">
                                    <div className="flex-shrink-0 h-10 w-10">
                                      {customer.customerImage ? (
                                        <img
                                          className="h-10 w-10 rounded-lg object-cover border-2 border-blue-100"
                                          src={customer.customerImage}
                                          alt={customer.displayName || customer.email}
                                          onError={(e) => {
                                            const target = e.target as HTMLImageElement;
                                            target.style.display = "none";
                                            target.nextElementSibling?.classList.remove("hidden");
                                          }}
                                        />
                                      ) : null}
                                      <div
                                        className={`h-10 w-10 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center ${
                                          customer.customerImage ? "hidden" : ""
                                        }`}
                                      >
                                        <User className="h-5 w-5 text-white" />
                                      </div>
                                    </div>
                                    <div>
                                      <div className="text-sm font-semibold text-gray-900">
                                        {customer.displayName || "No Name"}
                                      </div>
                                      <div className="text-xs text-gray-500">{customer.email}</div>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                  <div className="space-y-1">
                                    {customer.phone && (
                                      <div className="flex items-center text-gray-700">
                                        <Phone className="h-3.5 w-3.5 text-gray-400 mr-2" />
                                        <span className="text-xs">{customer.phone}</span>
                                      </div>
                                    )}
                                    {customer.address && (
                                      <div className="flex items-center text-gray-600">
                                        <MapPin className="h-3.5 w-3.5 text-gray-400 mr-2" />
                                        <span className="text-xs truncate max-w-xs">{customer.address}</span>
                                      </div>
                                    )}
                                  </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <span className="text-sm font-semibold text-gray-900">
                                    {formatPrice(customer.totalSpent || 0)}
                                  </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <span className="text-sm font-semibold text-red-600">
                                    {formatPrice(customer.receivables || 0)}
                                  </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <span className="text-sm text-gray-500">
                                    {formatDate(customer.createdAt)}
                                  </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                  <button
                                    ref={(el) => {
                                      buttonRefs.current[customer.uid] = el;
                                    }}
                                    onClick={() => handleDropdownToggle(customer.uid)}
                                    className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
                                    aria-label="Customer actions"
                                  >
                                    <MoreVertical className="h-4 w-4 text-gray-600" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {/* Retailer Pagination */}
                      <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
                        <div className="flex-1 flex justify-between sm:hidden">
                          <button
                            onClick={() => setRetailerPage(Math.max(1, retailerPage - 1))}
                            disabled={retailerPage === 1}
                            className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 transition-colors"
                          >
                            Previous
                          </button>
                          <button
                            onClick={() => setRetailerPage(Math.min(retailerTotalPages, retailerPage + 1))}
                            disabled={retailerPage === retailerTotalPages}
                            className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 transition-colors"
                          >
                            Next
                          </button>
                        </div>
                        <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                          <div className="flex items-center space-x-2">
                            <p className="text-sm text-gray-700">Rows per page:</p>
                            <span className="text-sm font-medium text-gray-900">{rowsPerPage}</span>
                            <p className="text-sm text-gray-700">
                              Showing {retailerStartIndex + 1} to {Math.min(retailerEndIndex, retailerCustomers.length)} of {retailerCustomers.length}
                            </p>
                          </div>
                          <div>
                            <nav className="relative z-0 inline-flex rounded-lg shadow-sm -space-x-px" aria-label="Pagination">
                              <button
                                onClick={() => setRetailerPage(Math.max(1, retailerPage - 1))}
                                disabled={retailerPage === 1}
                                className="relative inline-flex items-center px-2 py-2 rounded-l-lg border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                              >
                                <ChevronLeft className="h-5 w-5" />
                              </button>
                              <span className="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700">
                                Page {retailerPage} of {retailerTotalPages || 1}
                              </span>
                              <button
                                onClick={() => setRetailerPage(Math.min(retailerTotalPages, retailerPage + 1))}
                                disabled={retailerPage === retailerTotalPages}
                                className="relative inline-flex items-center px-2 py-2 rounded-r-lg border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                              >
                                <ChevronRight className="h-5 w-5" />
                              </button>
                            </nav>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  {(selectedCustomerType === null || selectedCustomerType === "wholesaler") && wholesalerCustomers.length > 0 && (
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                      <div className="bg-gradient-to-r from-orange-50 to-amber-50 border-b border-orange-100 px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2.5 bg-white rounded-xl shadow-sm">
                            <Building2 className="h-5 w-5 text-orange-600" />
                          </div>
                          <div>
                            <h2 className="text-lg font-bold text-gray-900">Wholesaler Customers</h2>
                            <p className="text-sm text-gray-600">{wholesalerCustomers.length} {wholesalerCustomers.length === 1 ? 'wholesaler' : 'wholesalers'}</p>
                          </div>
                        </div>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                                Customer
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                                Contact
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                                Total Spent
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                                Receivables
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                                Joined
                              </th>
                              <th className="relative px-6 py-3">
                                <span className="sr-only">Actions</span>
                              </th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {wholesalerPageCustomers.map((customer) => (
                              <tr key={customer.uid} className="hover:bg-orange-50/30 transition-colors">
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <div className="flex items-center gap-3">
                                    <div className="flex-shrink-0 h-10 w-10">
                                      {customer.customerImage ? (
                                        <img
                                          className="h-10 w-10 rounded-lg object-cover border-2 border-orange-100"
                                          src={customer.customerImage}
                                          alt={customer.displayName || customer.email}
                                          onError={(e) => {
                                            const target = e.target as HTMLImageElement;
                                            target.style.display = "none";
                                            target.nextElementSibling?.classList.remove("hidden");
                                          }}
                                        />
                                      ) : null}
                                      <div
                                        className={`h-10 w-10 rounded-lg bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center ${
                                          customer.customerImage ? "hidden" : ""
                                        }`}
                                      >
                                        <Building2 className="h-5 w-5 text-white" />
                                      </div>
                                    </div>
                                    <div>
                                      <div className="text-sm font-semibold text-gray-900">
                                        {customer.displayName || "No Name"}
                                      </div>
                                      <div className="text-xs text-gray-500">{customer.email}</div>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                  <div className="space-y-1">
                                    {customer.phone && (
                                      <div className="flex items-center text-gray-700">
                                        <Phone className="h-3.5 w-3.5 text-gray-400 mr-2" />
                                        <span className="text-xs">{customer.phone}</span>
                                      </div>
                                    )}
                                    {customer.address && (
                                      <div className="flex items-center text-gray-600">
                                        <MapPin className="h-3.5 w-3.5 text-gray-400 mr-2" />
                                        <span className="text-xs truncate max-w-xs">{customer.address}</span>
                                      </div>
                                    )}
                                  </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <span className="text-sm font-semibold text-gray-900">
                                    {formatPrice(customer.totalSpent || 0)}
                                  </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <span className="text-sm font-semibold text-red-600">
                                    {formatPrice(customer.receivables || 0)}
                                  </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <span className="text-sm text-gray-500">
                                    {formatDate(customer.createdAt)}
                                  </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                  <button
                                    ref={(el) => {
                                      buttonRefs.current[customer.uid] = el;
                                    }}
                                    onClick={() => handleDropdownToggle(customer.uid)}
                                    className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
                                    aria-label="Customer actions"
                                  >
                                    <MoreVertical className="h-4 w-4 text-gray-600" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {/* Wholesaler Pagination */}
                      <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
                        <div className="flex-1 flex justify-between sm:hidden">
                          <button
                            onClick={() => setWholesalerPage(Math.max(1, wholesalerPage - 1))}
                            disabled={wholesalerPage === 1}
                            className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 transition-colors"
                          >
                            Previous
                          </button>
                          <button
                            onClick={() => setWholesalerPage(Math.min(wholesalerTotalPages, wholesalerPage + 1))}
                            disabled={wholesalerPage === wholesalerTotalPages}
                            className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 transition-colors"
                          >
                            Next
                          </button>
                        </div>
                        <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                          <div className="flex items-center space-x-2">
                            <p className="text-sm text-gray-700">Rows per page:</p>
                            <span className="text-sm font-medium text-gray-900">{rowsPerPage}</span>
                            <p className="text-sm text-gray-700">
                              Showing {wholesalerStartIndex + 1} to {Math.min(wholesalerEndIndex, wholesalerCustomers.length)} of {wholesalerCustomers.length}
                            </p>
                          </div>
                          <div>
                            <nav className="relative z-0 inline-flex rounded-lg shadow-sm -space-x-px" aria-label="Pagination">
                              <button
                                onClick={() => setWholesalerPage(Math.max(1, wholesalerPage - 1))}
                                disabled={wholesalerPage === 1}
                                className="relative inline-flex items-center px-2 py-2 rounded-l-lg border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                              >
                                <ChevronLeft className="h-5 w-5" />
                              </button>
                              <span className="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700">
                                Page {wholesalerPage} of {wholesalerTotalPages || 1}
                              </span>
                              <button
                                onClick={() => setWholesalerPage(Math.min(wholesalerTotalPages, wholesalerPage + 1))}
                                disabled={wholesalerPage === wholesalerTotalPages}
                                className="relative inline-flex items-center px-2 py-2 rounded-r-lg border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                              >
                                <ChevronRight className="h-5 w-5" />
                              </button>
                            </nav>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  {(selectedCustomerType === null || selectedCustomerType === "distributor") && distributorCustomers.length > 0 && (
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                      <div className="bg-gradient-to-r from-purple-50 to-indigo-50 border-b border-purple-100 px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2.5 bg-white rounded-xl shadow-sm">
                            <Building2 className="h-5 w-5 text-purple-600" />
                          </div>
                          <div>
                            <h2 className="text-lg font-bold text-gray-900">Distributor Customers</h2>
                            <p className="text-sm text-gray-600">{distributorCustomers.length} {distributorCustomers.length === 1 ? 'distributor' : 'distributors'}</p>
                          </div>
                        </div>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                                Customer
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                                Contact
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                                Total Spent
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                                Receivables
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                                Joined
                              </th>
                              <th className="relative px-6 py-3">
                                <span className="sr-only">Actions</span>
                              </th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {distributorPageCustomers.map((customer) => (
                              <tr key={customer.uid} className="hover:bg-purple-50/30 transition-colors">
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <div className="flex items-center gap-3">
                                    <div className="flex-shrink-0 h-10 w-10">
                                      {customer.customerImage ? (
                                        <img
                                          className="h-10 w-10 rounded-lg object-cover border-2 border-purple-100"
                                          src={customer.customerImage}
                                          alt={customer.displayName || customer.email}
                                          onError={(e) => {
                                            const target = e.target as HTMLImageElement;
                                            target.style.display = "none";
                                            target.nextElementSibling?.classList.remove("hidden");
                                          }}
                                        />
                                      ) : null}
                                      <div
                                        className={`h-10 w-10 rounded-lg bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center ${
                                          customer.customerImage ? "hidden" : ""
                                        }`}
                                      >
                                        <Building2 className="h-5 w-5 text-white" />
                                      </div>
                                    </div>
                                    <div>
                                      <div className="text-sm font-semibold text-gray-900">
                                        {customer.displayName || "No Name"}
                                      </div>
                                      <div className="text-xs text-gray-500">{customer.email}</div>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                  <div className="space-y-1">
                                    {customer.phone && (
                                      <div className="flex items-center text-gray-700">
                                        <Phone className="h-3.5 w-3.5 text-gray-400 mr-2" />
                                        <span className="text-xs">{customer.phone}</span>
                                      </div>
                                    )}
                                    {customer.address && (
                                      <div className="flex items-center text-gray-600">
                                        <MapPin className="h-3.5 w-3.5 text-gray-400 mr-2" />
                                        <span className="text-xs truncate max-w-xs">{customer.address}</span>
                                      </div>
                                    )}
                                  </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <span className="text-sm font-semibold text-gray-900">
                                    {formatPrice(customer.totalSpent || 0)}
                                  </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <span className="text-sm font-semibold text-red-600">
                                    {formatPrice(customer.receivables || 0)}
                                  </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <span className="text-sm text-gray-500">
                                    {formatDate(customer.createdAt)}
                                  </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                  <button
                                    ref={(el) => {
                                      buttonRefs.current[customer.uid] = el;
                                    }}
                                    onClick={() => handleDropdownToggle(customer.uid)}
                                    className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
                                    aria-label="Customer actions"
                                  >
                                    <MoreVertical className="h-4 w-4 text-gray-600" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {/* Distributor Pagination */}
                      <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
                        <div className="flex-1 flex justify-between sm:hidden">
                          <button
                            onClick={() => setDistributorPage(Math.max(1, distributorPage - 1))}
                            disabled={distributorPage === 1}
                            className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 transition-colors"
                          >
                            Previous
                          </button>
                          <button
                            onClick={() => setDistributorPage(Math.min(distributorTotalPages, distributorPage + 1))}
                            disabled={distributorPage === distributorTotalPages}
                            className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 transition-colors"
                          >
                            Next
                          </button>
                        </div>
                        <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                          <div className="flex items-center space-x-2">
                            <p className="text-sm text-gray-700">Rows per page:</p>
                            <span className="text-sm font-medium text-gray-900">{rowsPerPage}</span>
                            <p className="text-sm text-gray-700">
                              Showing {distributorStartIndex + 1} to {Math.min(distributorEndIndex, distributorCustomers.length)} of {distributorCustomers.length}
                            </p>
                          </div>
                          <div>
                            <nav className="relative z-0 inline-flex rounded-lg shadow-sm -space-x-px" aria-label="Pagination">
                              <button
                                onClick={() => setDistributorPage(Math.max(1, distributorPage - 1))}
                                disabled={distributorPage === 1}
                                className="relative inline-flex items-center px-2 py-2 rounded-l-lg border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                              >
                                <ChevronLeft className="h-5 w-5" />
                              </button>
                              <span className="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700">
                                Page {distributorPage} of {distributorTotalPages || 1}
                              </span>
                              <button
                                onClick={() => setDistributorPage(Math.min(distributorTotalPages, distributorPage + 1))}
                                disabled={distributorPage === distributorTotalPages}
                                className="relative inline-flex items-center px-2 py-2 rounded-r-lg border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                              >
                                <ChevronRight className="h-5 w-5" />
                              </button>
                            </nav>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  {(selectedCustomerType === null || selectedCustomerType === "individual") && individualCustomers.length > 0 && (
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                      <div className="bg-gradient-to-r from-green-50 to-emerald-50 border-b border-green-100 px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2.5 bg-white rounded-xl shadow-sm">
                            <User className="h-5 w-5 text-green-600" />
                          </div>
                          <div>
                            <h2 className="text-lg font-bold text-gray-900">Individual Customers</h2>
                            <p className="text-sm text-gray-600">{individualCustomers.length} {individualCustomers.length === 1 ? 'individual' : 'individuals'}</p>
                          </div>
                        </div>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                                Customer
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                                Contact
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                                Total Spent
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                                Receivables
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                                Joined
                              </th>
                              <th className="relative px-6 py-3">
                                <span className="sr-only">Actions</span>
                              </th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {individualPageCustomers.map((customer) => (
                              <tr key={customer.uid} className="hover:bg-green-50/30 transition-colors">
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <div className="flex items-center gap-3">
                                    <div className="flex-shrink-0 h-10 w-10">
                                      {customer.customerImage ? (
                                        <img
                                          className="h-10 w-10 rounded-lg object-cover border-2 border-green-100"
                                          src={customer.customerImage}
                                          alt={customer.displayName || customer.email}
                                          onError={(e) => {
                                            const target = e.target as HTMLImageElement;
                                            target.style.display = "none";
                                            target.nextElementSibling?.classList.remove("hidden");
                                          }}
                                        />
                                      ) : null}
                                      <div
                                        className={`h-10 w-10 rounded-lg bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center ${
                                          customer.customerImage ? "hidden" : ""
                                        }`}
                                      >
                                        <User className="h-5 w-5 text-white" />
                                      </div>
                                    </div>
                                    <div>
                                      <div className="text-sm font-semibold text-gray-900">
                                        {customer.displayName || "No Name"}
                                      </div>
                                      <div className="text-xs text-gray-500">{customer.email}</div>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                  <div className="space-y-1">
                                    {customer.phone && (
                                      <div className="flex items-center text-gray-700">
                                        <Phone className="h-3.5 w-3.5 text-gray-400 mr-2" />
                                        <span className="text-xs">{customer.phone}</span>
                                      </div>
                                    )}
                                    {customer.address && (
                                      <div className="flex items-center text-gray-600">
                                        <MapPin className="h-3.5 w-3.5 text-gray-400 mr-2" />
                                        <span className="text-xs truncate max-w-xs">{customer.address}</span>
                                      </div>
                                    )}
                                  </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <span className="text-sm font-semibold text-gray-900">
                                    {formatPrice(customer.totalSpent || 0)}
                                  </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <span className="text-sm font-semibold text-red-600">
                                    {formatPrice(customer.receivables || 0)}
                                  </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <span className="text-sm text-gray-500">
                                    {formatDate(customer.createdAt)}
                                  </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                  <button
                                    ref={(el) => {
                                      buttonRefs.current[customer.uid] = el;
                                    }}
                                    onClick={() => handleDropdownToggle(customer.uid)}
                                    className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
                                    aria-label="Customer actions"
                                  >
                                    <MoreVertical className="h-4 w-4 text-gray-600" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {/* Individual Pagination */}
                      <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
                        <div className="flex-1 flex justify-between sm:hidden">
                          <button
                            onClick={() => setIndividualPage(Math.max(1, individualPage - 1))}
                            disabled={individualPage === 1}
                            className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 transition-colors"
                          >
                            Previous
                          </button>
                          <button
                            onClick={() => setIndividualPage(Math.min(individualTotalPages, individualPage + 1))}
                            disabled={individualPage === individualTotalPages}
                            className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 transition-colors"
                          >
                            Next
                          </button>
                        </div>
                        <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                          <div className="flex items-center space-x-2">
                            <p className="text-sm text-gray-700">Rows per page:</p>
                            <span className="text-sm font-medium text-gray-900">{rowsPerPage}</span>
                            <p className="text-sm text-gray-700">
                              Showing {individualStartIndex + 1} to {Math.min(individualEndIndex, individualCustomers.length)} of {individualCustomers.length}
                            </p>
                          </div>
                          <div>
                            <nav className="relative z-0 inline-flex rounded-lg shadow-sm -space-x-px" aria-label="Pagination">
                              <button
                                onClick={() => setIndividualPage(Math.max(1, individualPage - 1))}
                                disabled={individualPage === 1}
                                className="relative inline-flex items-center px-2 py-2 rounded-l-lg border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                              >
                                <ChevronLeft className="h-5 w-5" />
                              </button>
                              <span className="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700">
                                Page {individualPage} of {individualTotalPages || 1}
                              </span>
                              <button
                                onClick={() => setIndividualPage(Math.min(individualTotalPages, individualPage + 1))}
                                disabled={individualPage === individualTotalPages}
                                className="relative inline-flex items-center px-2 py-2 rounded-r-lg border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                              >
                                <ChevronRight className="h-5 w-5" />
                              </button>
                            </nav>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  {(selectedCustomerType === null || selectedCustomerType === "others") && unassignedCustomers.length > 0 && (
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                      <div className="bg-gradient-to-r from-gray-50 to-slate-50 border-b border-gray-200 px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2.5 bg-white rounded-xl shadow-sm">
                            <Users className="h-5 w-5 text-gray-600" />
                          </div>
                          <div>
                            <h2 className="text-lg font-bold text-gray-900">Other Customers</h2>
                            <p className="text-sm text-gray-600">{unassignedCustomers.length} {unassignedCustomers.length === 1 ? 'customer' : 'customers'} (no type assigned)</p>
                          </div>
                        </div>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                                Customer
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                                Contact
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                                Total Spent
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                                Receivables
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                                Joined
                              </th>
                              <th className="relative px-6 py-3">
                                <span className="sr-only">Actions</span>
                              </th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {unassignedPageCustomers.map((customer) => (
                              <tr key={customer.uid} className="hover:bg-gray-50/30 transition-colors">
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <div className="flex items-center gap-3">
                                    <div className="flex-shrink-0 h-10 w-10">
                                      {customer.customerImage ? (
                                        <img
                                          className="h-10 w-10 rounded-lg object-cover border-2 border-gray-200"
                                          src={customer.customerImage}
                                          alt={customer.displayName || customer.email}
                                          onError={(e) => {
                                            const target = e.target as HTMLImageElement;
                                            target.style.display = "none";
                                            target.nextElementSibling?.classList.remove("hidden");
                                          }}
                                        />
                                      ) : null}
                                      <div
                                        className={`h-10 w-10 rounded-lg bg-gradient-to-br from-gray-500 to-slate-600 flex items-center justify-center ${
                                          customer.customerImage ? "hidden" : ""
                                        }`}
                                      >
                                        <User className="h-5 w-5 text-white" />
                                      </div>
                                    </div>
                                    <div>
                                      <div className="text-sm font-semibold text-gray-900">
                                        {customer.displayName || "No Name"}
                                      </div>
                                      <div className="text-xs text-gray-500">{customer.email}</div>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                  <div className="space-y-1">
                                    {customer.phone && (
                                      <div className="flex items-center text-gray-700">
                                        <Phone className="h-3.5 w-3.5 text-gray-400 mr-2" />
                                        <span className="text-xs">{customer.phone}</span>
                                      </div>
                                    )}
                                    {customer.address && (
                                      <div className="flex items-center text-gray-600">
                                        <MapPin className="h-3.5 w-3.5 text-gray-400 mr-2" />
                                        <span className="text-xs truncate max-w-xs">{customer.address}</span>
                                      </div>
                                    )}
                                  </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <span className="text-sm font-semibold text-gray-900">
                                    {formatPrice(customer.totalSpent || 0)}
                                  </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <span className="text-sm font-semibold text-red-600">
                                    {formatPrice(customer.receivables || 0)}
                                  </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <span className="text-sm text-gray-500">
                                    {formatDate(customer.createdAt)}
                                  </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                  <button
                                    ref={(el) => {
                                      buttonRefs.current[customer.uid] = el;
                                    }}
                                    onClick={() => handleDropdownToggle(customer.uid)}
                                    className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
                                    aria-label="Customer actions"
                                  >
                                    <MoreVertical className="h-4 w-4 text-gray-600" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {/* Unassigned Pagination */}
                      <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
                        <div className="flex-1 flex justify-between sm:hidden">
                          <button
                            onClick={() => setUnassignedPage(Math.max(1, unassignedPage - 1))}
                            disabled={unassignedPage === 1}
                            className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 transition-colors"
                          >
                            Previous
                          </button>
                          <button
                            onClick={() => setUnassignedPage(Math.min(unassignedTotalPages, unassignedPage + 1))}
                            disabled={unassignedPage === unassignedTotalPages}
                            className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 transition-colors"
                          >
                            Next
                          </button>
                        </div>
                        <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                          <div className="flex items-center space-x-2">
                            <p className="text-sm text-gray-700">Rows per page:</p>
                            <span className="text-sm font-medium text-gray-900">{rowsPerPage}</span>
                            <p className="text-sm text-gray-700">
                              Showing {unassignedStartIndex + 1} to {Math.min(unassignedEndIndex, unassignedCustomers.length)} of {unassignedCustomers.length}
                            </p>
                          </div>
                          <div>
                            <nav className="relative z-0 inline-flex rounded-lg shadow-sm -space-x-px" aria-label="Pagination">
                              <button
                                onClick={() => setUnassignedPage(Math.max(1, unassignedPage - 1))}
                                disabled={unassignedPage === 1}
                                className="relative inline-flex items-center px-2 py-2 rounded-l-lg border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                              >
                                <ChevronLeft className="h-5 w-5" />
                              </button>
                              <span className="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700">
                                Page {unassignedPage} of {unassignedTotalPages || 1}
                              </span>
                              <button
                                onClick={() => setUnassignedPage(Math.min(unassignedTotalPages, unassignedPage + 1))}
                                disabled={unassignedPage === unassignedTotalPages}
                                className="relative inline-flex items-center px-2 py-2 rounded-r-lg border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                              >
                                <ChevronRight className="h-5 w-5" />
                              </button>
                            </nav>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </main>
        </div>
      </div>

      {/* Portal-based dropdown */}
      {openDropdown &&
        dropdownPosition &&
        typeof window !== "undefined" &&
        createPortal(
          <div
            data-dropdown-menu
            className="fixed w-48 bg-white rounded-md shadow-xl border border-gray-200 z-[9999]"
            style={{
              top: `${dropdownPosition.top}px`,
              right: `${dropdownPosition.right}px`,
            }}
          >
            <div className="py-1">
              <button
                onClick={() => {
                  const customer = customers.find(
                    (c) => c.uid === openDropdown,
                  );
                  if (customer) handleEditCustomer(customer);
                }}
                className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
              >
                <Edit className="h-4 w-4 mr-2" />
                Edit Customer
              </button>
              <button
                onClick={() => {
                  const customer = customers.find(
                    (c) => c.uid === openDropdown,
                  );
                  if (customer) handleDeleteCustomer(customer);
                }}
                className="flex items-center w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Customer
              </button>
            </div>
          </div>,
          document.body,
        )}

      {/* Success Message */}
      {successMessage && (
        <div className="fixed top-4 right-4 z-50 bg-green-50 border border-green-200 rounded-lg p-4 shadow-lg max-w-md">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
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
              </div>
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-green-800">
                {successMessage}
              </p>
            </div>
            <div className="ml-auto pl-3">
              <button
                title="Close success message"
                onClick={() => setSuccessMessage(null)}
                className="text-green-400 hover:text-green-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      )}

      <NewCustomerModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingCustomer(null);
        }}
        onSubmit={handleSubmitCustomer}
        customer={editingCustomer ?? undefined}
      />

      <DeleteConfirmationModal
        isOpen={showDeleteModal}
        customer={deletingCustomer}
        isDeleting={isDeleting}
        error={deleteError}
        onConfirm={confirmDeleteCustomer}
        onCancel={cancelDeleteCustomer}
      />
    </ProtectedRoute>
  );
}

export default function CustomerPage() {
  return <CustomerPageContent />;
}

