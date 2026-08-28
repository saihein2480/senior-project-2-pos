"use client";

import { toast } from "react-hot-toast";
import React, { useState, useEffect } from "react";
import Image from "next/image";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Sidebar } from "@/components/ui/Sidebar";
import { TopNavBar } from "@/components/ui/TopNavBar";
import { ImageUpload } from "@/components/ui/ImageUpload";
import { ExpenseCategory, Expense } from "@/types/expense";
import { Trash2 } from "lucide-react";

function ExpensesContent() {
  const [activeMenuItem, setActiveMenuItem] = useState("expenses");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(false);

  // Form state
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [note, setNote] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [amount, setAmount] = useState("");
  const [selectedCurrency, setSelectedCurrency] = useState<"THB" | "MMK">(
    "THB",
  );

  // Modal states
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);

  // Filter and pagination states
  const [filterCategory, setFilterCategory] = useState("");
  const [filterCurrency, setFilterCurrency] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 30;

  // Multi-select state
  const [selectedExpenses, setSelectedExpenses] = useState<string[]>([]);
  const [isProcessingBulkDelete, setIsProcessingBulkDelete] = useState(false);

  const fetchData = React.useCallback(async () => {
    try {
      setLoading(true);
      const [categoriesRes, expensesRes] = await Promise.all([
        fetch("/api/expenses?type=categories"),
        fetch("/api/expenses"),
      ]);

      const categoriesData = await categoriesRes.json();
      const expensesData = await expensesRes.json();

      if (categoriesData.success) setCategories(categoriesData.data);
      if (expensesData.success) setExpenses(expensesData.data);
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) {
      toast.error("Please enter a category name");
      return;
    }

    try {
      const response = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "category", name: newCategoryName }),
      });

      const data = await response.json();
      if (data.success) {
        setCategories([data.data, ...categories]);
        setNewCategoryName("");
        setShowCategoryModal(false);
        toast.success("Category added successfully");
      } else {
        toast.error("Failed to add category");
      }
    } catch (error) {
      console.error("Error adding category:", error);
      toast.error("Failed to add category");
    }
  };

  // Removed Spending Menu add handler

  const handleAddExpense = async () => {
    if (!selectedCategoryId || !amount || !date) {
      toast.error("Please fill in all required fields");
      return;
    }

    try {
      setLoading(true);
      const response = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryId: selectedCategoryId,
          note,
          imageUrl,
          date,
          amount: parseFloat(amount),
          currency: selectedCurrency,
        }),
      });

      const data = await response.json();
      if (data.success) {
        setExpenses([data.data, ...expenses]);
        // Reset form
        setSelectedCategoryId("");
        setNote("");
        setImageUrl("");
        setAmount("");
        setDate(new Date().toISOString().split("T")[0]);
        toast.success("Expense added successfully");
      } else {
        toast.error("Failed to add expense");
      }
    } catch (error) {
      console.error("Error adding expense:", error);
      toast.error("Failed to add expense");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCategory = async (id: string) => {
    if (!confirm("Are you sure you want to delete this category?")) return;

    try {
      const response = await fetch(`/api/expenses?type=category&id=${id}`, {
        method: "DELETE",
      });

      const data = await response.json();
      if (data.success) {
        setCategories(categories.filter((cat) => cat.id !== id));
        toast.success("Category deleted successfully");
      } else {
        toast.error("Failed to delete category");
      }
    } catch (error) {
      console.error("Error deleting category:", error);
      toast.error("Failed to delete category");
    }
  };

  // Removed Spending Menu delete handler

  const handleDeleteExpense = async (id: string) => {
    if (!confirm("Are you sure you want to delete this expense?")) {
      return;
    }

    try {
      const response = await fetch(`/api/expenses?id=${id}`, {
        method: "DELETE",
      });

      const data = await response.json();
      if (data.success) {
        setExpenses(expenses.filter((expense) => expense.id !== id));
        toast.success("Expense deleted successfully");
      } else {
        toast.error("Failed to delete expense");
      }
    } catch (error) {
      console.error("Error deleting expense:", error);
      toast.error("Failed to delete expense");
    }
  };

  // Toggle select single expense
  const toggleSelectExpense = (expenseId: string) => {
    setSelectedExpenses((prev) =>
      prev.includes(expenseId)
        ? prev.filter((id) => id !== expenseId)
        : [...prev, expenseId],
    );
  };

  // Toggle select all expenses
  const toggleSelectAll = () => {
    if (selectedExpenses.length === paginatedExpenses.length) {
      setSelectedExpenses([]);
    } else {
      setSelectedExpenses(paginatedExpenses.map((expense) => expense.id));
    }
  };

  // Bulk delete selected expenses
  const handleBulkDelete = async () => {
    if (selectedExpenses.length === 0) return;

    const confirmed = window.confirm(
      `Are you sure you want to permanently delete ${selectedExpenses.length} expense(s)?\n\nThis action cannot be undone.`,
    );

    if (!confirmed) return;

    setIsProcessingBulkDelete(true);
    let successCount = 0;
    let failCount = 0;

    for (const expenseId of selectedExpenses) {
      try {
        const response = await fetch(`/api/expenses?id=${expenseId}`, {
          method: "DELETE",
        });

        const data = await response.json();
        if (data.success) {
          successCount++;
        } else {
          failCount++;
        }
      } catch {
        failCount++;
      }
    }

    // Remove deleted expenses from state
    if (successCount > 0) {
      setExpenses((prevExpenses) =>
        prevExpenses.filter(
          (expense) => !selectedExpenses.includes(expense.id),
        ),
      );
      setSelectedExpenses([]);
      toast.success(
        `Successfully deleted ${successCount} expense(s).${failCount > 0 ? ` Failed to delete ${failCount} item(s).` : ""}`,
      );
    } else {
      toast.error("Failed to delete any expenses. Please try again.");
    }

    setIsProcessingBulkDelete(false);
  };

  const handleEditExpense = (expense: Expense) => {
    setEditingExpense(expense);
    setShowEditModal(true);
  };

  const handleUpdateExpense = async () => {
    if (!editingExpense) return;

    if (!editingExpense.categoryId || !editingExpense.amount) {
      toast.error("Please fill in all required fields");
      return;
    }

    try {
      setLoading(true);
      const response = await fetch(`/api/expenses?id=${editingExpense.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryId: editingExpense.categoryId,
          note: editingExpense.note,
          date: editingExpense.date,
          amount: editingExpense.amount,
          currency: editingExpense.currency,
        }),
      });

      const data = await response.json();
      if (data.success) {
        await fetchData();
        setShowEditModal(false);
        setEditingExpense(null);
        toast.success("Expense updated successfully");
      } else {
        toast.error("Failed to update expense");
      }
    } catch (error) {
      console.error("Error updating expense:", error);
      toast.error("Failed to update expense");
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number, curr: "THB" | "MMK") => {
    const symbol = curr === "THB" ? "฿" : "Ks";
    return (
      symbol +
      " " +
      new Intl.NumberFormat("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(amount)
    );
  };

  // Filter expenses
  const filteredExpenses = expenses.filter((expense) => {
    if (filterCategory && expense.categoryId !== filterCategory) return false;
    if (filterCurrency && expense.currency !== filterCurrency) return false;
    if (filterDateFrom && new Date(expense.date) < new Date(filterDateFrom))
      return false;
    if (filterDateTo && new Date(expense.date) > new Date(filterDateTo))
      return false;
    return true;
  });

  // Paginate expenses
  const totalPages = Math.ceil(filteredExpenses.length / itemsPerPage);
  const paginatedExpenses = filteredExpenses.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );

  // Calculate totals by currency
  const totalsByCurrency = filteredExpenses.reduce(
    (acc, expense) => {
      if (expense.currency === "THB") {
        acc.THB += expense.amount;
      } else if (expense.currency === "MMK") {
        acc.MMK += expense.amount;
      }
      return acc;
    },
    { THB: 0, MMK: 0 },
  );

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filterCategory, filterCurrency, filterDateFrom, filterDateTo]);

  return (
    <div className="min-h-screen bg-white flex">
      {/* Desktop sidebar (hidden on small screens) */}
      <div className="hidden lg:block">
        <Sidebar
          activeItem={activeMenuItem}
          onItemClick={(item) => setActiveMenuItem(item.id)}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          className="h-screen"
        />
      </div>

      {/* Mobile sidebar overlay */}
      <div className="lg:hidden">
        <Sidebar
          activeItem={activeMenuItem}
          onItemClick={(item) => {
            setActiveMenuItem(item.id);
            setIsMobileSidebarOpen(false);
          }}
          isCollapsed={false}
          isMobileOpen={isMobileSidebarOpen}
          onCloseMobile={() => setIsMobileSidebarOpen(false)}
        />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <TopNavBar
          onCartModalStateChange={() => {}}
          onMenuToggle={() => setIsMobileSidebarOpen((s) => !s)}
        />

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="max-w-screen-2xl mx-auto">
            <div className="space-y-6">
              {/* Header */}
              <div className="flex items-center gap-3 mb-8">
                <div>
                  <h1 className="text-3xl font-bold text-gray-900">Expenses</h1>
                  <p className="text-sm text-gray-500 mt-1">Track and manage your business expenses</p>
                </div>
              </div>

              {/* Expense Form */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 mb-8">
                <div className="flex items-center gap-2 mb-6">
                  <h2 className="text-xl font-bold text-gray-900">
                    Add New Expense
                  </h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Category Selection */}
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-3 uppercase tracking-wide">
                      Category <span className="text-red-500">*</span>
                    </label>
                    <div className="flex gap-3">
                      <select
                        title="category"
                        value={selectedCategoryId}
                        onChange={(e) => setSelectedCategoryId(e.target.value)}
                        className="flex-1 px-4 py-3 border border-gray-300 text-gray-900 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-300 transition-all font-medium"
                      >
                        <option value="" className="text-gray-500">
                          Select Category
                        </option>
                        {categories.map((cat) => (
                          <option
                            key={cat.id}
                            value={cat.id}
                            className="text-gray-900"
                          >
                            {cat.name}
                          </option>
                        ))}
                      </select>
                      <Button
                        onClick={() => setShowCategoryModal(true)}
                        variant="outline"
                        className="px-4 py-3 rounded-xl font-bold"
                      >
                        + Add
                      </Button>
                    </div>
                  </div>

                  {/* Date */}
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-3 uppercase tracking-wide">
                      Date <span className="text-red-500">*</span>
                    </label>
                    <input
                      title="date"
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="w-full px-4 py-3 border border-gray-300 text-gray-900 placeholder-gray-400 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-300 transition-all font-medium"
                    />
                  </div>

                  {/* Amount and Currency */}
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-3 uppercase tracking-wide">
                      Amount <span className="text-red-500">*</span>
                    </label>
                    <div className="flex gap-3">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="0.00"
                        className="flex-1 px-4 py-3 border border-gray-300 text-gray-900 placeholder-gray-400 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-300 transition-all font-medium"
                      />
                      <select
                        title="currency"
                        value={selectedCurrency}
                        onChange={(e) =>
                          setSelectedCurrency(e.target.value as "THB" | "MMK")
                        }
                        className="px-4 py-3 border border-gray-300 text-gray-900 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-300 transition-all font-medium"
                      >
                        <option value="THB" className="text-gray-900">
                          THB
                        </option>
                        <option value="MMK" className="text-gray-900">
                          MMK
                        </option>
                      </select>
                    </div>
                  </div>

                  {/* Note */}
                  <div className="md:col-span-2">
                    <label className="block text-sm font-bold text-gray-700 mb-3 uppercase tracking-wide">
                      Note (Optional)
                    </label>
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Enter any additional notes..."
                      rows={3}
                      className="w-full px-4 py-3 border border-gray-300 text-gray-900 placeholder-gray-400 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-300 transition-all font-medium resize-none"
                    />
                  </div>

                  {/* Image Upload */}
                  <div className="md:col-span-2">
                    <label className="block text-sm font-bold text-gray-700 mb-3 uppercase tracking-wide">
                      Expense Image (Optional)
                    </label>
                    <ImageUpload
                      value={imageUrl}
                      onChange={setImageUrl}
                      onRemove={() => setImageUrl("")}
                      folder="pos-clothing-store/expenses"
                    />
                  </div>
                </div>

                <div className="mt-8">
                  <Button
                    onClick={handleAddExpense}
                    disabled={loading}
                    className="w-full md:w-auto px-6 py-3 rounded-xl font-bold text-base"
                  >
                    {loading ? "Adding..." : "Add Expense"}
                  </Button>
                </div>
              </div>

              {/* Expense List */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
                <div className="flex items-center gap-2 mb-6">
                  <h2 className="text-xl font-bold text-gray-900">
                    Expense History
                  </h2>
                </div>

                {/* Filters */}
                <div className="flex flex-col sm:flex-row items-center gap-4 mb-6">
                  <select
                    title="category"
                    value={filterCategory}
                    onChange={(e) => setFilterCategory(e.target.value)}
                    className="w-full sm:w-auto px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-300 text-gray-900 font-medium transition-all"
                  >
                    <option value="" className="text-gray-900">
                      All Categories
                    </option>
                    {categories.map((cat) => (
                      <option
                        key={cat.id}
                        value={cat.id}
                        className="text-gray-900"
                      >
                        {cat.name}
                      </option>
                    ))}
                  </select>

                  <select
                    title="currency"
                    value={filterCurrency}
                    onChange={(e) => setFilterCurrency(e.target.value)}
                    className="w-full sm:w-auto px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-300 text-gray-900 font-medium transition-all"
                  >
                    <option value="" className="text-gray-900">
                      All Currencies
                    </option>
                    <option value="THB" className="text-gray-900">
                      THB (฿)
                    </option>
                    <option value="MMK" className="text-gray-900">
                      MMK (Ks)
                    </option>
                  </select>

                  <input
                    type="date"
                    value={filterDateFrom}
                    onChange={(e) => setFilterDateFrom(e.target.value)}
                    className="w-full sm:w-auto px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-300 text-gray-900 font-medium transition-all"
                  />

                  <span className="text-gray-400 text-lg font-light hidden sm:inline">−</span>

                  <input
                    type="date"
                    value={filterDateTo}
                    onChange={(e) => setFilterDateTo(e.target.value)}
                    className="w-full sm:w-auto px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-300 text-gray-900 font-medium transition-all"
                  />

                  {(filterCategory || filterCurrency || filterDateFrom || filterDateTo) && (
                    <Button
                      onClick={() => {
                        setFilterCategory("");
                        setFilterCurrency("");
                        setFilterDateFrom("");
                        setFilterDateTo("");
                      }}
                      variant="outline"
                      className="px-4 py-3 rounded-xl font-bold text-sm"
                    >
                      Clear Filters
                    </Button>
                  )}
                </div>

                {/* Total Amount Display */}
                {filteredExpenses.length > 0 && (
                  <div className="mb-6 p-6 bg-gradient-to-r from-pink-50 to-pink-100 border border-gray-100 rounded-2xl">
                    <div className="flex items-center justify-between flex-wrap gap-4">
                      <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide">
                        Total Amount:
                      </h3>
                      <div className="flex gap-8">
                        {totalsByCurrency.THB > 0 && (
                          <div className="text-right">
                            <div className="text-xs text-gray-600 font-bold uppercase tracking-wide">THB</div>
                            <div className="text-2xl font-bold text-gray-900">
                              ฿{" "}
                              {totalsByCurrency.THB.toLocaleString("en-US", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </div>
                          </div>
                        )}
                        {totalsByCurrency.MMK > 0 && (
                          <div className="text-right">
                            <div className="text-xs text-gray-600 font-bold uppercase tracking-wide">MMK</div>
                            <div className="text-2xl font-bold text-gray-900">
                              Ks{" "}
                              {totalsByCurrency.MMK.toLocaleString("en-US", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Bulk Actions Bar */}
                {selectedExpenses.length > 0 && (
                  <div className="mb-6 bg-gray-50 border border-gray-200 rounded-2xl p-5 flex items-center justify-between flex-wrap gap-4">
                    <div className="flex items-center space-x-3">
                      <span className="text-sm font-bold text-gray-800 uppercase tracking-wide">
                        {selectedExpenses.length} expense(s) selected
                      </span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <button
                        onClick={handleBulkDelete}
                        disabled={isProcessingBulkDelete}
                        className="flex items-center px-4 py-2 bg-red-600 text-white hover:bg-red-700 transition-colors text-sm font-bold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isProcessingBulkDelete ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2"></div>
                            Deleting...
                          </>
                        ) : (
                          <>
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete Selected
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => setSelectedExpenses([])}
                        className="px-4 py-2 bg-gray-300 text-gray-700 hover:bg-gray-400 transition-colors text-sm font-bold rounded-xl"
                      >
                        Clear Selection
                      </button>
                    </div>
                  </div>
                )}

                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gradient-to-r from-pink-50 to-pink-100 border-b border-gray-100">
                        <th className="px-6 py-4 w-12">
                          <input
                            type="checkbox"
                            checked={
                              paginatedExpenses.length > 0 &&
                              selectedExpenses.length ===
                                paginatedExpenses.length
                            }
                            onChange={toggleSelectAll}
                            className="h-4 w-4 text-cyan-600 focus:ring-pink-300 border-gray-300 rounded cursor-pointer"
                            aria-label="Select all expenses"
                          />
                        </th>
                        <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                          Image
                        </th>
                        <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                          Date
                        </th>
                        <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                          Category
                        </th>
                        <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                          Amount
                        </th>
                        <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                          Note
                        </th>
                        <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filteredExpenses.length === 0 ? (
                        <tr>
                          <td
                            colSpan={7}
                            className="px-6 py-16 text-center"
                          >
                            <div className="text-gray-300 text-lg font-semibold mb-2">
                              {expenses.length === 0
                                ? "No expenses recorded yet"
                                : "No expenses match the selected filters"}
                            </div>
                          </td>
                        </tr>
                      ) : (
                        paginatedExpenses.map((expense) => (
                          <tr
                            key={expense.id}
                            className="hover:bg-gray-50 transition-colors"
                          >
                            <td className="px-6 py-4">
                              <input
                                type="checkbox"
                                checked={selectedExpenses.includes(expense.id)}
                                onChange={() => toggleSelectExpense(expense.id)}
                                className="h-4 w-4 text-cyan-600 focus:ring-pink-300 border-gray-300 rounded cursor-pointer"
                                aria-label={`Select expense ${expense.id}`}
                              />
                            </td>
                            <td className="px-6 py-4 text-sm">
                              {expense.imageUrl ? (
                                <a
                                  href={expense.imageUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title="Open expense image"
                                  aria-label="Open expense image"
                                  className="block"
                                >
                                  <Image
                                    src={expense.imageUrl}
                                    alt="Expense"
                                    width={64}
                                    height={64}
                                    unoptimized
                                    className="w-16 h-16 object-cover rounded-xl hover:opacity-80 transition-opacity"
                                  />
                                </a>
                              ) : (
                                <span className="text-gray-400 font-medium">-</span>
                              )}
                            </td>
                            <td className="px-6 py-4 text-sm font-medium text-gray-900">
                              {new Date(expense.date).toLocaleDateString()}
                            </td>
                            <td className="px-6 py-4 text-sm font-medium text-gray-900">
                              {expense.categoryName}
                            </td>
                            <td className="px-6 py-4 text-sm font-bold text-gray-900">
                              {formatCurrency(expense.amount, expense.currency)}
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-600">
                              {expense.note || "-"}
                            </td>
                            <td className="px-6 py-4 text-sm">
                              <div className="flex gap-3">
                                <button
                                  onClick={() => handleEditExpense(expense)}
                                  className="text-pink-600 hover:text-pink-700 font-bold transition-colors"
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() =>
                                    handleDeleteExpense(expense.id)
                                  }
                                  className="text-red-600 hover:text-red-800 font-bold transition-colors"
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {filteredExpenses.length > 0 && (
                  <div className="mt-6 flex items-center justify-between flex-wrap gap-4">
                    <div className="text-sm font-medium text-gray-700">
                      Showing {(currentPage - 1) * itemsPerPage + 1} to{" "}
                      {Math.min(
                        currentPage * itemsPerPage,
                        filteredExpenses.length,
                      )}{" "}
                      of {filteredExpenses.length} expenses
                    </div>
                    <div className="flex gap-3">
                      <Button
                        onClick={() => setCurrentPage(currentPage - 1)}
                        disabled={currentPage === 1}
                        variant="outline"
                        className="px-4 py-2 rounded-xl font-bold text-sm"
                      >
                        Previous
                      </Button>
                      <div className="flex gap-2">
                        {Array.from({ length: totalPages }, (_, i) => i + 1)
                          .filter((page) => {
                            return (
                              page === 1 ||
                              page === totalPages ||
                              Math.abs(page - currentPage) <= 1
                            );
                          })
                          .map((page, index, array) => (
                            <div key={page} className="flex items-center gap-2">
                              {index > 0 && array[index - 1] !== page - 1 && (
                                <span className="px-2 text-gray-500">...</span>
                              )}
                              <Button
                                onClick={() => setCurrentPage(page)}
                                variant={
                                  currentPage === page ? "primary" : "outline"
                                }
                                className="text-sm min-w-[2.5rem] rounded-xl font-bold"
                              >
                                {page}
                              </Button>
                            </div>
                          ))}
                      </div>
                      <Button
                        onClick={() => setCurrentPage(currentPage + 1)}
                        disabled={currentPage === totalPages}
                        variant="outline"
                        className="px-4 py-2 rounded-xl font-bold text-sm"
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Add Category Modal */}
              {showCategoryModal && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
                  <div className="bg-white rounded-2xl p-8 w-full max-w-md max-h-[80vh] overflow-y-auto border border-gray-100 shadow-xl">
                    <h3 className="text-2xl font-bold mb-6 text-gray-900">
                      Manage Categories
                    </h3>

                    {/* Existing Categories List */}
                    <div className="mb-8">
                      <h4 className="text-sm font-bold text-gray-700 mb-4 uppercase tracking-wide">
                        Existing Categories
                      </h4>
                      <div className="space-y-3 max-h-60 overflow-y-auto">
                        {categories.map((cat) => (
                          <div
                            key={cat.id}
                            className="flex justify-between items-center p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors border border-gray-100"
                          >
                            <span className="text-gray-900 font-bold">
                              {cat.name}
                            </span>
                            <button
                              onClick={() => handleDeleteCategory(cat.id)}
                              className="text-red-600 hover:text-red-800 text-sm font-bold px-3 py-1 rounded-lg hover:bg-red-50 transition-colors"
                            >
                              Delete
                            </button>
                          </div>
                        ))}
                        {categories.length === 0 && (
                          <p className="text-gray-500 text-sm text-center py-6 font-medium">
                            No categories yet
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Add New Category Form */}
                    <div className="border-t border-gray-200 pt-6">
                      <h4 className="text-sm font-bold text-gray-700 mb-4 uppercase tracking-wide">
                        Add New Category
                      </h4>
                      <Input
                        value={newCategoryName}
                        onChange={(e) => setNewCategoryName(e.target.value)}
                        placeholder="Enter category name"
                        className="mb-4 rounded-xl font-medium"
                      />
                      <div className="flex gap-3">
                        <Button onClick={handleAddCategory} className="flex-1 rounded-xl font-bold py-3">
                          Add
                        </Button>
                        <Button
                          onClick={() => {
                            setShowCategoryModal(false);
                            setNewCategoryName("");
                          }}
                          variant="outline"
                          className="flex-1 rounded-xl font-bold py-3"
                        >
                          Close
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Add Spending Menu Modal */}
              {/* Removed Spending Menu Modal */}

              {/* Edit Expense Modal */}
              {showEditModal && editingExpense && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                  <div className="bg-white rounded-2xl w-full max-w-2xl border border-gray-100 shadow-2xl flex flex-col">
                    {/* Modal Header */}
                    <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-pink-50 to-white">
                      <h3 className="text-lg font-bold text-gray-900">
                        Edit Expense
                      </h3>
                    </div>

                    {/* Modal Body - No Scroll */}
                    <div className="px-6 py-5">
                      <div className="grid grid-cols-2 gap-4">
                        {/* Category */}
                        <div>
                          <label className="block text-xs font-bold text-gray-700 mb-2 uppercase tracking-wide">
                            Category <span className="text-red-500">*</span>
                          </label>
                          <select
                            title="category"
                            value={editingExpense.categoryId}
                            onChange={(e) =>
                              setEditingExpense({
                                ...editingExpense,
                                categoryId: e.target.value,
                                categoryName:
                                  categories.find((c) => c.id === e.target.value)
                                    ?.name || "",
                              })
                            }
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-300 text-gray-900 text-sm font-medium transition-all"
                          >
                            <option value="" className="text-gray-900">
                              Select Category
                            </option>
                            {categories.map((cat) => (
                              <option
                                key={cat.id}
                                value={cat.id}
                                className="text-gray-900"
                              >
                                {cat.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Date */}
                        <div>
                          <label className="block text-xs font-bold text-gray-700 mb-2 uppercase tracking-wide">
                            Date <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="date"
                            value={
                              editingExpense.date instanceof Date
                                ? editingExpense.date.toISOString().split("T")[0]
                                : new Date(editingExpense.date)
                                    .toISOString()
                                    .split("T")[0]
                            }
                            onChange={(e) =>
                              setEditingExpense({
                                ...editingExpense,
                                date: new Date(e.target.value),
                              })
                            }
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-300 text-gray-900 text-sm font-medium transition-all"
                          />
                        </div>

                        {/* Amount */}
                        <div>
                          <label className="block text-xs font-bold text-gray-700 mb-2 uppercase tracking-wide">
                            Amount <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={editingExpense.amount}
                            onChange={(e) =>
                              setEditingExpense({
                                ...editingExpense,
                                amount: parseFloat(e.target.value),
                              })
                            }
                            placeholder="Enter amount"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-300 text-gray-900 text-sm font-medium transition-all"
                          />
                        </div>

                        {/* Currency */}
                        <div>
                          <label className="block text-xs font-bold text-gray-700 mb-2 uppercase tracking-wide">
                            Currency <span className="text-red-500">*</span>
                          </label>
                          <select
                            title="currency"
                            value={editingExpense.currency}
                            onChange={(e) =>
                              setEditingExpense({
                                ...editingExpense,
                                currency: e.target.value as "THB" | "MMK",
                              })
                            }
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-300 text-gray-900 text-sm font-medium transition-all"
                          >
                            <option value="THB" className="text-gray-900">
                              THB (฿)
                            </option>
                            <option value="MMK" className="text-gray-900">
                              MMK (Ks)
                            </option>
                          </select>
                        </div>

                        {/* Note - Full Width */}
                        <div className="col-span-2">
                          <label className="block text-xs font-bold text-gray-700 mb-2 uppercase tracking-wide">
                            Note (Optional)
                          </label>
                          <textarea
                            value={editingExpense.note || ""}
                            onChange={(e) =>
                              setEditingExpense({
                                ...editingExpense,
                                note: e.target.value,
                              })
                            }
                            placeholder="Add notes about this expense..."
                            rows={2}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-300 text-gray-900 text-sm font-medium transition-all resize-none"
                          />
                        </div>

                        {/* Image Upload - Full Width */}
                        <div className="col-span-2">
                          <label className="block text-xs font-bold text-gray-700 mb-2 uppercase tracking-wide">
                            Expense Image (Optional)
                          </label>
                          <ImageUpload
                            value={editingExpense.imageUrl || ""}
                            onChange={(url) =>
                              setEditingExpense({
                                ...editingExpense,
                                imageUrl: url,
                              })
                            }
                            onRemove={() =>
                              setEditingExpense({
                                ...editingExpense,
                                imageUrl: "",
                              })
                            }
                            folder="pos-clothing-store/expenses"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Modal Footer */}
                    <div className="px-6 py-3 border-t border-gray-100 bg-gray-50 flex gap-3">
                      <Button
                        onClick={() => {
                          setShowEditModal(false);
                          setEditingExpense(null);
                        }}
                        variant="outline"
                        className="flex-1 rounded-lg font-bold py-2 text-sm"
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={handleUpdateExpense}
                        disabled={loading}
                        className="flex-1 rounded-lg font-bold py-2 text-sm"
                      >
                        {loading ? "Updating..." : "Update Expense"}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

export default function ExpensesPage() {
  return (
    <ProtectedRoute>
      <ExpensesContent />
    </ProtectedRoute>
  );
}


