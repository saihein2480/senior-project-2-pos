"use client";

import React, { useState, useEffect } from "react";
import { X, Search, User, Users, Gift, Filter } from "lucide-react";
import { Customer } from "@/types/customer";
import { SelectedCustomer } from "@/types/cart";

type SourceFilter = "all" | "online" | "pos";
type TypeFilter =
  | "all"
  | "online"
  | "retailer"
  | "wholesaler"
  | "distributor"
  | "individual"
  | "other";

function isOnlineCustomer(customer: Customer) {
  return customer.customerSource === "online" || !!customer.isOnline;
}

/**
 * Label for a customer's category.
 *
 * Online customers are labelled by their origin rather than their stored
 * `customerType`, which defaults to "individual" and is misleading here.
 */
function getCustomerTypeLabel(customer: Customer): {
  label: string;
  className: string;
} {
  if (isOnlineCustomer(customer)) {
    return {
      label: "Online Customer",
      className: "bg-cyan-100 text-cyan-800 border-cyan-200",
    };
  }

  const typeMap: Record<string, { label: string; className: string }> = {
    retailer: {
      label: "Retailer",
      className: "bg-purple-100 text-purple-800 border-purple-200",
    },
    wholesaler: {
      label: "Wholesaler",
      className: "bg-orange-100 text-orange-800 border-orange-200",
    },
    distributor: {
      label: "Distributor",
      className: "bg-indigo-100 text-indigo-800 border-indigo-200",
    },
    individual: {
      label: "Individual",
      className: "bg-green-100 text-green-800 border-green-200",
    },
    other: {
      label: "Other",
      className: "bg-gray-100 text-gray-800 border-gray-200",
    },
  };

  return (
    typeMap[customer.customerType || ""] || {
      label: customer.customerType || "Unknown",
      className: "bg-gray-100 text-gray-800 border-gray-200",
    }
  );
}

/** Count coupons the customer could actually use right now. */
function countUsableCoupons(customer: Customer) {
  const now = Date.now();

  return (customer.coupons || []).filter((coupon) => {
    if (coupon.status !== "active") return false;

    const raw = coupon.expiresAt as unknown;
    const expiresAt =
      raw && typeof (raw as { toDate?: () => Date }).toDate === "function"
        ? (raw as { toDate: () => Date }).toDate()
        : new Date(raw as string | number | Date);

    return Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() > now;
  }).length;
}

interface CustomerSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectCustomer: (customer: SelectedCustomer | null) => void;
  selectedCustomer: SelectedCustomer | null;
}

