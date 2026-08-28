"use client";

import { useAuth } from "@/contexts/AuthContext";
import { UserRole } from "@/types/auth";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

interface RoleBasedRouteProps {
  children: React.ReactNode;
  allowedRoles: UserRole[];
  redirectTo?: string;
}

/**
 * RoleBasedRoute - Component to protect routes based on user roles
 * 
 * Usage:
 * <RoleBasedRoute allowedRoles={["owner", "manager"]}>
 *   <YourProtectedComponent />
 * </RoleBasedRoute>
 */
export function RoleBasedRoute({
  children,
  allowedRoles,
  redirectTo = "/owner/home",
}: RoleBasedRouteProps) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      // Check if user's role is in the allowed roles
      if (!allowedRoles.includes(user.role)) {
        console.warn(
          `Access denied: User role "${user.role}" not in allowed roles [${allowedRoles.join(", ")}]`
        );
        router.push(redirectTo);
      }
    }
  }, [user, loading, allowedRoles, redirectTo, router]);

  // Show loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pink-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Verifying permissions...</p>
        </div>
      </div>
    );
  }

  // User not logged in - handled by ProtectedRoute
  if (!user) {
    return null;
  }

  // Check if user has permission
  if (!allowedRoles.includes(user.role)) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center max-w-md mx-auto p-8">
          <div className="mb-4 text-red-500">
            <svg
              className="w-16 h-16 mx-auto"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Access Denied
          </h2>
          <p className="text-gray-600 mb-6">
            You don't have permission to access this page. Your role: <strong>{user.role}</strong>
          </p>
          <p className="text-sm text-gray-500 mb-4">
            Required roles: {allowedRoles.join(", ")}
          </p>
          <button
            onClick={() => router.push(redirectTo)}
            className="px-6 py-2 bg-gradient-to-r from-rose-500 to-pink-500 text-white rounded-lg hover:from-rose-600 hover:to-pink-600 transition-colors"
          >
            Go to Home
          </button>
        </div>
      </div>
    );
  }

  // User has permission - render children
  return <>{children}</>;
}
