"use client";

import { toast } from "react-hot-toast";
import { useState, useEffect, useCallback } from "react";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Alert";
import { Sidebar } from "@/components/ui/Sidebar";
import { TopNavBar } from "@/components/ui/TopNavBar";
import { User, UserRole } from "@/types/auth";
import {
  UserPlus,
  Edit2,
  Trash2,
  UserCheck,
  UserX,
  Eye,
  EyeOff,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

interface StaffUser extends User {
  id: string;
}

function StaffContent() {
  const [activeMenuItem, setActiveMenuItem] = useState("staff");
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [alert, setAlert] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffUser | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    displayName: "",
    role: "staff" as UserRole,
  });

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const fetchStaff = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/staff");
      const data = await response.json();
      if (data.success) {
        setStaff(data.data);
      }
    } catch (error) {
      console.error("Error fetching staff:", error);
      toast.error("Failed to load staff");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStaff();
  }, [fetchStaff]);

  const showAlert = (type: "success" | "error", message: string) => {
    setAlert({ type, message });
    setTimeout(() => setAlert(null), 3000);
  };

  const handleAddStaff = async () => {
    if (!formData.email || !formData.password || !formData.displayName) {
      toast.error("Please fill in all required fields");
      return;
    }

    if (formData.password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }

    try {
      setLoading(true);
      const response = await fetch("/api/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await response.json();
      if (data.success) {
        setStaff([data.data, ...staff]);
        setShowAddModal(false);
        setFormData({
          email: "",
          password: "",
          displayName: "",
          role: "staff",
        });
        toast.success("Staff account created successfully");
      } else {
        toast.error(data.error || "Failed to create staff account");
      }
    } catch (error) {
      console.error("Error adding staff:", error);
      toast.error("Failed to create staff account");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStaff = async () => {
    if (!editingStaff) return;

    try {
      setLoading(true);
      const response = await fetch(`/api/staff?id=${editingStaff.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: editingStaff.displayName,
          role: editingStaff.role,
          isActive: editingStaff.isActive,
        }),
      });

      const data = await response.json();
      if (data.success) {
        setStaff(
          staff.map((s) => (s.id === editingStaff.id ? editingStaff : s)),
        );
        setShowEditModal(false);
        setEditingStaff(null);
        toast.success("Staff updated successfully");
      } else {
        toast.error("Failed to update staff");
      }
    } catch (error) {
      console.error("Error updating staff:", error);
      toast.error("Failed to update staff");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async (staffMember: StaffUser) => {
    try {
      const response = await fetch(`/api/staff?id=${staffMember.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isActive: !staffMember.isActive,
        }),
      });

      const data = await response.json();
      if (data.success) {
        setStaff(
          staff.map((s) =>
            s.id === staffMember.id
              ? { ...s, isActive: !staffMember.isActive }
              : s,
          ),
        );
        showAlert(
          "success",
          `Staff ${!staffMember.isActive ? "activated" : "deactivated"}`,
        );
      }
    } catch (error) {
      console.error("Error toggling staff status:", error);
      toast.error("Failed to update staff status");
    }
  };

  const handleDeleteStaff = async (id: string) => {
    if (!confirm("Are you sure you want to delete this staff account?")) return;

    try {
      const response = await fetch(`/api/staff?id=${id}`, {
        method: "DELETE",
      });

      const data = await response.json();
      if (data.success) {
        setStaff(staff.filter((s) => s.id !== id));
        toast.success("Staff deleted successfully");
      } else {
        toast.error("Failed to delete staff");
      }
    } catch (error) {
      console.error("Error deleting staff:", error);
      toast.error("Failed to delete staff");
    }
  };

  const getRoleInfo = (role: UserRole) => {
    switch (role) {
      case "owner":
        return {
          label: "Admin (Owner)",
          color: "bg-purple-100 text-purple-800",
          description: "Full system access",
        };
      case "manager":
        return {
          label: "Manager",
          color: "bg-blue-100 text-blue-800",
          description: "Manage products & inventory",
        };
      case "staff":
        return {
          label: "Staff",
          color: "bg-green-100 text-green-800",
          description: "Process sales & orders",
        };
      default:
        return {
          label: role,
          color: "bg-gray-100 text-gray-800",
          description: "",
        };
    }
  };

  // Pagination calculations
  const totalPages = Math.ceil(staff.length / rowsPerPage);
  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = startIndex + rowsPerPage;
  const currentStaff = staff.slice(startIndex, endIndex);

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Desktop Sidebar */}
      <div className="hidden lg:block">
        <Sidebar
          activeItem={activeMenuItem}
          onItemClick={(item) => setActiveMenuItem(item.id)}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
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
        className="lg:hidden"
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        <TopNavBar onMenuToggle={() => setIsMobileSidebarOpen(true)} />

        <main className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="max-w-screen-2xl mx-auto">
            {/* Alert */}
            {alert && (
              <div className="mb-4">
                <Alert type={alert.type} message={alert.message} />
              </div>
            )}

            {/* Header */}
            <div className="flex justify-between items-center mb-6">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  Staff Management
                </h1>
                <p className="text-gray-600 mt-1">
                  Manage staff accounts and permissions
                </p>
              </div>
              <Button
                onClick={() => setShowAddModal(true)}
                className="flex items-center gap-2"
              >
                <UserPlus className="h-4 w-4" />
                Add Staff
              </Button>
            </div>

            {/* Staff List */}
            <div className="bg-white rounded-lg shadow">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50 border-b">
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                        Name
                      </th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                        Email
                      </th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                        Role
                      </th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                        Created
                      </th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {staff.length === 0 ? (
                      <tr>
                        <td
                          colSpan={6}
                          className="px-6 py-8 text-center text-gray-500"
                        >
                          No staff accounts yet
                        </td>
                      </tr>
                    ) : (
                      currentStaff.map((member, idx) => {
                        const roleInfo = getRoleInfo(member.role);
                        const rowKey =
                          member.id ||
                          member.email ||
                          `staff-${startIndex + idx}`;
                        return (
                          <tr
                            key={rowKey}
                            className="border-b hover:bg-gray-50"
                          >
                            <td className="px-6 py-4 text-sm font-medium text-gray-900">
                              {member.displayName || "-"}
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-600">
                              {member.email}
                            </td>
                            <td className="px-6 py-4 text-sm">
                              <span
                                className={`px-2 py-1 rounded text-xs font-medium ${roleInfo.color}`}
                              >
                                {roleInfo.label}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-sm">
                              {member.isActive !== false ? (
                                <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs font-medium">
                                  Active
                                </span>
                              ) : (
                                <span className="px-2 py-1 bg-red-100 text-red-800 rounded text-xs font-medium">
                                  Inactive
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-600">
                              {new Date(member.createdAt).toLocaleDateString()}
                            </td>
                            <td className="px-6 py-4 text-sm">
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => {
                                    setEditingStaff(member);
                                    setShowEditModal(true);
                                  }}
                                  className="text-blue-600 hover:text-blue-800"
                                  title="Edit"
                                >
                                  <Edit2 className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => handleToggleActive(member)}
                                  className={
                                    member.isActive !== false
                                      ? "text-orange-600 hover:text-orange-800"
                                      : "text-green-600 hover:text-green-800"
                                  }
                                  title={
                                    member.isActive !== false
                                      ? "Deactivate"
                                      : "Activate"
                                  }
                                >
                                  {member.isActive !== false ? (
                                    <UserX className="h-4 w-4" />
                                  ) : (
                                    <UserCheck className="h-4 w-4" />
                                  )}
                                </button>
                                <button
                                  onClick={() => handleDeleteStaff(member.id)}
                                  className="text-red-600 hover:text-red-800"
                                  title="Delete"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {staff.length > 0 && (
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
                        {Math.min(endIndex, staff.length)} of {staff.length}{" "}
                        staff members
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
                              Math.min(totalPages, currentPage + 1),
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
            </div>

            {/* Role Permissions Info */}
            <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                <h3 className="font-semibold text-purple-900 mb-2">
                  Admin (Owner)
                </h3>
                <ul className="text-sm text-purple-800 space-y-1">
                  <li key="owner-1">✓ Full system access</li>
                  <li key="owner-2">✓ Manage staff accounts & roles</li>
                  <li key="owner-3">✓ Manage shops/branches & shop reports</li>
                  <li key="owner-4">
                    ✓ Access all sales, inventory, barcode & expenses
                  </li>
                </ul>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-semibold text-blue-900 mb-2">Manager</h3>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li key="manager-1">
                    ✓ Access dashboard, sales, inventory, expenses & barcode
                  </li>
                  <li key="manager-2">✓ Manage stocks & customers</li>
                  <li key="manager-3">
                    ✓ View sales reports & process payments
                  </li>
                  <li key="manager-4">✗ Cannot manage staff accounts</li>
                  <li key="manager-5">
                    ✗ Cannot access shops & branches management
                  </li>
                </ul>
              </div>

              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <h3 className="font-semibold text-green-900 mb-2">Staff</h3>
                <ul className="text-sm text-green-800 space-y-1">
                  <li key="staff-1">
                    ✓ Access home, transactions & payments
                  </li>
                  <li key="staff-2">✓ Access customer list</li>
                  <li key="staff-3">✓ Access own settings page</li>
                  <li key="staff-4">
                    ✗ Cannot access dashboard,reports,expenses & barcode
                  </li>
                  <li key="staff-5">
                    ✗ Cannot manage stocks, staff or branches
                  </li>
                </ul>
              </div>
            </div>

            {/* Add Staff Modal */}
            {showAddModal && (
              <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-50">
                <div className="bg-white rounded-lg p-6 w-full max-w-md">
                  <h3 className="text-lg font-semibold mb-4 text-gray-900">
                    Add New Staff
                  </h3>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Full Name *
                      </label>
                      <Input
                        value={formData.displayName}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            displayName: e.target.value,
                          })
                        }
                        placeholder="Enter full name"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Email *
                      </label>
                      <Input
                        type="email"
                        value={formData.email}
                        onChange={(e) =>
                          setFormData({ ...formData, email: e.target.value })
                        }
                        placeholder="Enter email"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Password *
                      </label>
                      <div className="relative">
                        <Input
                          type={showPassword ? "text" : "password"}
                          value={formData.password}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              password: e.target.value,
                            })
                          }
                          placeholder="Enter password (min 6 characters)"
                        />
                        <button
                          type="button"
                          className="absolute inset-y-0 right-0 pr-3 flex items-center"
                          onClick={() => setShowPassword(!showPassword)}
                        >
                          {showPassword ? (
                            <EyeOff className="h-5 w-5 text-gray-400" />
                          ) : (
                            <Eye className="h-5 w-5 text-gray-400" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Role *
                      </label>
                      <select
                        title="role"
                        value={formData.role}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            role: e.target.value as UserRole,
                          })
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                      >
                        <option key="staff" value="staff">
                          Staff
                        </option>
                        <option key="manager" value="manager">
                          Manager
                        </option>
                      </select>
                    </div>
                  </div>

                  <div className="flex gap-2 mt-6">
                    <Button
                      key="create-btn"
                      onClick={handleAddStaff}
                      disabled={loading}
                      className="flex-1"
                    >
                      {loading ? "Creating..." : "Create Account"}
                    </Button>
                    <Button
                      key="cancel-btn"
                      onClick={() => {
                        setShowAddModal(false);
                        setFormData({
                          email: "",
                          password: "",
                          displayName: "",
                          role: "staff",
                        });
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

            {/* Edit Staff Modal */}
            {showEditModal && editingStaff && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div className="bg-white rounded-lg p-6 w-full max-w-md">
                  <h3 className="text-lg font-semibold mb-4 text-gray-900">
                    Edit Staff
                  </h3>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Full Name
                      </label>
                      <Input
                        value={editingStaff.displayName || ""}
                        onChange={(e) =>
                          setEditingStaff({
                            ...editingStaff,
                            displayName: e.target.value,
                          })
                        }
                        placeholder="Enter full name"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Email
                      </label>
                      <Input
                        type="email"
                        value={editingStaff.email}
                        disabled
                        className="bg-gray-100"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Email cannot be changed
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Role
                      </label>
                      <select
                        title="role"
                        value={editingStaff.role}
                        onChange={(e) =>
                          setEditingStaff({
                            ...editingStaff,
                            role: e.target.value as UserRole,
                          })
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                      >
                        <option key="staff-edit" value="staff">
                          Staff
                        </option>
                        <option key="manager-edit" value="manager">
                          Manager
                        </option>
                      </select>
                    </div>
                  </div>

                  <div className="flex gap-2 mt-6">
                    <Button
                      key="update-btn"
                      onClick={handleUpdateStaff}
                      disabled={loading}
                      className="flex-1"
                    >
                      {loading ? "Updating..." : "Update"}
                    </Button>
                    <Button
                      key="cancel-edit-btn"
                      onClick={() => {
                        setShowEditModal(false);
                        setEditingStaff(null);
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
        </main>
      </div>
    </div>
  );
}

export default function StaffPage() {
  return (
    <ProtectedRoute>
      <StaffContent />
    </ProtectedRoute>
  );
}