export function CustomerSelectionModal({
  isOpen,
  onClose,
  onSelectCustomer,
  selectedCustomer,
}: CustomerSelectionModalProps) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [membersOnly, setMembersOnly] = useState(false);

  // Fetch customers when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchCustomers();
    }
  }, [isOpen]);

  const fetchCustomers = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/customers");
      const data = await response.json();

      if (data.success) {
        setCustomers(data.data || []);
      } else {
        setError(data.error || "Failed to fetch customers");
      }
    } catch (error) {
      console.error("Error fetching customers:", error);
      setError("Failed to fetch customers");
    } finally {
      setIsLoading(false);
    }
  };

  // Apply search plus the source/type/member filters
  const filteredCustomers = customers.filter((customer) => {
    const term = searchTerm.trim().toLowerCase();
    const matchesSearch =
      !term ||
      customer.displayName?.toLowerCase().includes(term) ||
      customer.email.toLowerCase().includes(term) ||
      customer.phone?.toLowerCase().includes(term);

    if (!matchesSearch) return false;

    const online = isOnlineCustomer(customer);

    if (sourceFilter === "online" && !online) return false;
    if (sourceFilter === "pos" && online) return false;

    if (typeFilter !== "all") {
      // Online customers are grouped under their own type rather than the
      // "individual" default stored on the record.
      if (typeFilter === "online") {
        if (!online) return false;
      } else if (online || (customer.customerType || "other") !== typeFilter) {
        return false;
      }
    }

    if (membersOnly && !customer.isMember) return false;

    return true;
  });

  const handleSelectCustomer = (customer: Customer) => {
    // Only include optional fields that actually have a value. The cart is
    // persisted to Firestore, which rejects `undefined`.
    const selectedCustomerData: SelectedCustomer = {
      uid: customer.uid,
      email: customer.email,
      ...(customer.displayName ? { displayName: customer.displayName } : {}),
      ...(customer.customerImage
        ? { customerImage: customer.customerImage }
        : {}),
      ...(customer.customerType
        ? { customerType: customer.customerType }
        : {}),
    };
    onSelectCustomer(selectedCustomerData);
    onClose();
  };

  const handleSelectUnknown = () => {
    onSelectCustomer(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-[100000]">
      <div className="bg-gradient-to-br from-white to-pink-50 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col border-2 border-pink-200">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b-2 border-pink-200 bg-gradient-to-r from-rose-500 to-pink-500 rounded-t-2xl">
          <div className="flex items-center space-x-3">
            <Users className="h-6 w-6 text-white" />
            <h2 className="text-xl font-bold text-white">Select Customer</h2>
          </div>
          <button
            title="Close"
            onClick={onClose}
            className="text-white hover:bg-white/20 rounded-full p-2 transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Search + filters */}
        <div className="p-6 border-b border-pink-200 space-y-3 bg-white/50">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-rose-400" />
            <input
              type="text"
              placeholder="Search customers by name, email, or phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border-2 border-pink-300 rounded-lg focus:ring-2 focus:ring-rose-400 focus:border-rose-500 text-gray-900 bg-white placeholder-gray-400"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs text-rose-600 font-medium">
              <Filter className="h-3.5 w-3.5" />
              Filter
            </div>

            <div className="relative">
              <select
                title="Filter by customer source"
                value={sourceFilter}
                onChange={(e) =>
                  setSourceFilter(e.target.value as SourceFilter)
                }
                className="px-3 py-1.5 border-2 border-pink-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-rose-400"
              >
                <option value="all">All Sources</option>
                <option value="online">Online</option>
                <option value="pos">Walk-in</option>
              </select>
            </div>

            <div className="relative">
              <select
                title="Filter by customer type"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
                className="px-3 py-1.5 border-2 border-pink-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-rose-400"
              >
                <option value="all">All Types</option>
                <option value="online">Online Customer</option>
                <option value="retailer">Retailer</option>
                <option value="wholesaler">Wholesaler</option>
                <option value="distributor">Distributor</option>
                <option value="individual">Individual</option>
                <option value="other">Other</option>
              </select>
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-700 font-medium">
              <input
                type="checkbox"
                checked={membersOnly}
                onChange={(e) => setMembersOnly(e.target.checked)}
                className="h-4 w-4 rounded border-pink-300 text-rose-600 focus:ring-rose-500"
              />
              Members only
            </label>

            {(sourceFilter !== "all" ||
              typeFilter !== "all" ||
              membersOnly ||
              searchTerm) && (
              <button
                type="button"
                onClick={() => {
                  setSourceFilter("all");
                  setTypeFilter("all");
                  setMembersOnly(false);
                  setSearchTerm("");
                }}
                className="text-xs font-semibold text-rose-600 hover:text-rose-800 underline"
              >
                Clear
              </button>
            )}

            <span className="ml-auto text-xs text-gray-600 font-medium">
              {filteredCustomers.length} of {customers.length}
            </span>
          </div>
        </div>

        {/* Customer List */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Unknown Customer Option */}
          <div
            onClick={handleSelectUnknown}
            className={`flex items-center p-4 mb-2 rounded-xl border-2 cursor-pointer transition-all shadow-sm ${
              !selectedCustomer
                ? "border-rose-500 bg-gradient-to-r from-rose-50 to-pink-100 shadow-md"
                : "border-pink-200 hover:border-pink-300 hover:bg-pink-50"
            }`}
          >
            <div className="flex-shrink-0 h-12 w-12">
              <div className="h-12 w-12 rounded-full bg-gradient-to-br from-gray-200 to-pink-200 flex items-center justify-center shadow-sm">
                <User className="h-6 w-6 text-gray-600" />
              </div>
            </div>
            <div className="ml-4 flex-1">
              <div className="text-sm font-semibold text-gray-900">
                Unknown Customer
              </div>
              <div className="text-sm text-gray-600">
                Default customer for walk-in sales
              </div>
            </div>
            {!selectedCustomer && (
              <div className="flex-shrink-0">
                <div className="h-5 w-5 rounded-full bg-gradient-to-r from-rose-500 to-pink-500 shadow-sm"></div>
              </div>
            )}
          </div>

          {/* Loading State */}
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-rose-500"></div>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="text-center py-8">
              <p className="text-rose-600 font-medium">{error}</p>
              <button
                onClick={fetchCustomers}
                className="mt-2 text-rose-600 hover:text-rose-800 font-semibold underline"
              >
                Try again
              </button>
            </div>
          )}

          {/* Customer List */}
          {!isLoading && !error && (
            <div className="space-y-2">
              {filteredCustomers.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  {searchTerm
                    ? "No customers found matching your search."
                    : "No customers available."}
                </div>
              ) : (
                filteredCustomers.map((customer) => (
                  <div
                    key={customer.uid}
                    onClick={() => handleSelectCustomer(customer)}
                    className={`flex items-center p-4 rounded-xl border-2 cursor-pointer transition-all shadow-sm ${
                      selectedCustomer?.uid === customer.uid
                        ? "border-rose-500 bg-gradient-to-r from-rose-50 to-pink-100 shadow-md"
                        : "border-pink-200 hover:border-pink-300 hover:bg-pink-50"
                    }`}
                  >
                    <div className="flex-shrink-0 h-12 w-12">
                      {customer.customerImage ? (
                        <img
                          className="h-12 w-12 rounded-full object-cover border-2 border-pink-300 shadow-sm"
                          src={customer.customerImage}
                          alt={customer.displayName || customer.email}
                        />
                      ) : (
                        <div className="h-12 w-12 rounded-full bg-gradient-to-br from-pink-200 to-rose-200 flex items-center justify-center shadow-sm">
                          <User className="h-6 w-6 text-rose-600" />
                        </div>
                      )}
                    </div>
                    <div className="ml-4 flex-1">
                      <div className="text-sm font-semibold text-gray-900">
                        {customer.displayName || "No Name"}
                      </div>
                      <div className="text-sm text-gray-600">
                        {customer.email}
                      </div>
                      {customer.phone && (
                        <div className="text-xs text-gray-500">
                          {customer.phone}
                        </div>
                      )}
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        {(() => {
                          const typeInfo = getCustomerTypeLabel(customer);
                          return (
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border shadow-sm ${typeInfo.className}`}
                            >
                              {typeInfo.label}
                            </span>
                          );
                        })()}

                        {customer.isMember && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border bg-gradient-to-r from-purple-100 to-pink-100 text-purple-700 border-purple-300 shadow-sm">
                            <Gift className="h-3 w-3" />
                            Member
                          </span>
                        )}

                        {(() => {
                          const usable = countUsableCoupons(customer);
                          if (usable === 0) return null;
                          return (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border bg-gradient-to-r from-green-100 to-emerald-100 text-green-700 border-green-300 shadow-sm">
                              {usable} coupon{usable === 1 ? "" : "s"}
                            </span>
                          );
                        })()}
                      </div>
                    </div>
                    {selectedCustomer?.uid === customer.uid && (
                      <div className="flex-shrink-0">
                        <div className="h-5 w-5 rounded-full bg-gradient-to-r from-rose-500 to-pink-500 shadow-sm"></div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end space-x-3 p-6 border-t-2 border-pink-200 bg-white/50 rounded-b-2xl">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold text-gray-700 bg-white border-2 border-pink-300 rounded-lg hover:bg-pink-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-rose-500 shadow-sm transition-all"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
