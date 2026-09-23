"use client";

import { toast } from "react-hot-toast";
import { useState, useEffect, useCallback } from "react";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { usePermissions } from "@/hooks/usePermissions";
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
  const permissions = usePermissions();
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
  const [currentPageManager, setCurrentPageManager] = useState(1);
  const [rowsPerPageManager, setRowsPerPageManager] = useState(10);

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
    // Doc: "Add New Staff" / "Add New Manager" - Owner only.
    if (!permissions.canAddStaff) {
      toast.error("Only the owner can create staff accounts.");
      return;
    }

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
    // Doc: "Delete/Remove Staff" - Owner only.
    if (!permissions.canDeleteStaff) {
      toast.error("Only the owner can remove staff accounts.");
      return;
    }

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
          color: "bg-fuchsia-100 text-fuchsia-800",
          description: "Manage products & inventory",
        };
      case "staff":
        return {
          label: "Staff",
          color: "bg-pink-100 text-pink-800",
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
            <div className="mb-8">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h1 className="text-2xl sm:text-3xl font-semibold text-gray-900 tracking-tight">
                    Staff Management
                  </h1>
                  <p className="text-sm text-gray-600 mt-1">
                    Manage staff accounts and permissions
                  </p>
                </div>
                <Button
                  onClick={() => setShowAddModal(true)}
                  className="flex items-center gap-2 bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 text-white font-medium shadow-md"
                >
                  <UserPlus className="h-4 w-4" />
                  Add Staff
                </Button>
              </div>
            </div>

            {/* Staff Grid - Compact Card Design */}
            <div className="space-y-8">
              {/* Managers Section */}
              {staff.filter(s => s.role === "manager").length > 0 && (
                <div>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-fuchsia-500 to-fuchsia-600 flex items-center justify-center">
                      <span className="text-white font-bold text-sm">M</span>
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-gray-900">Managers</h2>
                      <p className="text-sm text-gray-600">{staff.filter(s => s.role === "manager").length} manager{staff.filter(s => s.role === "manager").length !== 1 ? 's' : ''}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {staff.filter(s => s.role === "manager").map((member, idx) => {
                      const roleInfo = getRoleInfo(member.role);
                      const rowKey = member.id || member.email || `manager-${idx}`;
                      const isActive = member.isActive !== false;
                      const roleColor = "from-fuchsia-600 to-fuchsia-700";
                      const roleBadgeColor = "bg-fuchsia-100 text-fuchsia-700";

                      return (
                        <div
                          key={rowKey}
                          className={`bg-white rounded-xl shadow-sm border transition-all duration-200 hover:shadow-md hover:border-gray-300 overflow-hidden ${
                            isActive ? "border-gray-200" : "border-red-200"
                          }`}
                        >
                          {/* Compact Header with Avatar */}
                          <div className={`bg-gradient-to-r ${roleColor} p-3 flex items-center gap-3`}>
                            <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                              {member.displayName?.charAt(0).toUpperCase() || member.email.charAt(0)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <h3 className="text-sm font-bold text-white truncate">
                                {member.displayName || "N/A"}
                              </h3>
                              <p className="text-xs text-white/80 truncate">
                                {member.email}
                              </p>
                            </div>
                            <span className={`px-2 py-1 rounded-full text-xs font-bold whitespace-nowrap flex-shrink-0 ${
                              isActive ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                            }`}>
                              {isActive ? "Active" : "Off"}
                            </span>
                          </div>

                          {/* Content Section */}
                          <div className="p-3 space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-medium text-gray-600 uppercase tracking-wide">Role</span>
                              <span className={`px-2 py-0.5 rounded text-xs font-bold ${roleBadgeColor}`}>
                                {roleInfo.label}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-medium text-gray-600 uppercase tracking-wide">Joined</span>
                              <span className="text-xs font-medium text-gray-900">
                                {new Date(member.createdAt).toLocaleDateString("en-US", {
                                  month: "short",
                                  day: "numeric",
                                  year: "2-digit",
                                })}
                              </span>
                            </div>
                          </div>

                          {/* Action Buttons */}
                          <div className="grid grid-cols-3 gap-1 p-2 border-t border-gray-100 bg-gray-50">
                            <button
                              onClick={() => {
                                setEditingStaff(member);
                                setShowEditModal(true);
                              }}
                              className="px-2 py-1.5 rounded font-medium text-xs transition-all flex items-center justify-center gap-1 border bg-fuchsia-50 text-fuchsia-600 border-fuchsia-200 hover:bg-fuchsia-100"
                              title="Edit Manager"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                              <span className="hidden sm:inline">Edit</span>
                            </button>
                            <button
                              onClick={() => handleToggleActive(member)}
                              className={`px-2 py-1.5 rounded font-medium text-xs transition-all flex items-center justify-center gap-1 border ${
                                isActive
                                  ? "bg-orange-50 text-orange-600 border-orange-200 hover:bg-orange-100"
                                  : "bg-green-50 text-green-600 border-green-200 hover:bg-green-100"
                              }`}
                              title={isActive ? "Deactivate" : "Activate"}
                            >
                              {isActive ? <UserX className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />}
                              <span className="hidden sm:inline text-xs">{isActive ? "Off" : "On"}</span>
                            </button>
                            <button
                              onClick={() => handleDeleteStaff(member.id)}
                              className="px-2 py-1.5 bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 rounded font-medium text-xs transition-all flex items-center justify-center gap-1"
                              title="Delete Manager"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              <span className="hidden sm:inline">Del</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Staff Section */}
              {staff.filter(s => s.role === "staff").length > 0 && (
                <div>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-rose-500 to-pink-500 flex items-center justify-center">
                      <span className="text-white font-bold text-sm">S</span>
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-gray-900">Staff</h2>
                      <p className="text-sm text-gray-600">{staff.filter(s => s.role === "staff").length} staff member{staff.filter(s => s.role === "staff").length !== 1 ? 's' : ''}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {staff.filter(s => s.role === "staff").map((member, idx) => {
                      const roleInfo = getRoleInfo(member.role);
                      const rowKey = member.id || member.email || `staff-${idx}`;
                      const isActive = member.isActive !== false;
                      const roleColor = "from-rose-500 to-pink-500";
                      const roleBadgeColor = "bg-pink-100 text-pink-700";

                      return (
                        <div
                          key={rowKey}
                          className={`bg-white rounded-xl shadow-sm border transition-all duration-200 hover:shadow-md hover:border-gray-300 overflow-hidden ${
                            isActive ? "border-gray-200" : "border-red-200"
                          }`}
                        >
                          {/* Compact Header with Avatar */}
                          <div className={`bg-gradient-to-r ${roleColor} p-3 flex items-center gap-3`}>
                            <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                              {member.displayName?.charAt(0).toUpperCase() || member.email.charAt(0)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <h3 className="text-sm font-bold text-white truncate">
                                {member.displayName || "N/A"}
                              </h3>
                              <p className="text-xs text-white/80 truncate">
                                {member.email}
                              </p>
                            </div>
                            <span className={`px-2 py-1 rounded-full text-xs font-bold whitespace-nowrap flex-shrink-0 ${
                              isActive ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                            }`}>
                              {isActive ? "Active" : "Off"}
                            </span>
                          </div>

                          {/* Content Section */}
                          <div className="p-3 space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-medium text-gray-600 uppercase tracking-wide">Role</span>
                              <span className={`px-2 py-0.5 rounded text-xs font-bold ${roleBadgeColor}`}>
                                {roleInfo.label}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-medium text-gray-600 uppercase tracking-wide">Joined</span>
                              <span className="text-xs font-medium text-gray-900">
                                {new Date(member.createdAt).toLocaleDateString("en-US", {
                                  month: "short",
                                  day: "numeric",
                                  year: "2-digit",
                                })}
                              </span>
                            </div>
                          </div>

                          {/* Action Buttons */}
                          <div className="grid grid-cols-3 gap-1 p-2 border-t border-gray-100 bg-gray-50">
                            <button
                              onClick={() => {
                                setEditingStaff(member);
                                setShowEditModal(true);
                              }}
                              className="px-2 py-1.5 rounded font-medium text-xs transition-all flex items-center justify-center gap-1 border bg-pink-50 text-pink-600 border-pink-200 hover:bg-pink-100"
                              title="Edit Staff"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                              <span className="hidden sm:inline">Edit</span>
                            </button>
                            <button
                              onClick={() => handleToggleActive(member)}
                              className={`px-2 py-1.5 rounded font-medium text-xs transition-all flex items-center justify-center gap-1 border ${
                                isActive
                                  ? "bg-orange-50 text-orange-600 border-orange-200 hover:bg-orange-100"
                                  : "bg-green-50 text-green-600 border-green-200 hover:bg-green-100"
                              }`}
                              title={isActive ? "Deactivate" : "Activate"}
                            >
                              {isActive ? <UserX className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />}
                              <span className="hidden sm:inline text-xs">{isActive ? "Off" : "On"}</span>
                            </button>
                            <button
                              onClick={() => handleDeleteStaff(member.id)}
                              className="px-2 py-1.5 bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 rounded font-medium text-xs transition-all flex items-center justify-center gap-1"
                              title="Delete Staff"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              <span className="hidden sm:inline">Del</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Empty State */}
              {staff.length === 0 && (
                <div className="col-span-full">
                  <div className="flex flex-col items-center justify-center py-16 bg-white rounded-xl border border-gray-200 shadow-sm">
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-3">
                      <UserPlus className="h-8 w-8 text-gray-400" />
                    </div>
                    <h3 className="text-base font-semibold text-gray-900 mb-1">
                      No staff yet
                    </h3>
                    <p className="text-sm text-gray-500 mb-4">
                      Add your first staff member
                    </p>
                    <Button
                      onClick={() => setShowAddModal(true)}
                      className="flex items-center gap-2 text-sm"
                    >
                      <UserPlus className="h-4 w-4" />
                      Add Staff
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Pagination - Hidden for now since we're showing all */}
            {/* Pagination will be added if pagination is needed per section */}

            {/* Role Permissions Info */}
            {/* <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
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

              <div className="bg-cyan-50 border border-blue-200 rounded-lg p-4">
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
            </div> */}

            {/* Add Staff Modal */}
            {showAddModal && (
              <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
                  {/* Modal Header - Default to pink since new staff are usually added as staff */}
                  <div className="bg-gradient-to-r from-rose-500 to-pink-500 px-6 py-4 rounded-t-2xl">
                    <h3 className="text-lg font-bold text-white">
                      Add New Staff Member
                    </h3>
                    <p className="text-pink-100 text-sm mt-1">
                      Create a new staff or manager account
                    </p>
                  </div>

                  {/* Modal Body */}
                  <div className="p-6">
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                          Full Name <span className="text-red-500">*</span>
                        </label>
                        <Input
                          value={formData.displayName}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              displayName: e.target.value,
                            })
                          }
                          placeholder="e.g., John Doe"
                          className="rounded-lg"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                          Email <span className="text-red-500">*</span>
                        </label>
                        <Input
                          type="email"
                          value={formData.email}
                          onChange={(e) =>
                            setFormData({ ...formData, email: e.target.value })
                          }
                          placeholder="e.g., john@example.com"
                          className="rounded-lg"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                          Password <span className="text-red-500">*</span>
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
                            placeholder="Minimum 6 characters"
                            className="rounded-lg pr-10"
                          />
                          <button
                            type="button"
                            className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                            onClick={() => setShowPassword(!showPassword)}
                          >
                            {showPassword ? (
                              <EyeOff className="h-5 w-5" />
                            ) : (
                              <Eye className="h-5 w-5" />
                            )}
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                          Role <span className="text-red-500">*</span>
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
                          className="w-full px-3 py-2.5 border border-pink-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent text-gray-900 font-medium"
                        >
                          <option value="staff">Staff (Sales & Orders)</option>
                          <option value="manager">Manager (Inventory & Reports)</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Modal Footer */}
                  <div className="border-t border-gray-200 px-6 py-4 flex gap-3">
                    <Button
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
                    <Button
                      onClick={handleAddStaff}
                      disabled={loading}
                      className="flex-1 bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 text-white"
                    >
                      {loading ? "Creating..." : "Create Account"}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Edit Staff Modal */}
            {showEditModal && editingStaff && (
              <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
                  {/* Modal Header - Color based on role */}
                  <div className={`${
                    editingStaff.role === "manager"
                      ? "bg-gradient-to-r from-fuchsia-600 to-fuchsia-700"
                      : "bg-gradient-to-r from-rose-500 to-pink-500"
                  } px-6 py-4 rounded-t-2xl`}>
                    <h3 className="text-lg font-bold text-white">
                      Edit Staff Member
                    </h3>
                    <p className={`${
                      editingStaff.role === "manager"
                        ? "text-fuchsia-100"
                        : "text-pink-100"
                    } text-sm mt-1`}>
                      Update {editingStaff.displayName} details
                    </p>
                  </div>

                  {/* Modal Body */}
                  <div className="p-6">
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
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
                          className="rounded-lg"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                          Email
                        </label>
                        <Input
                          type="email"
                          value={editingStaff.email}
                          disabled
                          className="bg-gray-100 rounded-lg cursor-not-allowed"
                        />
                        <p className="text-xs text-gray-500 mt-1.5">
                          📌 Email cannot be changed
                        </p>
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
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
                          className={`w-full px-3 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:border-transparent text-gray-900 font-medium ${
                            editingStaff.role === "manager"
                              ? "focus:ring-fuchsia-500 border-fuchsia-300"
                              : "focus:ring-pink-400 border-pink-300"
                          }`}
                        >
                          <option value="staff">Staff (Sales & Orders)</option>
                          <option value="manager">Manager (Inventory & Reports)</option>
                        </select>
                      </div>

                      {/* Status Toggle */}
                      <div className={`mt-4 p-4 rounded-lg border ${
                        editingStaff.role === "manager"
                          ? "bg-fuchsia-50 border-fuchsia-200"
                          : "bg-pink-50 border-pink-200"
                      }`}>
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-gray-900">Account Status</p>
                            <p className="text-xs text-gray-600 mt-0.5">
                              {editingStaff.isActive !== false ? "Currently Active" : "Currently Inactive"}
                            </p>
                          </div>
                          <button
                            onClick={() =>
                              setEditingStaff({
                                ...editingStaff,
                                isActive: !(editingStaff.isActive !== false),
                              })
                            }
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                              editingStaff.isActive !== false
                                ? editingStaff.role === "manager"
                                  ? "bg-fuchsia-500"
                                  : "bg-pink-500"
                                : "bg-gray-300"
                            }`}
                          >
                            <span
                              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                editingStaff.isActive !== false
                                  ? "translate-x-6"
                                  : "translate-x-1"
                              }`}
                            />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Modal Footer */}
                  <div className="border-t border-gray-200 px-6 py-4 flex gap-3">
                    <Button
                      onClick={() => {
                        setShowEditModal(false);
                        setEditingStaff(null);
                      }}
                      variant="outline"
                      className="flex-1"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleUpdateStaff}
                      disabled={loading}
                      className={`flex-1 text-white ${
                        editingStaff.role === "manager"
                          ? "bg-gradient-to-r from-fuchsia-600 to-fuchsia-700 hover:from-fuchsia-700 hover:to-fuchsia-800"
                          : "bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600"
                      }`}
                    >
                      {loading ? "Updating..." : "Update"}
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
    <ProtectedRoute requiredRole="owner">
      <StaffContent />
    </ProtectedRoute>
  );
}
