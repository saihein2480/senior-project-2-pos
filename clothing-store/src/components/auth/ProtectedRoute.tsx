"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { UserRole } from "@/types/auth";

interface ProtectedRouteProps {
  children: React.ReactNode;
  // allow either single role or array of roles
  requiredRole?: UserRole | UserRole[];
  redirectTo?: string;
}

export function ProtectedRoute({
  children,
  requiredRole,
  redirectTo,
}: ProtectedRouteProps) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    console.log(
      "ProtectedRoute useEffect - loading:",
      loading,
      "user:",
      user,
      "requiredRole:",
      requiredRole,
    );
    if (!loading) {
      if (!user) {
        console.log("ProtectedRoute: No user, redirecting to home");
        // User is not authenticated, redirect to home page
        router.push(redirectTo || "/");
        return;
      }

      if (requiredRole) {
        const allowed = Array.isArray(requiredRole)
          ? requiredRole.includes(user.role)
          : user.role === requiredRole;
        if (!allowed) {
          console.log(
            "ProtectedRoute: Role mismatch, user role:",
            user.role,
            "required:",
            requiredRole,
          );
          // User doesn't have the required role
          if (user.role === "customer") {
            router.push("/customer/home");
          } else if (user.role === "owner") {
            router.push("/owner/dashboard");
          } else {
            router.push("/");
          }
          return;
        }
      }
      console.log("ProtectedRoute: Access granted");
    }
  }, [user, loading, requiredRole, redirectTo, router]);

  // Show loading spinner while checking authentication
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Don't render children if user is not authenticated or doesn't have required role
  const hasAccess = (() => {
    if (!user) return false;
    if (!requiredRole) return true;
    return Array.isArray(requiredRole)
      ? requiredRole.includes(user.role)
      : user.role === requiredRole;
  })();

  if (!hasAccess) return null;

  return <>{children}</>;
}
