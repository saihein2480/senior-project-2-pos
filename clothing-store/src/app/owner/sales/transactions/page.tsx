"use client";
import { toast } from 'react-hot-toast';

import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useSettings } from "@/contexts/SettingsContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { transactionService, Transaction } from "@/services/transactionService";
import { ShopService } from "@/services/shopService";
import { Sidebar } from "@/components/ui/Sidebar";
import { SettingsService } from "@/services/settingsService";
import { TopNavBar } from "@/components/ui/TopNavBar";
import {
  Search,
  Filter,
  Download,
  Eye,
  Calendar,
  CreditCard,
  Smartphone,
  Wallet,
  RotateCcw,
  X,
  AlertTriangle,
  MoreVertical,
  ChevronDown,
  CheckCircle,
  Truck,
  ChevronLeft,
  ChevronRight,
  Trash,
} from "lucide-react";
import { detectColorName } from "@/lib/colorUtils";

export default function TransactionsPage() {
  const { user } = useAuth();
  const isOwner = user?.role === "owner";
  const { formatPrice } = useCurrency();
  const { businessSettings } = useSettings();
  const { t } = useLanguage();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [shops, setShops] = useState<{ id: string; name: string }[]>([]);
  const [filterBranch, setFilterBranch] = useState<string>(""); // Will be set from settings
  const [filterStatus, setFilterStatus] = useState<
    | "all"
    | "completed"
    | "pending"
    | "cancelled"
    | "refunded"
    | "partially_refunded"
  >("all");
  const [filterPaymentMethod, setFilterPaymentMethod] = useState<
    "all" | "cash" | "scan" | "wallet" | "cod"
  >("all");
  const [dateRange, setDateRange] = useState<
    "today" | "7d" | "30d" | "90d" | "all" | "custom"
  >("30d");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  // Layout state
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isCartModalOpen, setIsCartModalOpen] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Modal states
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showViewDetailsModal, setShowViewDetailsModal] = useState(false);
  const [selectedTransaction, setSelectedTransaction] =
    useState<Transaction | null>(null);
  const [refundItems, setRefundItems] = useState<{ [key: string]: number }>({});
  const [selectedTransactions, setSelectedTransactions] = useState<string[]>(
    [],
  );
  const [isProcessingRefund, setIsProcessingRefund] = useState(false);
  const [isProcessingCancel, setIsProcessingCancel] = useState(false);
  const [isProcessingDelete, setIsProcessingDelete] = useState(false);

  const isProbablyId = (s?: string) =>
    !!s &&
    (/(^cv|[-_].+-)/.test(s) || // Original ID patterns
      /^\d{13,}/.test(s) || // Long numeric IDs (timestamps)
      /^[a-f0-9]{16,}$/i.test(s) || // Long hex IDs
      /^\d+[a-z]{5,}$/i.test(s)); // Timestamp + random chars

  const getDisplayColor = (item: Transaction["items"][number]): string => {
    const hex = item.colorCode || "#000000";
    if (item.selectedColor && !isProbablyId(item.selectedColor)) {
      return item.selectedColor;
    }
    try {
      return detectColorName(hex) || hex;
    } catch (e) {
      return hex;
    }
  };

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  // Dropdown state
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [dropdownPosition, setDropdownPosition] = useState<{
    top: number;
    right: number;
  } | null>(null);
  const buttonRefs = useRef<{ [key: string]: HTMLButtonElement | null }>({});

  useEffect(() => {
    loadTransactions();

    // Load shops
    const fetchShops = async () => {
      try {
        const shopsData = await ShopService.getAllShops();
        setShops(shopsData || []);
      } catch (error) {
        console.error("Error fetching shops:", error);
      }
    };
    fetchShops();
  }, []);

  // Set initial branch filter from settings
  useEffect(() => {
    if (businessSettings?.currentBranch && filterBranch === "") {
      setFilterBranch(businessSettings.currentBranch);
    }
  }, [businessSettings, filterBranch]);

  // Initialize date filters
  useEffect(() => {
    if (!startDate || !endDate) {
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 30);

      setStartDate(start.toISOString().split("T")[0]);
      setEndDate(end.toISOString().split("T")[0]);
    }
  }, [startDate, endDate]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (openDropdown) {
        const target = event.target as Element;

        // Check if click is on the dropdown button
        const isDropdownButton = Object.values(buttonRefs.current).some(
          (button) => button && button.contains(target),
        );

        // Check if click is on the dropdown menu
        const isDropdownMenu = target.closest("[data-dropdown-menu]");

        if (!isDropdownButton && !isDropdownMenu) {
          setOpenDropdown(null);
          setDropdownPosition(null);
        }
      }
    };

    const handleScroll = () => {
      if (openDropdown) {
        setOpenDropdown(null);
        setDropdownPosition(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("scroll", handleScroll, true);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [openDropdown]);

  const loadTransactions = async () => {
    try {
      setLoading(true);
      const data = await transactionService.getTransactions();
      setTransactions(data);
    } catch (error) {
      console.error("Error loading transactions:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredTransactions = transactions.filter((transaction) => {
    const matchesSearch =
      transaction.transactionId
        .toLowerCase()
        .includes(searchTerm.toLowerCase()) ||
      transaction.customer?.displayName
        ?.toLowerCase()
        .includes(searchTerm.toLowerCase());

    const matchesStatus =
      filterStatus === "all" || transaction.status === filterStatus;
    const matchesPaymentMethod =
      filterPaymentMethod === "all" ||
      transaction.paymentMethod === filterPaymentMethod;

    // Branch filter - show all if "all" selected, otherwise filter by branch name
    const matchesBranch =
      filterBranch === "all" ||
      !filterBranch ||
      transaction.branchName === filterBranch;

    // Date range filtering
    let matchesDateRange = true;
    if (dateRange !== "all") {
      let rangeStartDate: Date;
      let rangeEndDate: Date = new Date();

      if (dateRange === "custom" && startDate && endDate) {
        rangeStartDate = new Date(startDate);
        rangeEndDate = new Date(endDate);
        rangeEndDate.setHours(23, 59, 59, 999);
      } else {
        const now = new Date();

        switch (dateRange) {
          case "today":
            rangeStartDate = new Date(
              now.getFullYear(),
              now.getMonth(),
              now.getDate(),
            );
            break;
          case "7d":
            rangeStartDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
          case "30d":
            rangeStartDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            break;
          case "90d":
            rangeStartDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
            break;
          default:
            rangeStartDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        }
      }

      const transactionDate = new Date(transaction.timestamp);
      matchesDateRange =
        transactionDate >= rangeStartDate && transactionDate <= rangeEndDate;
    }

    return (
      matchesSearch &&
      matchesStatus &&
      matchesPaymentMethod &&
      matchesDateRange &&
      matchesBranch
    );
  });

  // Sort filtered transactions by timestamp (newest first) and then paginate
  const sortedFilteredTransactions = [...filteredTransactions].sort((a, b) => {
    const aTime = new Date(a.timestamp).getTime();
    const bTime = new Date(b.timestamp).getTime();
    return bTime - aTime;
  });

  // Pagination calculations
  const totalPages = Math.ceil(sortedFilteredTransactions.length / rowsPerPage);
  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = startIndex + rowsPerPage;
  const currentTransactions = sortedFilteredTransactions.slice(
    startIndex,
    endIndex,
  );

  // Filter for revenue-generating transactions (completed, partially refunded, and refunded)
  const revenueTransactions = sortedFilteredTransactions.filter(
    (t) =>
      t.status === "completed" ||
      t.status === "partially_refunded" ||
      t.status === "refunded",
  );

  // Only transactions sold in MMK
  const revenueTransactionsMMK = revenueTransactions.filter(
    (t) => (t.sellingCurrency || "THB").toUpperCase() === "MMK",
  );

  // Only transactions sold in THB
  const revenueTransactionsTHB = revenueTransactions.filter(
    (t) => (t.sellingCurrency || "THB").toUpperCase() === "THB",
  );

  // Calculate net revenue (original total minus refunded amounts)
  const calculateNetRevenue = (transactions: Transaction[]) => {
    return transactions.reduce((total, transaction) => {
      const originalAmount = transaction.total;
      const refundedAmount =
        transaction.refunds?.reduce(
          (sum, refund) => sum + refund.totalAmount,
          0,
        ) || 0;
      // Ensure net revenue is never negative (safeguard against data inconsistencies)
      return total + Math.max(0, originalAmount - refundedAmount);
    }, 0);
  };

  // Calculate total profit (Original Price - Unit Price for each item)
  const calculateTotalProfit = (transactions: Transaction[]) => {
    return transactions.reduce((total, transaction) => {
      const transactionProfit = transaction.items.reduce((itemTotal, item) => {
        const profitPerItem =
          (item.unitPrice - item.originalPrice) * item.quantity;
        console.log(
          "Transaction - Item:",
          item.groupName,
          "Original:",
          item.originalPrice,
          "Unit:",
          item.unitPrice,
          "Qty:",
          item.quantity,
          "Profit:",
          profitPerItem,
        );
        return itemTotal + profitPerItem;
      }, 0);

      // Subtract refunded profit
      const refundedProfit =
        transaction.refunds?.reduce((refundTotal, refund) => {
          return (
            refundTotal +
            refund.items.reduce((refundItemTotal, refundItem) => {
              const originalItem = transaction.items[refundItem.itemIndex];
              if (originalItem) {
                const refundedProfitPerItem =
                  (originalItem.unitPrice - originalItem.originalPrice) *
                  refundItem.quantity;
                return refundItemTotal + refundedProfitPerItem;
              }
              return refundItemTotal;
            }, 0)
          );
        }, 0) || 0;

      return total + Math.max(0, transactionProfit - refundedProfit);
    }, 0);
  };

  // Calculate completed transactions count (excluding fully refunded)
  const completedTransactionsCount = revenueTransactions.filter(
    (t) => t.status !== "refunded",
  ).length;

  const formatInMMK = (amount: number) => {
    const from = (businessSettings?.defaultCurrency as "THB" | "MMK") || "THB";
    const rate = businessSettings?.currencyRate || 0;
    const converted = SettingsService.convertPrice(
      amount,
      from,
      "MMK",
      rate,
      (businessSettings?.defaultCurrency as "THB" | "MMK" | undefined) || "THB",
    );
    return SettingsService.formatPrice(converted, "MMK");
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getPaymentMethodIcon = (method: string) => {
    switch (method) {
      case "cash":
        return <CreditCard className="h-4 w-4 text-gray-900" />;
      case "scan":
        return <Smartphone className="h-4 w-4 text-gray-900" />;
      case "wallet":
        return <Wallet className="h-4 w-4 text-gray-900" />;
      case "cod":
        return <Truck className="h-4 w-4 text-gray-900" />;
      default:
        return <CreditCard className="h-4 w-4 text-gray-900" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const baseClasses = "px-2 py-1 text-xs font-medium rounded-full";
    switch (status) {
      case "completed":
        return `${baseClasses} bg-green-100 text-green-800`;
      case "pending":
        return `${baseClasses} bg-yellow-100 text-yellow-800`;
      case "cancelled":
        return `${baseClasses} bg-red-100 text-red-800`;
      case "refunded":
      case "partially_refunded":
        return `${baseClasses} bg-purple-100 text-purple-800`;
      default:
        return `${baseClasses} bg-gray-100 text-gray-800`;
    }
  };

  const getStatusText = (status: string) => {
    const statusMap: Record<string, string> = {
      refunded: t.refunded,
      partially_refunded: t.partiallyRefunded,
      completed: t.completed,
      pending: t.pending,
      cancelled: t.cancelled,
    };
    return statusMap[status] || status;
  };

  const translatePaymentMethod = (method: string) => {
    const methodMap: Record<string, string> = {
      cash: t.cash,
      scan: t.scanPayment,
      wallet: t.wallet,
      cod: t.cod,
    };
    return methodMap[method] || method;
  };

  const toggleDropdown = (transactionId: string) => {
    if (openDropdown === transactionId) {
      setOpenDropdown(null);
      setDropdownPosition(null);
    } else {
      const button = buttonRefs.current[transactionId];
      if (button) {
        const rect = button.getBoundingClientRect();
        setDropdownPosition({
          top: rect.bottom + window.scrollY + 4,
          right: window.innerWidth - rect.right + window.scrollX,
        });
      }
      setOpenDropdown(transactionId);
    }
  };

  const handleRefundClick = (transaction: Transaction) => {
    setSelectedTransaction(transaction);
    // Initialize refund items with 0 quantities
    const initialRefundItems: { [key: string]: number } = {};
    transaction.items.forEach((item, index) => {
      initialRefundItems[`${item.id}___${index}`] = 0;
    });
    setRefundItems(initialRefundItems);
    setShowRefundModal(true);
    setOpenDropdown(null); // Close dropdown
    setDropdownPosition(null); // Reset position
  };

  const handleCancelClick = (transaction: Transaction) => {
    setSelectedTransaction(transaction);
    setShowCancelModal(true);
    setOpenDropdown(null); // Close dropdown
    setDropdownPosition(null); // Reset position
  };

  const handleViewClick = (transaction: Transaction) => {
    setSelectedTransaction(transaction);
    setShowViewDetailsModal(true);
    setOpenDropdown(null); // Close dropdown
    setDropdownPosition(null); // Reset position
  };

  const handleApproveClick = async (transaction: Transaction) => {
    if (!transaction.id) return;

    const confirmed = window.confirm(
      `Are you sure you want to approve this COD transaction?\n\nTransaction ID: ${
        transaction.transactionId
      }\nTotal: ${formatPrice(transaction.total)}`,
    );

    if (!confirmed) return;

    try {
      await transactionService.approveTransaction(
        transaction.id,
        user?.email || "Admin",
      );
      toast.success("Transaction approved successfully!");
      loadTransactions(); // Reload transactions
    } catch (error) {
      console.error("Error approving transaction:", error);
      toast.error(
        `Failed to approve transaction: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      );
    }
    setOpenDropdown(null);
    setDropdownPosition(null);
  };

  const handleRefundSubmit = async () => {
    if (!selectedTransaction || !selectedTransaction.id) return;

    // Prevent double submissions
    if (isProcessingRefund) return;
    setIsProcessingRefund(true);

    try {
      // Validate that there are items to refund
      const hasItemsToRefund = Object.values(refundItems).some(
        (quantity) => quantity > 0,
      );
      if (!hasItemsToRefund) {
        toast.error("Please select at least one item to refund.");
        setIsProcessingRefund(false);
        return;
      }

      // Validate refund quantities don't exceed available amounts
      const validationErrors: string[] = [];
      Object.entries(refundItems).forEach(([key, quantity]) => {
        if (quantity > 0) {
          const [, index] = key.split("___");
          const itemIndex = parseInt(index);
          const item = selectedTransaction.items[itemIndex];

          if (
            item &&
            !isNaN(itemIndex) &&
            itemIndex >= 0 &&
            itemIndex < selectedTransaction.items.length
          ) {
            // Calculate already refunded quantity for this item
            const alreadyRefunded =
              selectedTransaction.refunds?.reduce((total, refund) => {
                const refundItem = refund.items.find(
                  (ri) => ri.itemIndex === itemIndex,
                );
                return total + (refundItem?.quantity || 0);
              }, 0) || 0;

            const availableToRefund = item.quantity - alreadyRefunded;

            if (quantity > availableToRefund) {
              validationErrors.push(
                `${item.groupName}: Cannot refund ${quantity} items. Only ${availableToRefund} available.`,
              );
            }
          }
        }
      });

      if (validationErrors.length > 0) {
        toast.error("Refund validation failed:\n\n" + validationErrors.join("\n"));
        return;
      }

      // Calculate total refund amount for display
      const refundAmount = Object.entries(refundItems).reduce(
        (total, [key, quantity]) => {
          const [, index] = key.split("___");
          const itemIndex = parseInt(index);
          const item = selectedTransaction.items[itemIndex];
          if (
            !item ||
            isNaN(itemIndex) ||
            itemIndex < 0 ||
            itemIndex >= selectedTransaction.items.length
          ) {
            console.warn(`Invalid item index ${itemIndex} for key ${key}`);
            return total;
          }
          return total + item.unitPrice * quantity;
        },
        0,
      );

      // Process the refund through the service
      const refundId = await transactionService.processRefund(
        selectedTransaction.id,
        refundItems,
        selectedTransaction,
        "Manual refund processed by owner", // reason
        "Owner", // processedBy
      );

      toast.error(
        `Refund processed successfully!\nRefund ID: ${refundId}\nAmount: ${formatPrice(
          refundAmount,
        )}`,
      );

      setShowRefundModal(false);
      setSelectedTransaction(null);
      setRefundItems({});
      loadTransactions(); // Reload to show updated data
    } catch (error) {
      console.error("Error processing refund:", error);
      toast.error(
        `Error processing refund: ${
          error instanceof Error ? error.message : "Please try again."
        }`,
      );
    } finally {
      setIsProcessingRefund(false);
    }
  };

  const handleCancelTransaction = async () => {
    if (!selectedTransaction) return;

    // Prevent double submissions
    if (isProcessingCancel) return;
    setIsProcessingCancel(true);

    try {
      // Validate that the transaction can be cancelled
      if (selectedTransaction.status === "cancelled") {
        toast.error("This transaction is already cancelled.");
        return;
      }

      // Call the transaction service to cancel transaction with inventory restoration
      await transactionService.cancelTransaction(
        selectedTransaction.id!,
        selectedTransaction,
        "Transaction cancelled by owner",
        user?.email || "Unknown user",
      );

      toast.error(
        `Transaction ${selectedTransaction.transactionId} has been cancelled successfully.\nInventory has been restored.`,
      );

      setShowCancelModal(false);
      setSelectedTransaction(null);
      loadTransactions(); // Reload to show updated data
    } catch (error) {
      console.error("Error cancelling transaction:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";
      toast.error(`Failed to cancel transaction: ${errorMessage}. Please try again.`);
    } finally {
      setIsProcessingCancel(false);
    }
  };

  // Toggle selection for a transaction
  const toggleSelectTransaction = (transactionId: string) => {
    if (!isOwner) {
      // Only owner can select transactions for bulk actions
      toast.error("Only owner accounts can select transactions.");
      return;
    }
    setSelectedTransactions((prev) =>
      prev.includes(transactionId)
        ? prev.filter((id) => id !== transactionId)
        : [...prev, transactionId],
    );
  };

  // Select/deselect all transactions
  const toggleSelectAll = () => {
    if (!isOwner) {
      toast.error("Only owner accounts can select transactions.");
      return;
    }
    const allTransactionIds = filteredTransactions.map((t) => t.id!);
    if (selectedTransactions.length === allTransactionIds.length) {
      setSelectedTransactions([]);
    } else {
      setSelectedTransactions(allTransactionIds);
    }
  };

  // Bulk approve selected COD transactions
  const handleBulkApprove = async () => {
    if (selectedTransactions.length === 0) return;

    const confirmed = window.confirm(
      `Are you sure you want to approve ${selectedTransactions.length} COD transaction(s)?`,
    );

    if (!confirmed) return;

    try {
      let successCount = 0;
      let failCount = 0;

      for (const transactionId of selectedTransactions) {
        try {
          await transactionService.approveTransaction(
            transactionId,
            user?.email || "Admin",
          );
          successCount++;
        } catch (error) {
          console.error(`Error approving transaction ${transactionId}:`, error);
          failCount++;
        }
      }

      if (successCount > 0) {
        toast.error(
          `Successfully approved ${successCount} transaction(s).${
            failCount > 0
              ? `\nFailed to approve ${failCount} transaction(s).`
              : ""
          }`,
        );
        setSelectedTransactions([]);
        loadTransactions();
      } else {
        toast.error("Failed to approve any transactions. Please try again.");
      }
    } catch (error) {
      console.error("Error in bulk approve:", error);
      toast.error("An error occurred during bulk approval.");
    }
  };

  // Bulk cancel selected COD transactions
  const handleBulkCancel = async () => {
    if (selectedTransactions.length === 0) return;

    const confirmed = window.confirm(
      `Are you sure you want to cancel ${selectedTransactions.length} COD transaction(s)?\n\nThis will restore inventory for all items.`,
    );

    if (!confirmed) return;

    try {
      let successCount = 0;
      let failCount = 0;

      for (const transactionId of selectedTransactions) {
        try {
          const transaction = transactions.find((t) => t.id === transactionId);
          if (transaction) {
            await transactionService.cancelTransaction(
              transactionId,
              transaction,
              "Bulk cancelled by owner",
              user?.email || "Unknown user",
            );
            successCount++;
          }
        } catch (error) {
          console.error(
            `Error cancelling transaction ${transactionId}:`,
            error,
          );
          failCount++;
        }
      }

      if (successCount > 0) {
        toast.error(
          `Successfully cancelled ${successCount} transaction(s).${
            failCount > 0
              ? `\nFailed to cancel ${failCount} transaction(s).`
              : ""
          }`,
        );
        setSelectedTransactions([]);
        loadTransactions();
      } else {
        toast.error("Failed to cancel any transactions. Please try again.");
      }
    } catch (error) {
      console.error("Error in bulk cancel:", error);
      toast.error("An error occurred during bulk cancellation.");
    }
  };

  // Bulk delete selected transactions
  const handleBulkDelete = async () => {
    if (selectedTransactions.length === 0) return;

    const confirmed = window.confirm(
      `Are you sure you want to permanently delete ${selectedTransactions.length} transaction(s)?\n\nThis action cannot be undone and will remove the transactions from the database.`,
    );

    if (!confirmed) return;

    setIsProcessingDelete(true);
    try {
      const result =
        await transactionService.deleteTransactions(selectedTransactions);

      if (result.successCount > 0) {
        toast.error(
          `Successfully deleted ${result.successCount} transaction(s).${
            result.failCount > 0
              ? `\nFailed to delete ${result.failCount} transaction(s).`
              : ""
          }`,
        );
        setSelectedTransactions([]);
        loadTransactions();
      } else {
        toast.error("Failed to delete any transactions. Please try again.");
      }
    } catch (error) {
      console.error("Error in bulk delete:", error);
      toast.error("An error occurred during bulk delete operation.");
    } finally {
      setIsProcessingDelete(false);
    }
  };

  const exportToCSV = () => {
    if (filteredTransactions.length === 0) {
      toast.error("No data to export");
      return;
    }

    // Define CSV headers
    const headers = [
      "Transaction ID",
      "Date & Time",
      "Customer Name",
      "Items",
      "Total",
      "Profit",
      "Tax",
      "Branch",
      "Selling Currency",
      "Payment Method",
      "Status",
    ];

    // Convert transactions to CSV rows
    const rows = filteredTransactions.map((transaction) => {
      const refundedAmount =
        transaction.refunds?.reduce(
          (sum, refund) => sum + refund.totalAmount,
          0,
        ) || 0;
      const netTotal = Math.max(0, transaction.total - refundedAmount);

      const transactionProfit = transaction.items.reduce((itemTotal, item) => {
        const profitPerItem =
          (item.unitPrice - item.originalPrice) * item.quantity;
        return itemTotal + profitPerItem;
      }, 0);

      const refundedProfit =
        transaction.refunds?.reduce((refundTotal, refund) => {
          return refund.items.reduce((refundItemTotal, refundItem) => {
            const originalItem = transaction.items.find(
              (item) => item.id === refundItem.itemId,
            );
            if (originalItem) {
              const refundedProfitPerItem =
                (originalItem.unitPrice - originalItem.originalPrice) *
                refundItem.quantity;
              return refundItemTotal + refundedProfitPerItem;
            }
            return refundItemTotal;
          }, 0);
        }, 0) || 0;

      const netProfit = Math.max(0, transactionProfit - refundedProfit);

      return [
        transaction.transactionId || "",
        formatDate(transaction.timestamp),
        transaction.customer?.displayName || "Walk-in Customer",
        transaction.items.length.toString(),
        formatPrice(netTotal),
        formatPrice(netProfit),
        formatPrice(transaction.tax || 0),
        transaction.branchName || "N/A",
        transaction.sellingCurrency || "THB",
        transaction.paymentMethod?.toUpperCase() || "N/A",
        getStatusText(transaction.status),
      ];
    });

    // Create CSV content
    const csvContent = [
      headers.join(","),
      ...rows.map((row) =>
        row.map((cell) => `"${cell.toString().replace(/"/g, '""')}"`).join(","),
      ),
    ].join("\n");

    // Prepend UTF-8 BOM so Excel on Windows detects UTF-8 correctly
    const bom = "\uFEFF";

    // Create download link
    const blob = new Blob([bom + csvContent], {
      type: "text/csv;charset=utf-8;",
    });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `transactions_${new Date().toISOString().split("T")[0]}.csv`,
    );
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Desktop sidebar (hidden on small screens) */}
      <div className="hidden lg:block">
        <Sidebar
          activeItem="transactions"
          onItemClick={() => {}}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          isCartModalOpen={isCartModalOpen}
        />
      </div>

      {/* Mobile sidebar overlay */}
      <div className="lg:hidden">
        <Sidebar
          activeItem="transactions"
          onItemClick={() => setIsMobileSidebarOpen(false)}
          isCollapsed={false}
          isCartModalOpen={isCartModalOpen}
          isMobileOpen={isMobileSidebarOpen}
          onCloseMobile={() => setIsMobileSidebarOpen(false)}
        />
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        <TopNavBar
          onCartModalStateChange={setIsCartModalOpen}
          onMenuToggle={() => setIsMobileSidebarOpen((s) => !s)}
        />

        <main className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="max-w-screen-2xl mx-auto">
            {/* Header
            <div className="mb-6">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                Transactions
              </h1>
              <p className="text-gray-600">
                View and manage all sales transactions
              </p>
            </div> */}

            {/* Summary Stats */}
            <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-6 gap-4">
              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <h3 className="text-sm font-medium text-gray-500">
                  {t.totalTransactions}
                </h3>
                <p className="text-2xl font-bold text-gray-900">
                  {filteredTransactions.length}
                </p>
              </div>
              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <h3 className="text-sm font-medium text-gray-500">
                  {t.totalSales}
                </h3>
                <p className="text-2xl font-bold text-gray-900">
                  {formatPrice(calculateNetRevenue(revenueTransactions))}
                </p>
              </div>
              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <h3 className="text-sm font-medium text-gray-500">
                  {t.totalProfit}
                </h3>
                <p className="text-2xl font-bold text-green-600">
                  {formatPrice(calculateTotalProfit(revenueTransactions))}
                </p>
              </div>
              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <h3 className="text-sm font-medium text-gray-500">
                  {t.completed}
                </h3>
                <p className="text-2xl font-bold text-green-600">
                  {completedTransactionsCount}
                </p>
              </div>
              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <h3 className="text-sm font-medium text-gray-500">
                  {t.totalSalesThb}
                </h3>
                <p className="text-2xl font-bold text-gray-900">
                  {formatPrice(calculateNetRevenue(revenueTransactionsTHB))}
                </p>
              </div>
              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <h3 className="text-sm font-medium text-gray-500">
                  {t.totalSalesMmk}
                </h3>
                <p className="text-2xl font-bold text-gray-900">
                  {formatInMMK(calculateNetRevenue(revenueTransactionsMMK))}
                </p>
              </div>
            </div>

            {/* Filters and Search */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                  <input
                    type="text"
                    placeholder={t.searchTransactions}
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 focus:ring-2 focus:ring-gray-300 focus:border-transparent text-gray-900"
                  />
                </div>

                {/* Status Filter */}
                <select
                  aria-label="Filter by status"
                  value={filterStatus}
                  onChange={(e) => {
                    setFilterStatus(
                      e.target.value as
                        | "all"
                        | "completed"
                        | "pending"
                        | "cancelled"
                        | "refunded"
                        | "partially_refunded",
                    );
                    setCurrentPage(1);
                  }}
                  className="px-4 py-2 border border-gray-300 focus:ring-2 focus:ring-gray-300 focus:border-transparent text-gray-900"
                >
                  <option value="all">{t.allStatus}</option>
                  <option value="completed">{t.completed}</option>
                  <option value="pending">{t.pending}</option>
                  <option value="cancelled">{t.cancelled}</option>
                  <option value="refunded">{t.refunded}</option>
                  <option value="partially_refunded">
                    {t.partiallyRefunded}
                  </option>
                </select>

                {/* Payment Method Filter */}
                <select
                  aria-label="Filter by payment method"
                  value={filterPaymentMethod}
                  onChange={(e) => {
                    setFilterPaymentMethod(
                      e.target.value as
                        | "all"
                        | "cash"
                        | "scan"
                        | "wallet"
                        | "cod",
                    );
                    setCurrentPage(1);
                  }}
                  className="px-4 py-2 border border-gray-300 focus:ring-2 focus:ring-gray-300 focus:border-transparent text-gray-900"
                >
                  <option value="all">{t.allPaymentMethods}</option>
                  <option value="cash">{t.cash}</option>
                  <option value="scan">{t.scanPayment}</option>
                  <option value="wallet">{t.wallet}</option>
                  <option value="cod">{t.cod}</option>
                </select>

                {/* Branch Filter */}
                <select
                  aria-label="Filter by branch"
                  value={filterBranch}
                  onChange={(e) => {
                    setFilterBranch(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="px-4 py-2 border border-gray-300 focus:ring-2 focus:ring-gray-300 focus:border-transparent text-gray-900"
                >
                  <option value="all">{t.allBranches}</option>
                  {shops.map((shop) => (
                    <option key={shop.id} value={shop.name}>
                      {shop.name}
                    </option>
                  ))}
                </select>

                {/* Date Range Filter */}
                <select
                  aria-label="Filter by date range"
                  value={dateRange}
                  onChange={(e) => {
                    const range = e.target.value as
                      | "today"
                      | "7d"
                      | "30d"
                      | "90d"
                      | "all"
                      | "custom";
                    setDateRange(range);
                    setCurrentPage(1);

                    if (range !== "custom") {
                      const end = new Date();
                      const start = new Date();

                      switch (range) {
                        case "today":
                          break;
                        case "7d":
                          start.setDate(start.getDate() - 7);
                          break;
                        case "30d":
                          start.setDate(start.getDate() - 30);
                          break;
                        case "90d":
                          start.setDate(start.getDate() - 90);
                          break;
                      }

                      if (range !== "all") {
                        setStartDate(start.toISOString().split("T")[0]);
                        setEndDate(end.toISOString().split("T")[0]);
                      }
                    }
                  }}
                  className="px-4 py-2 border border-gray-300 focus:ring-2 focus:ring-gray-300 focus:border-transparent text-gray-900 bg-white"
                >
                  <option value="today">{t.today}</option>
                  <option value="7d">{t.last7Days}</option>
                  <option value="30d">{t.last30Days}</option>
                  <option value="90d">{t.last90Days}</option>
                  <option value="all">{t.allTime}</option>
                  <option value="custom">{t.customRange}</option>
                </select>

                {/* Custom Date Range Inputs - Same Row */}
                <div className="flex items-center gap-2 lg:col-span-2">
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => {
                      setStartDate(e.target.value);
                      setDateRange("custom");
                      setCurrentPage(1);
                    }}
                    className="px-4 py-2 border border-gray-300 focus:ring-2 focus:ring-gray-300 focus:border-transparent bg-white text-gray-900"
                    max={endDate}
                    aria-label="Start Date"
                  />
                  <span className="text-gray-500">to</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => {
                      setEndDate(e.target.value);
                      setDateRange("custom");
                      setCurrentPage(1);
                    }}
                    className="px-4 py-2 border border-gray-300 focus:ring-2 focus:ring-gray-300 focus:border-transparent bg-white text-gray-900"
                    min={startDate}
                    max={new Date().toISOString().split("T")[0]}
                    aria-label="End Date"
                  />
                </div>

                {/* Export Button */}
                <button
                  onClick={exportToCSV}
                  className="inline-flex items-center justify-center font-normal transition-colors focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed border border-gray-300 text-gray-900 hover:bg-gray-50 px-4 py-2 text-sm flex items-center"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </button>
              </div>
            </div>

            {/* Bulk Actions Bar */}
            {isOwner && selectedTransactions.length > 0 && (
              <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="text-sm font-medium text-blue-900">
                    {selectedTransactions.length} transaction(s) selected
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={handleBulkApprove}
                    className="flex items-center px-4 py-2 bg-green-600 text-white  hover:bg-green-700 transition-colors text-sm font-medium"
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Approve Selected
                  </button>
                  <button
                    onClick={handleBulkCancel}
                    className="flex items-center px-4 py-2 bg-red-600 text-white  hover:bg-red-700 transition-colors text-sm font-medium"
                  >
                    <X className="h-4 w-4 mr-2" />
                    Cancel Checkout Selected
                  </button>
                  <button
                    onClick={handleBulkDelete}
                    disabled={isProcessingDelete}
                    className="flex items-center px-4 py-2 bg-red-700 text-white  hover:bg-red-800 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isProcessingDelete ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2"></div>
                        Deleting...
                      </>
                    ) : (
                      <>
                        <Trash className="h-4 w-4 mr-2" />
                        Delete Selected
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => setSelectedTransactions([])}
                    className="px-4 py-2 bg-gray-200 text-gray-700  hover:bg-gray-300 transition-colors text-sm font-medium"
                  >
                    Clear Selection
                  </button>
                </div>
              </div>
            )}

            {/* Transactions Table */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              {loading ? (
                <div className="p-8 text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                  <p className="mt-2 text-gray-600">Loading transactions...</p>
                </div>
              ) : filteredTransactions.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-gray-600">No transactions found</p>
                </div>
              ) : (
                <div className="overflow-x-auto -mx-4 md:mx-0">
                  <div className="inline-block min-w-full align-middle">
                    <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 md:rounded-lg">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-3 md:px-4 lg:px-6 py-2 md:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              <input
                                type="checkbox"
                                checked={
                                  filteredTransactions.length > 0 &&
                                  selectedTransactions.length ===
                                    filteredTransactions.length
                                }
                                onChange={toggleSelectAll}
                                disabled={!isOwner}
                                title={
                                  !isOwner
                                    ? "Only owner can select transactions"
                                    : undefined
                                }
                                className="h-4 w-4 md:h-5 md:w-5 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed"
                                aria-label="Select all transactions"
                              />
                            </th>
                            <th className="px-3 md:px-4 lg:px-6 py-2 md:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              {t.transactionId}
                            </th>
                            <th className="px-3 md:px-4 lg:px-6 py-2 md:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              {t.customer}
                            </th>
                            <th className="px-3 md:px-4 lg:px-6 py-2 md:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              {t.items}
                            </th>
                            <th className="px-3 md:px-4 lg:px-6 py-2 md:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              {t.total}
                            </th>
                            <th className="hidden lg:table-cell px-3 md:px-4 lg:px-6 py-2 md:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              {t.profit}
                            </th>
                            <th className="hidden lg:table-cell px-3 md:px-4 lg:px-6 py-2 md:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              {t.tax}
                            </th>
                            <th className="hidden md:table-cell px-3 md:px-4 lg:px-6 py-2 md:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              {t.branch}
                            </th>
                            <th className="hidden lg:table-cell px-3 md:px-4 lg:px-6 py-2 md:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              {t.sellingCurrency}
                            </th>
                            <th className="px-3 md:px-4 lg:px-6 py-2 md:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              {t.paymentMethod}
                            </th>
                            <th className="px-3 md:px-4 lg:px-6 py-2 md:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              {t.status}
                            </th>
                            <th className="px-3 md:px-4 lg:px-6 py-2 md:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              {t.dateTime}
                            </th>
                            <th className="px-3 md:px-4 lg:px-6 py-2 md:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              {t.actions}
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {currentTransactions.map((transaction) => {
                            const hasRefunds =
                              transaction.refunds &&
                              transaction.refunds.length > 0;
                            const isFullyRefunded =
                              transaction.status === "refunded";
                            const isPartiallyRefunded =
                              transaction.status === "partially_refunded";

                            const rowClass = "hover:bg-gray-50";

                            return (
                              <tr key={transaction.id} className={rowClass}>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <input
                                    type="checkbox"
                                    checked={selectedTransactions.includes(
                                      transaction.id!,
                                    )}
                                    onChange={() =>
                                      toggleSelectTransaction(transaction.id!)
                                    }
                                    disabled={!isOwner}
                                    title={
                                      !isOwner
                                        ? "Only owner can select transactions"
                                        : undefined
                                    }
                                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                    aria-label={`Select transaction ${transaction.transactionId}`}
                                  />
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                  {transaction.transactionId}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <div className="text-sm text-gray-900">
                                    {transaction.customer?.displayName ||
                                      t.walkInCustomer}
                                  </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                  {transaction.items.reduce(
                                    (total, item) => total + item.quantity,
                                    0,
                                  )}{" "}
                                  {t.items}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                  {(() => {
                                    const refundedAmount =
                                      transaction.refunds?.reduce(
                                        (sum, refund) =>
                                          sum + refund.totalAmount,
                                        0,
                                      ) || 0;
                                    const netTotal =
                                      transaction.total - refundedAmount;
                                    const subtotal =
                                      transaction.subtotal ||
                                      transaction.total -
                                        (transaction.tax || 0);
                                    const tax = transaction.tax || 0;

                                    if (refundedAmount > 0) {
                                      return (
                                        <div className="flex flex-col group relative">
                                          <span className="text-gray-900">
                                            {formatPrice(netTotal)}
                                          </span>
                                          <span className="text-xs text-gray-500">
                                            ({t.original}:{" "}
                                            {formatPrice(transaction.total)})
                                          </span>
                                          {/* Tooltip */}
                                          <div className="absolute top-full left-0 mt-2 hidden group-hover:block bg-gray-800 text-white text-xs rounded py-2 px-3 whitespace-nowrap z-10 shadow-lg">
                                            <div>
                                              {t.subtotal}:{" "}
                                              {formatPrice(subtotal)}
                                            </div>
                                            <div>
                                              {t.tax}: {formatPrice(tax)}
                                            </div>
                                            <div className="border-t border-gray-600 pt-1 mt-1">
                                              <div>
                                                {t.total}:{" "}
                                                {formatPrice(transaction.total)}
                                              </div>
                                              <div>
                                                {t.refunded}: -
                                                {formatPrice(refundedAmount)}
                                              </div>
                                              <div className="font-semibold">
                                                {t.netProfit}:{" "}
                                                {formatPrice(netTotal)}
                                              </div>
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    }

                                    return (
                                      <div className="group relative">
                                        <span className="cursor-help">
                                          {formatPrice(transaction.total)}
                                        </span>
                                        {/* Tooltip */}
                                        <div className="absolute top-full left-0 mt-2 hidden group-hover:block bg-gray-800 text-white text-xs rounded py-2 px-3 whitespace-nowrap z-10 shadow-lg">
                                          <div>
                                            {t.subtotal}:{" "}
                                            {formatPrice(subtotal)}
                                          </div>
                                          <div>
                                            {t.tax}: {formatPrice(tax)}
                                          </div>
                                          <div className="border-t border-gray-600 pt-1 mt-1 font-semibold">
                                            {t.total}:{" "}
                                            {formatPrice(transaction.total)}
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })()}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                  {(() => {
                                    // Calculate profit: (selling price - original price) * quantity for each item
                                    const totalProfit =
                                      transaction.items.reduce((sum, item) => {
                                        const sellingPrice =
                                          item.discountedPrice ||
                                          item.unitPrice;
                                        const profit =
                                          (sellingPrice - item.originalPrice) *
                                          item.quantity;
                                        return sum + profit;
                                      }, 0);

                                    // Calculate profit lost from refunds
                                    const refundedProfit =
                                      transaction.refunds?.reduce(
                                        (refundTotal, refund) => {
                                          return (
                                            refundTotal +
                                            refund.items.reduce(
                                              (refundItemTotal, refundItem) => {
                                                const originalItem =
                                                  transaction.items[
                                                    refundItem.itemIndex
                                                  ];
                                                if (originalItem) {
                                                  const itemSellingPrice =
                                                    originalItem.discountedPrice ||
                                                    originalItem.unitPrice;
                                                  const refundedItemProfit =
                                                    (itemSellingPrice -
                                                      originalItem.originalPrice) *
                                                    refundItem.quantity;
                                                  return (
                                                    refundItemTotal +
                                                    refundedItemProfit
                                                  );
                                                }
                                                return refundItemTotal;
                                              },
                                              0,
                                            )
                                          );
                                        },
                                        0,
                                      ) || 0;

                                    const netProfit =
                                      totalProfit - refundedProfit;
                                    const isProfitable = netProfit >= 0;
                                    return (
                                      <span
                                        className={
                                          isProfitable
                                            ? "text-green-600"
                                            : "text-red-600"
                                        }
                                      >
                                        {formatPrice(netProfit)}
                                      </span>
                                    );
                                  })()}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                  {formatPrice(transaction.tax || 0)}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                  {transaction.branchName || t.mainBranch}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                  {transaction.sellingCurrency &&
                                  transaction.exchangeRate &&
                                  transaction.sellingTotal ? (
                                    <div className="space-y-1">
                                      <div className="font-medium">
                                        {transaction.sellingCurrency === "MMK"
                                          ? "Ks"
                                          : transaction.sellingCurrency}{" "}
                                        {transaction.sellingTotal.toLocaleString()}
                                      </div>
                                      <div className="text-xs text-gray-500">
                                        {t.rate}: 1 THB ={" "}
                                        {transaction.exchangeRate}{" "}
                                        {transaction.sellingCurrency === "MMK"
                                          ? "Ks"
                                          : transaction.sellingCurrency}
                                      </div>
                                    </div>
                                  ) : (
                                    <span className="text-gray-400">-</span>
                                  )}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <div className="flex items-center">
                                    {getPaymentMethodIcon(
                                      transaction.paymentMethod,
                                    )}
                                    <span className="ml-2 text-sm text-gray-900">
                                      {translatePaymentMethod(
                                        transaction.paymentMethod,
                                      )}
                                    </span>
                                  </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <span
                                    className={getStatusBadge(
                                      transaction.status,
                                    )}
                                  >
                                    {getStatusText(transaction.status)}
                                  </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                  {formatDate(transaction.timestamp)}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                  <div className="relative">
                                    <button
                                      ref={(el) => {
                                        if (el)
                                          buttonRefs.current[
                                            transaction.id as string
                                          ] = el;
                                      }}
                                      onClick={() =>
                                        toggleDropdown(transaction.id!)
                                      }
                                      className="flex items-center justify-center w-8 h-8 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
                                      aria-label="Transaction actions"
                                    >
                                      <MoreVertical className="h-4 w-4" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
              {/* Pagination */}
              <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
                <div className="flex-1 flex justify-between sm:hidden">
                  <button
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                    className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                  >
                    {t.previous}
                  </button>
                  <button
                    onClick={() =>
                      setCurrentPage(Math.min(totalPages, currentPage + 1))
                    }
                    disabled={currentPage === totalPages}
                    className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                  >
                    {t.next}
                  </button>
                </div>
                <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                  <div className="flex items-center space-x-2">
                    <p className="text-sm text-gray-700">{t.rowsPerPage}:</p>
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
                      {t.showingTransactions
                        .replace("{start}", String(startIndex + 1))
                        .replace(
                          "{end}",
                          String(
                            Math.min(endIndex, filteredTransactions.length),
                          ),
                        )
                        .replace(
                          "{total}",
                          String(filteredTransactions.length),
                        )}
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
                          setCurrentPage(Math.min(totalPages, currentPage + 1))
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
              )
            </div>

            {/* Refund Modal */}
            {showRefundModal && selectedTransaction && (
              <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50">
                <div className="bg-white/95 backdrop-blur-md rounded-lg shadow-xl border border-white/20 w-full max-w-2xl mx-4 max-h-[80vh] overflow-y-auto">
                  <div className="p-6 border-b border-gray-300/50 bg-white/50 backdrop-blur-sm">
                    <div className="flex items-center justify-between">
                      <h2 className="text-xl font-semibold text-gray-900">
                        Refund Items
                      </h2>
                      <button
                        onClick={() => setShowRefundModal(false)}
                        className="text-gray-400 hover:text-gray-600"
                        aria-label="Close refund modal"
                      >
                        <X className="h-6 w-6" />
                      </button>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">
                      Transaction ID: {selectedTransaction.transactionId}
                    </p>
                    <div className="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                      <p className="text-sm text-blue-800">
                        💡 <strong>Tip:</strong> You can only refund up to the
                        available quantity for each item. The system will
                        automatically limit your input to prevent
                        over-refunding.
                      </p>
                    </div>
                  </div>

                  <div className="p-6">
                    <div className="space-y-4">
                      {selectedTransaction.items.map((item, index) => {
                        // Calculate already refunded quantity for this item
                        const alreadyRefunded =
                          selectedTransaction.refunds?.reduce(
                            (total, refund) => {
                              const refundItem = refund.items.find(
                                (ri) => ri.itemIndex === index,
                              );
                              return total + (refundItem?.quantity || 0);
                            },
                            0,
                          ) || 0;

                        const availableToRefund =
                          item.quantity - alreadyRefunded;

                        return (
                          <div
                            key={`${item.id}___${index}`}
                            className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
                          >
                            <div className="flex-1">
                              <h4 className="font-medium text-gray-900">
                                {item.groupName}
                              </h4>
                              <p className="text-sm text-gray-600">
                                {(item.selectedColor || item.colorCode) &&
                                  `Color: ${getDisplayColor(item)}`}{" "}
                                {item.selectedSize &&
                                  `Size: ${item.selectedSize}`}
                              </p>
                              <p className="text-sm text-gray-600">
                                Price: {formatPrice(item.unitPrice)} ×{" "}
                                {item.quantity} ={" "}
                                {formatPrice(item.unitPrice * item.quantity)}
                              </p>
                              {alreadyRefunded > 0 && (
                                <p className="text-sm text-orange-600">
                                  Already refunded: {alreadyRefunded}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center space-x-2">
                              <label className="text-sm text-gray-600">
                                Refund Qty:
                              </label>
                              <div className="flex flex-col items-center">
                                <input
                                  aria-label={`Refund quantity for ${item.groupName}`}
                                  type="number"
                                  min="0"
                                  max={availableToRefund}
                                  value={
                                    refundItems[`${item.id}___${index}`] || 0
                                  }
                                  onChange={(e) => {
                                    const inputValue =
                                      parseInt(e.target.value) || 0;
                                    const validatedValue = Math.min(
                                      Math.max(inputValue, 0),
                                      availableToRefund,
                                    );
                                    setRefundItems((prev) => ({
                                      ...prev,
                                      [`${item.id}___${index}`]: validatedValue,
                                    }));
                                  }}
                                  onBlur={(e) => {
                                    // Additional validation on blur to ensure value is within bounds
                                    const inputValue =
                                      parseInt(e.target.value) || 0;
                                    if (inputValue > availableToRefund) {
                                      setRefundItems((prev) => ({
                                        ...prev,
                                        [`${item.id}___${index}`]:
                                          availableToRefund,
                                      }));
                                    }
                                  }}
                                  className={`w-20 px-2 py-1 border rounded text-center text-gray-900 ${
                                    (refundItems[`${item.id}___${index}`] ||
                                      0) > availableToRefund
                                      ? "border-red-500 bg-red-50"
                                      : "border-gray-300 bg-white"
                                  }`}
                                  disabled={availableToRefund <= 0}
                                  placeholder="0"
                                />
                                {(refundItems[`${item.id}___${index}`] || 0) >
                                  availableToRefund && (
                                  <span className="text-xs text-red-500 mt-1">
                                    Max: {availableToRefund}
                                  </span>
                                )}
                              </div>
                              <span className="text-sm text-gray-500">
                                / {availableToRefund}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                      {(() => {
                        // Calculate refund breakdown
                        const totalItemRefundAmount = Object.entries(
                          refundItems,
                        ).reduce((total, [key, quantity]) => {
                          const [, index] = key.split("___");
                          const itemIndex = parseInt(index);
                          const item = selectedTransaction.items[itemIndex];
                          if (
                            !item ||
                            isNaN(itemIndex) ||
                            itemIndex < 0 ||
                            itemIndex >= selectedTransaction.items.length
                          ) {
                            console.warn(
                              `Invalid item index ${itemIndex} for key ${key}`,
                            );
                            return total;
                          }
                          return total + item.unitPrice * quantity;
                        }, 0);

                        const transactionSubtotal =
                          selectedTransaction.subtotal || 0;
                        const transactionCartDiscount =
                          selectedTransaction.discount || 0;

                        let totalProportionalCartDiscount = 0;
                        let cartDiscountRate = 0;
                        if (
                          transactionCartDiscount > 0 &&
                          transactionSubtotal > 0
                        ) {
                          cartDiscountRate =
                            transactionCartDiscount / transactionSubtotal;
                          totalProportionalCartDiscount =
                            totalItemRefundAmount * cartDiscountRate;
                        }

                        const finalRefundAmount =
                          totalItemRefundAmount - totalProportionalCartDiscount;

                        return (
                          <div className="space-y-3">
                            <h3 className="font-medium text-gray-900 text-lg">
                              Refund Calculation
                            </h3>

                            <div className="space-y-2 text-sm">
                              <div className="flex justify-between">
                                <span className="text-gray-600">
                                  Items Subtotal:
                                </span>
                                <span className="text-gray-900">
                                  {formatPrice(totalItemRefundAmount)}
                                </span>
                              </div>

                              {transactionCartDiscount > 0 && (
                                <>
                                  <div className="flex justify-between">
                                    <span className="text-gray-600">
                                      Cart Discount (
                                      {(cartDiscountRate * 100).toFixed(1)}%):
                                    </span>
                                    <span className="text-orange-600">
                                      -
                                      {formatPrice(
                                        totalProportionalCartDiscount,
                                      )}
                                    </span>
                                  </div>
                                  <div className="border-t border-gray-200 pt-2">
                                    <div className="flex justify-between text-xs text-gray-500">
                                      <span>
                                        Original transaction had{" "}
                                        {formatPrice(transactionCartDiscount)}{" "}
                                        cart discount
                                      </span>
                                    </div>
                                  </div>
                                </>
                              )}

                              <div className="border-t border-gray-300 pt-2">
                                <div className="flex justify-between items-center">
                                  <span className="font-medium text-gray-900">
                                    Total Refund Amount:
                                  </span>
                                  <span className="text-xl font-bold text-blue-600">
                                    {formatPrice(finalRefundAmount)}
                                  </span>
                                </div>
                              </div>

                              {transactionCartDiscount > 0 && (
                                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mt-3">
                                  <div className="flex items-start">
                                    <div className="text-amber-600 mr-2">
                                      ℹ️
                                    </div>
                                    <div className="text-xs text-amber-800">
                                      <strong>Note:</strong> The cart discount
                                      is proportionally reduced from the refund
                                      amount. Tax is not refunded as per store
                                      policy.
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })()}
                    </div>

                    <div className="mt-6 flex justify-end space-x-3">
                      <button
                        onClick={() => setShowRefundModal(false)}
                        className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleRefundSubmit}
                        className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
                      >
                        Process Refund
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Cancel Transaction Modal */}
            {showCancelModal && selectedTransaction && (
              <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50">
                <div className="bg-white/95 backdrop-blur-md rounded-lg shadow-xl border border-white/20 w-full max-w-md mx-4">
                  <div className="p-6 border-b border-gray-300/50 bg-white/50 backdrop-blur-sm">
                    <div className="flex items-center justify-between">
                      <h2 className="text-xl font-semibold text-gray-900">
                        Cancel Transaction
                      </h2>
                      <button
                        onClick={() => setShowCancelModal(false)}
                        className="text-gray-400 hover:text-gray-600"
                        aria-label="Close cancel transaction modal"
                      >
                        <X className="h-6 w-6" />
                      </button>
                    </div>
                  </div>

                  <div className="p-6">
                    <div className="flex items-center space-x-3 mb-4">
                      <AlertTriangle className="h-8 w-8 text-red-500" />
                      <div>
                        <h3 className="font-medium text-gray-900">
                          Are you sure?
                        </h3>
                        <p className="text-sm text-gray-600">
                          This action cannot be undone.
                        </p>
                      </div>
                    </div>

                    <div className="bg-gray-50 rounded-lg p-4 mb-6">
                      <p className="text-sm text-gray-600">Transaction ID:</p>
                      <p className="font-medium text-gray-900">
                        {selectedTransaction.transactionId}
                      </p>
                      <p className="text-sm text-gray-600 mt-2">
                        Total Amount:
                      </p>
                      <p className="font-medium text-gray-900">
                        {formatPrice(selectedTransaction.total)}
                      </p>
                    </div>

                    <div className="flex justify-end space-x-3">
                      <button
                        onClick={() => setShowCancelModal(false)}
                        className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors"
                      >
                        Keep Transaction
                      </button>
                      <button
                        onClick={handleCancelTransaction}
                        disabled={isProcessingCancel}
                        className={`px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors ${
                          isProcessingCancel
                            ? "opacity-60 cursor-not-allowed"
                            : ""
                        }`}
                      >
                        {isProcessingCancel
                          ? "Cancelling..."
                          : "Cancel Transaction"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Transaction Details Modal */}
            {showViewDetailsModal && selectedTransaction && (
              <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50">
                <div className="bg-white/95 backdrop-blur-md rounded-lg shadow-xl border border-white/20 w-full max-w-4xl mx-4 max-h-[90vh] overflow-y-auto">
                  <div className="p-6 border-b border-gray-300/50 bg-white/50 backdrop-blur-sm">
                    <div className="flex items-center justify-between">
                      <h2 className="text-xl font-semibold text-gray-900">
                        Transaction Details
                      </h2>
                      <button
                        onClick={() => setShowViewDetailsModal(false)}
                        className="text-gray-400 hover:text-gray-600"
                        aria-label="Close transaction details modal"
                      >
                        <X className="h-6 w-6" />
                      </button>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">
                      Transaction ID: {selectedTransaction.transactionId}
                    </p>
                  </div>

                  <div className="p-6">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {/* Left Column - Transaction Info */}
                      <div className="space-y-6">
                        {/* Basic Information */}
                        <div className="bg-gray-50 rounded-lg p-4">
                          <h3 className="text-lg font-medium text-gray-900 mb-4">
                            Transaction Information
                          </h3>
                          <div className="space-y-3">
                            <div className="flex justify-between">
                              <span className="text-sm text-gray-600">
                                Transaction ID:
                              </span>
                              <span className="text-sm font-medium text-gray-900">
                                {selectedTransaction.transactionId}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-sm text-gray-600">
                                Status:
                              </span>
                              <span
                                className={getStatusBadge(
                                  selectedTransaction.status,
                                )}
                              >
                                {getStatusText(selectedTransaction.status)}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-sm text-gray-600">
                                Date:
                              </span>
                              <span className="text-sm font-medium text-gray-900">
                                {formatDate(selectedTransaction.timestamp)}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-sm text-gray-600">
                                Payment Method:
                              </span>
                              <div className="flex items-center">
                                {getPaymentMethodIcon(
                                  selectedTransaction.paymentMethod,
                                )}
                                <span className="ml-2 text-sm font-medium text-gray-900 capitalize">
                                  {selectedTransaction.paymentMethod}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Customer Information */}
                        <div className="bg-gray-50 rounded-lg p-4">
                          <h3 className="text-lg font-medium text-gray-900 mb-4">
                            Customer Information
                          </h3>
                          <div className="space-y-3">
                            <div className="flex justify-between">
                              <span className="text-sm text-gray-600">
                                Name:
                              </span>
                              <span className="text-sm font-medium text-gray-900">
                                {selectedTransaction.customer?.displayName ||
                                  "Walk-in customer"}
                              </span>
                            </div>

                            {selectedTransaction.customer?.customerType && (
                              <div className="flex justify-between">
                                <span className="text-sm text-gray-600">
                                  Type:
                                </span>
                                <span className="text-sm font-medium text-gray-900 capitalize">
                                  {selectedTransaction.customer.customerType}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Payment Summary */}
                        <div className="bg-gray-50 rounded-lg p-4">
                          <h3 className="text-lg font-medium text-gray-900 mb-4">
                            Payment Summary
                          </h3>
                          <div className="space-y-3">
                            <div className="flex justify-between">
                              <span className="text-sm text-gray-600">
                                Subtotal:
                              </span>
                              <span className="text-sm font-medium text-gray-900">
                                {formatPrice(selectedTransaction.subtotal)}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-sm text-gray-600">
                                Tax:
                              </span>
                              <span className="text-sm font-medium text-gray-900">
                                {formatPrice(selectedTransaction.tax)}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-sm text-gray-600">
                                Discount:
                              </span>
                              <span className="text-sm font-medium text-gray-900">
                                -{formatPrice(selectedTransaction.discount)}
                              </span>
                            </div>
                            {(() => {
                              const breakdown =
                                selectedTransaction.discountBreakdown;
                              if (!breakdown) return null;
                              const summaryItems = [
                                {
                                  key: "wholesale",
                                  label: "Wholesale Pricing",
                                  badge: "WHOLESALE",
                                  badgeClasses: "bg-amber-100 text-amber-800",
                                  amount: breakdown.wholesaleSavings,
                                },
                                {
                                  key: "groupPercent",
                                  label: "Group Discount",
                                  badge: "GROUP",
                                  badgeClasses: "bg-blue-100 text-blue-800",
                                  amount: breakdown.groupPercentSavings,
                                },
                                {
                                  key: "groupFixed",
                                  label: "Group Fixed Discount",
                                  badge: "GROUP",
                                  badgeClasses: "bg-blue-100 text-blue-800",
                                  amount: breakdown.groupFixedTotal,
                                },
                                {
                                  key: "variantPercent",
                                  label: "Variant Discount",
                                  badge: "VARIANT",
                                  badgeClasses: "bg-purple-100 text-purple-800",
                                  amount: breakdown.variantPercentSavings,
                                },
                                {
                                  key: "variantFixed",
                                  label: "Variant Fixed Discount",
                                  badge: "VARIANT",
                                  badgeClasses: "bg-purple-100 text-purple-800",
                                  amount: breakdown.variantFixedTotal,
                                },
                                {
                                  key: "cart",
                                  label:
                                    breakdown.cartDiscountPercent > 0
                                      ? `Cart Discount (${breakdown.cartDiscountPercent}%)`
                                      : "Cart Discount",
                                  badge: "CART",
                                  badgeClasses: "bg-green-100 text-green-800",
                                  amount: breakdown.cartDiscount,
                                },
                              ].filter((item) => (item.amount || 0) > 0);

                              if (summaryItems.length === 0) return null;

                              return (
                                <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 space-y-2">
                                  <div className="text-xs font-semibold text-blue-900 uppercase tracking-wide">
                                    Discount Details
                                  </div>
                                  {summaryItems.map((item) => (
                                    <div
                                      key={item.key}
                                      className="flex items-center justify-between text-xs font-medium text-gray-800"
                                    >
                                      <div className="flex items-center gap-2">
                                        <span>{item.label}</span>
                                        <span
                                          className={`text-[10px] px-1.5 py-0.5 rounded ${item.badgeClasses}`}
                                        >
                                          {item.badge}
                                        </span>
                                      </div>
                                      <span className="font-semibold text-red-600">
                                        -{formatPrice(item.amount)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              );
                            })()}
                            <div className="border-t border-gray-300 pt-3">
                              <div className="flex justify-between">
                                <span className="text-base font-medium text-gray-900">
                                  Total:
                                </span>
                                <span className="text-base font-bold text-gray-900">
                                  {formatPrice(selectedTransaction.total)}
                                </span>
                              </div>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-sm text-gray-600">
                                Amount Paid:
                              </span>
                              <span className="text-sm font-medium text-gray-900">
                                {formatPrice(selectedTransaction.amountPaid)}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-sm text-gray-600">
                                Change:
                              </span>
                              <span className="text-sm font-medium text-gray-900">
                                {formatPrice(selectedTransaction.change)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Right Column - Items */}
                      <div className="space-y-6">
                        <div className="bg-gray-50 rounded-lg p-4">
                          <h3 className="text-lg font-medium text-gray-900 mb-4">
                            Items (
                            {selectedTransaction.items.reduce(
                              (total, item) => total + item.quantity,
                              0,
                            )}{" "}
                            items)
                          </h3>
                          <div className="space-y-4 max-h-96 overflow-y-auto">
                            {selectedTransaction.items.map((item, index) => (
                              <div
                                key={index}
                                className="bg-white rounded-lg p-4 border border-gray-200"
                              >
                                <div className="flex items-start space-x-4">
                                  {item.image && (
                                    <img
                                      src={item.image}
                                      alt={item.groupName}
                                      className="w-16 h-16 object-cover rounded-lg"
                                    />
                                  )}
                                  <div className="flex-1 min-w-0">
                                    <h4 className="text-sm font-medium text-gray-900 truncate">
                                      {item.groupName}
                                    </h4>
                                    <div className="mt-1 flex items-center space-x-4">
                                      {item.selectedColor && (
                                        <div className="flex items-center space-x-2">
                                          <span className="text-xs text-gray-500">
                                            Color:
                                          </span>
                                          <div
                                            className="w-4 h-4 rounded-full border border-gray-300"
                                            style={{
                                              backgroundColor:
                                                item.colorCode || "#ef4444",
                                            }}
                                          />
                                          <span className="text-xs text-gray-700">
                                            {getDisplayColor(item)}
                                          </span>
                                        </div>
                                      )}
                                      {item.selectedSize && (
                                        <div className="flex items-center space-x-2">
                                          <span className="text-xs text-gray-500">
                                            Size:
                                          </span>
                                          <span className="text-xs text-gray-700">
                                            {item.selectedSize}
                                          </span>
                                        </div>
                                      )}
                                    </div>
                                    <div className="mt-2 flex items-center justify-between">
                                      <div className="flex items-center space-x-2">
                                        <span className="text-xs text-gray-500">
                                          Qty:
                                        </span>
                                        <span className="text-sm font-medium text-gray-900">
                                          {item.quantity}
                                        </span>
                                      </div>
                                      <div className="text-right">
                                        <div className="text-sm font-medium text-gray-900">
                                          {formatPrice(
                                            item.unitPrice * item.quantity,
                                          )}
                                        </div>
                                        <div className="text-xs text-gray-500">
                                          {formatPrice(item.unitPrice)} each
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Refunds Section (if any) */}
                        {selectedTransaction.refunds &&
                          selectedTransaction.refunds.length > 0 && (
                            <div className="bg-orange-50 rounded-lg p-4">
                              <h3 className="text-lg font-medium text-gray-900 mb-4">
                                Refunds
                              </h3>
                              <div className="space-y-3">
                                {selectedTransaction.refunds.map(
                                  (refund, index) => (
                                    <div
                                      key={index}
                                      className="bg-white rounded-lg p-3 border border-orange-200"
                                    >
                                      <div className="flex justify-between items-start">
                                        <div>
                                          <p className="text-sm font-medium text-gray-900">
                                            Refund #{refund.refundId}
                                          </p>
                                          <p className="text-xs text-gray-500">
                                            {refund.createdAt
                                              ? formatDate(
                                                  refund.createdAt
                                                    .toDate()
                                                    .toISOString(),
                                                )
                                              : "N/A"}
                                          </p>
                                          {refund.reason && (
                                            <p className="text-xs text-gray-600 mt-1">
                                              Reason: {refund.reason}
                                            </p>
                                          )}
                                        </div>
                                        <div className="text-right">
                                          <p className="text-sm font-medium text-orange-600">
                                            -{formatPrice(refund.totalAmount)}
                                          </p>
                                          <p className="text-xs text-gray-500 capitalize">
                                            {refund.status}
                                          </p>
                                        </div>
                                      </div>
                                    </div>
                                  ),
                                )}
                              </div>
                            </div>
                          )}

                        {/* Cancellation Info (if cancelled) */}
                        {selectedTransaction.status === "cancelled" && (
                          <div className="bg-red-50 rounded-lg p-4">
                            <h3 className="text-lg font-medium text-gray-900 mb-4">
                              Cancellation Details
                            </h3>
                            <div className="space-y-2">
                              {selectedTransaction.cancelledAt && (
                                <div className="flex justify-between">
                                  <span className="text-sm text-gray-600">
                                    Cancelled At:
                                  </span>
                                  <span className="text-sm font-medium text-gray-900">
                                    {formatDate(
                                      selectedTransaction.cancelledAt
                                        .toDate()
                                        .toISOString(),
                                    )}
                                  </span>
                                </div>
                              )}
                              {selectedTransaction.cancelReason && (
                                <div className="flex justify-between">
                                  <span className="text-sm text-gray-600">
                                    Reason:
                                  </span>
                                  <span className="text-sm font-medium text-gray-900">
                                    {selectedTransaction.cancelReason}
                                  </span>
                                </div>
                              )}
                              {selectedTransaction.cancelledBy && (
                                <div className="flex justify-between">
                                  <span className="text-sm text-gray-600">
                                    Cancelled By:
                                  </span>
                                  <span className="text-sm font-medium text-gray-900">
                                    {selectedTransaction.cancelledBy}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mt-6 flex justify-end">
                      <button
                        onClick={() => setShowViewDetailsModal(false)}
                        className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

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
                        const transaction = transactions.find(
                          (t) => t.id === openDropdown,
                        );
                        if (transaction) handleViewClick(transaction);
                      }}
                      className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                    >
                      <Eye className="h-4 w-4 mr-3" />
                      View Details
                    </button>

                    {(() => {
                      const transaction = transactions.find(
                        (t) => t.id === openDropdown,
                      );

                      // Show Approve for pending COD transactions
                      if (
                        transaction?.status === "pending" &&
                        transaction?.paymentMethod === "cod"
                      ) {
                        return (
                          <button
                            onClick={() => {
                              if (transaction) handleApproveClick(transaction);
                            }}
                            className="flex items-center w-full px-4 py-2 text-sm text-green-600 hover:bg-green-50 transition-colors"
                          >
                            <CheckCircle className="h-4 w-4 mr-3" />
                            Approve
                          </button>
                        );
                      }

                      // Show Refund for completed and partially refunded transactions
                      return (
                        (transaction?.status === "completed" ||
                          transaction?.status === "partially_refunded") && (
                          <button
                            onClick={() => {
                              if (transaction) handleRefundClick(transaction);
                            }}
                            className="flex items-center w-full px-4 py-2 text-sm text-orange-600 hover:bg-orange-50 transition-colors"
                          >
                            <RotateCcw className="h-4 w-4 mr-3" />
                            {transaction?.status === "partially_refunded"
                              ? "Refund More"
                              : "Refund Quantity"}
                          </button>
                        )
                      );
                    })()}

                    {(() => {
                      const transaction = transactions.find(
                        (t) => t.id === openDropdown,
                      );
                      return (
                        transaction?.status !== "cancelled" && (
                          <button
                            onClick={() => {
                              if (transaction) handleCancelClick(transaction);
                            }}
                            className="flex items-center w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                          >
                            <X className="h-4 w-4 mr-3" />
                            Cancel Checkout
                          </button>
                        )
                      );
                    })()}
                  </div>
                </div>,
                document.body,
              )}
          </div>
        </main>
      </div>
    </div>
  );
}
