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
    <div className="min-h-screen bg-gray-50 flex">
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
              {/* Expense Form */}
              <div className="bg-white rounded-lg shadow-md p-6 mb-6">
                <h2 className="text-xl font-semibold mb-4 text-gray-900">
                  Add New Expense
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Category Selection */}
                  <div>
                    <label className="block text-sm font-medium mb-2 text-gray-900">
                      Category <span className="text-red-500">*</span>
                    </label>
                    <div className="flex gap-2">
                      <select
                        title="category"
                        value={selectedCategoryId}
                        onChange={(e) => setSelectedCategoryId(e.target.value)}
                        className="flex-1 px-3 py-2 border border-gray-300 text-gray-900 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-300"
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
                      >
                        + Add
                      </Button>
                    </div>
                  </div>

                  {/* Removed Spending Menu Selection */}

                  {/* Date */}
                  <div>
                    <label className="block text-sm font-medium mb-2 text-gray-900">
                      Date <span className="text-red-500">*</span>
                    </label>
                    <input
                      title="date"
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 text-gray-900 placeholder-gray-400 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-300"
                    />
                  </div>

                  {/* Amount and Currency */}
                  <div>
                    <label className="block text-sm font-medium mb-2 text-gray-900">
                      Amount <span className="text-red-500">*</span>
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        step="0.01"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="0.00"
                        className="flex-1 px-3 py-2 border border-gray-300 text-gray-900 placeholder-gray-400 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-300"
                      />
                      <select
                        title="currency"
                        value={selectedCurrency}
                        onChange={(e) =>
                          setSelectedCurrency(e.target.value as "THB" | "MMK")
                        }
                        className="px-3 py-2 border border-gray-300 text-gray-900 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-300"
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
                    <label className="block text-sm font-medium mb-2 text-gray-900">
                      Note
                    </label>
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Enter any additional notes..."
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 text-gray-900 placeholder-gray-400 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-300"
                    />
                  </div>

                  {/* Image Upload */}
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium mb-2 text-gray-900">
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

                <div className="mt-4">
                  <Button
                    onClick={handleAddExpense}
                    disabled={loading}
                    className="w-full md:w-auto"
                  >
                    {loading ? "Adding..." : "Add Expense"}
                  </Button>
                </div>
              </div>

              {/* Expense List */}
              <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-xl font-semibold mb-4 text-gray-900">
                  Expense History
                </h2>

                {/* Filters */}
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Filter by Category
                    </label>
                    <select
                      title="category"
                      value={filterCategory}
                      onChange={(e) => setFilterCategory(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-300 text-gray-900"
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
                  </div>

                  {/* Removed Filter by Spending Menu */}

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Filter by Currency
                    </label>
                    <select
                      title="currency"
                      value={filterCurrency}
                      onChange={(e) => setFilterCurrency(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-300 text-gray-900"
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
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Date From
                    </label>
                    <Input
                      type="date"
                      value={filterDateFrom}
                      onChange={(e) => setFilterDateFrom(e.target.value)}
                      className="w-full"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Date To
                    </label>
                    <Input
                      type="date"
                      value={filterDateTo}
                      onChange={(e) => setFilterDateTo(e.target.value)}
                      className="w-full"
                    />
                  </div>
                </div>

                {/* Clear Filters Button */}
                {(filterCategory ||
                  filterCurrency ||
                  filterDateFrom ||
                  filterDateTo) && (
                  <div className="mb-4">
                    <Button
                      onClick={() => {
                        setFilterCategory("");
                        // Removed setFilterSpendingMenu
                        setFilterCurrency("");
                        setFilterDateFrom("");
                        setFilterDateTo("");
                      }}
                      variant="outline"
                      className="text-sm"
                    >
                      Clear Filters
                    </Button>
                  </div>
                )}

                {/* Total Amount Display */}
                {filteredExpenses.length > 0 && (
                  <div className="mb-4 p-4  border rounded-lg">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold text-gray-900">
                        Total Amount:
                      </h3>
                      <div className="flex gap-6">
                        {totalsByCurrency.THB > 0 && (
                          <div className="text-right">
                            <div className="text-sm text-gray-600">THB</div>
                            <div className="text-xl font-bold text-gray-900">
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
                            <div className="text-sm text-gray-600">MMK</div>
                            <div className="text-xl font-bold text-gray-900">
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
                  <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <span className="text-sm font-medium text-blue-900">
                        {selectedExpenses.length} expense(s) selected
                      </span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={handleBulkDelete}
                        disabled={isProcessingBulkDelete}
                        className="flex items-center px-4 py-2 bg-red-600 text-white hover:bg-red-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
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
                        className="px-4 py-2 bg-gray-200 text-gray-700 hover:bg-gray-300 transition-colors text-sm font-medium"
                      >
                        Clear Selection
                      </button>
                    </div>
                  </div>
                )}

                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-100 border-b">
                        <th className="px-4 py-3 w-12">
                          <input
                            type="checkbox"
                            checked={
                              paginatedExpenses.length > 0 &&
                              selectedExpenses.length ===
                                paginatedExpenses.length
                            }
                            onChange={toggleSelectAll}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer"
                            aria-label="Select all expenses"
                          />
                        </th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">
                          Image
                        </th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">
                          Date
                        </th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">
                          Category
                        </th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">
                          {/* Removed Spending Menu column */}
                        </th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">
                          Amount
                        </th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">
                          Note
                        </th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredExpenses.length === 0 ? (
                        <tr>
                          <td
                            colSpan={8}
                            className="px-4 py-8 text-center text-gray-500"
                          >
                            {expenses.length === 0
                              ? "No expenses recorded yet"
                              : "No expenses match the selected filters"}
                          </td>
                        </tr>
                      ) : (
                        paginatedExpenses.map((expense) => (
                          <tr
                            key={expense.id}
                            className="border-b hover:bg-gray-50"
                          >
                            <td className="px-4 py-3">
                              <input
                                type="checkbox"
                                checked={selectedExpenses.includes(expense.id)}
                                onChange={() => toggleSelectExpense(expense.id)}
                                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer"
                                aria-label={`Select expense ${expense.id}`}
                              />
                            </td>
                            <td className="px-4 py-3 text-sm">
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
                                    className="w-16 h-16 object-cover rounded cursor-pointer hover:opacity-80 transition-opacity"
                                  />
                                </a>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-900">
                              {new Date(expense.date).toLocaleDateString()}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-900">
                              {expense.categoryName}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-900">
                              {/* Removed Spending Menu value */}
                            </td>
                            <td className="px-4 py-3 text-sm font-semibold text-gray-900">
                              {formatCurrency(expense.amount, expense.currency)}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600">
                              {expense.note || "-"}
                            </td>
                            <td className="px-4 py-3 text-sm">
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleEditExpense(expense)}
                                  className="text-blue-600 hover:text-blue-800 font-medium"
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() =>
                                    handleDeleteExpense(expense.id)
                                  }
                                  className="text-red-600 hover:text-red-800 font-medium"
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
                  <div className="mt-4 flex items-center justify-between">
                    <div className="text-sm text-gray-700">
                      Showing {(currentPage - 1) * itemsPerPage + 1} to{" "}
                      {Math.min(
                        currentPage * itemsPerPage,
                        filteredExpenses.length,
                      )}{" "}
                      of {filteredExpenses.length} expenses
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={() => setCurrentPage(currentPage - 1)}
                        disabled={currentPage === 1}
                        variant="outline"
                        className="text-sm"
                      >
                        Previous
                      </Button>
                      <div className="flex gap-1">
                        {Array.from({ length: totalPages }, (_, i) => i + 1)
                          .filter((page) => {
                            // Show first, last, current, and adjacent pages
                            return (
                              page === 1 ||
                              page === totalPages ||
                              Math.abs(page - currentPage) <= 1
                            );
                          })
                          .map((page, index, array) => (
                            <div key={page} className="flex items-center gap-1">
                              {index > 0 && array[index - 1] !== page - 1 && (
                                <span className="px-2 text-gray-500">...</span>
                              )}
                              <Button
                                onClick={() => setCurrentPage(page)}
                                variant={
                                  currentPage === page ? "primary" : "outline"
                                }
                                className="text-sm min-w-[2.5rem]"
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
                        className="text-sm"
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Add Category Modal */}
              {showCategoryModal && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-50">
                  <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-[80vh] overflow-y-auto">
                    <h3 className="text-lg font-semibold mb-4 text-gray-900">
                      Manage Categories
                    </h3>

                    {/* Existing Categories List */}
                    <div className="mb-6">
                      <h4 className="text-sm font-medium text-gray-700 mb-2">
                        Existing Categories
                      </h4>
                      <div className="space-y-2 max-h-60 overflow-y-auto">
                        {categories.map((cat) => (
                          <div
                            key={cat.id}
                            className="flex justify-between items-center p-3 bg-gray-50 rounded hover:bg-gray-100"
                          >
                            <span className="text-gray-900 font-medium">
                              {cat.name}
                            </span>
                            <button
                              onClick={() => handleDeleteCategory(cat.id)}
                              className="text-red-500 hover:text-red-700 text-sm font-medium px-3 py-1 rounded hover:bg-red-50"
                            >
                              Delete
                            </button>
                          </div>
                        ))}
                        {categories.length === 0 && (
                          <p className="text-gray-500 text-sm text-center py-4">
                            No categories yet
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Add New Category Form */}
                    <div className="border-t pt-4">
                      <h4 className="text-sm font-medium text-gray-700 mb-2">
                        Add New Category
                      </h4>
                      <Input
                        value={newCategoryName}
                        onChange={(e) => setNewCategoryName(e.target.value)}
                        placeholder="Enter category name"
                        className="mb-4"
                      />
                      <div className="flex gap-2">
                        <Button onClick={handleAddCategory} className="flex-1">
                          Add
                        </Button>
                        <Button
                          onClick={() => {
                            setShowCategoryModal(false);
                            setNewCategoryName("");
                          }}
                          variant="outline"
                          className="flex-1"
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
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                  <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                    <h3 className="text-lg font-semibold mb-4 text-gray-900">
                      Edit Expense
                    </h3>

                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Category
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
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
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

                      {/* Removed Spending Menu field in Edit Modal */}

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Date
                        </label>
                        <Input
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
                          className="w-full"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Amount
                        </label>
                        <Input
                          type="number"
                          step="0.01"
                          value={editingExpense.amount}
                          onChange={(e) =>
                            setEditingExpense({
                              ...editingExpense,
                              amount: parseFloat(e.target.value),
                            })
                          }
                          placeholder="Enter amount"
                          className="w-full"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Currency
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
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                        >
                          <option value="THB" className="text-gray-900">
                            THB (฿)
                          </option>
                          <option value="MMK" className="text-gray-900">
                            MMK (Ks)
                          </option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Note (Optional)
                        </label>
                        <Input
                          value={editingExpense.note || ""}
                          onChange={(e) =>
                            setEditingExpense({
                              ...editingExpense,
                              note: e.target.value,
                            })
                          }
                          placeholder="Enter note"
                          className="w-full"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
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
                        />
                      </div>
                    </div>

                    <div className="flex gap-2 mt-6">
                      <Button
                        onClick={handleUpdateExpense}
                        disabled={loading}
                        className="flex-1"
                      >
                        {loading ? "Updating..." : "Update"}
                      </Button>
                      <Button
                        onClick={() => {
                          setShowEditModal(false);
                          setEditingExpense(null);
                        }}
                        variant="outline"
                        className="flex-1"
                      >
                        Cancel
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
