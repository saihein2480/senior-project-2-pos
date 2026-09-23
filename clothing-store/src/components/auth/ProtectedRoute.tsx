"use client";

import React, { useEffect, useMemo } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Eye, ShieldAlert } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useViewModeOptional } from "@/contexts/ViewModeContext";
import { UserRole } from "@/types/auth";
import {
  findRoutePermission,
  getAccessibleRoutes,
} from "@/config/rolePermissions";

interface ProtectedRouteProps {
  children: React.ReactNode;
  /**
   * Optional explicit override. When omitted, the required roles are looked up
   * from `routePermissions` in src/config/rolePermissions.ts using the current
   * pathname, so a page cannot accidentally ship with no role check.
   */
  requiredRole?: UserRole | UserRole[];
  redirectTo?: string;
}

const ROLE_LABELS: Record<UserRole, string> = {
  owner: "Owner",
  manager: "Manager",
  staff: "Staff",
  customer: "Customer",
};

/** Where to send a role that has no business being on this page. */
function landingPageFor(role: UserRole): string {
  if (role === "customer") return "/customer/home";
  const accessible = getAccessibleRoutes(role);
  const home = accessible.find((r) => r.path === "/owner/home");
  return home?.path ?? accessible[0]?.path ?? "/";
}

export function ProtectedRoute({
  children,
  requiredRole,
  redirectTo,
}: ProtectedRouteProps) {
  const { user, loading } = useAuth();
  const viewMode = useViewModeOptional();
  const router = useRouter();
  const pathname = usePathname();

  // Access follows the effective role, so an owner previewing Staff is held to
  // Staff's routes. Their real role is untouched and one click restores it.
  const actualRole = user?.role ?? null;
  const effectiveRole = viewMode?.effectiveRole ?? actualRole;
  const isPreviewing = viewMode?.isViewingAsOtherRole ?? false;

  // Resolve the roles allowed here: explicit prop first, otherwise the route table.
  const routeRule = useMemo(
    () => findRoutePermission(pathname ?? ""),
    [pathname],
  );

  const allowedRoles: UserRole[] | null = useMemo(() => {
    if (requiredRole) {
      return Array.isArray(requiredRole) ? requiredRole : [requiredRole];
    }
    return routeRule ? routeRule.allowedRoles : null;
  }, [requiredRole, routeRule]);

  const isUnregisteredOwnerRoute =
    !requiredRole && !routeRule && (pathname ?? "").startsWith("/owner");

  const hasAccess = (() => {
    if (!user || !effectiveRole) return false;
    if (isUnregisteredOwnerRoute) return false; // fail closed
    if (!allowedRoles) return true;
    return allowedRoles.includes(effectiveRole);
  })();

  useEffect(() => {
    if (loading) return;

    if (!user) {
      router.push(redirectTo || "/");
      return;
    }

    if (isUnregisteredOwnerRoute) {
      console.warn(
        `[RBAC] "${pathname}" is not registered in routePermissions - denying access. ` +
          `Add it to src/config/rolePermissions.ts.`,
      );
      return;
    }

    if (!hasAccess) {
      console.warn(
        `[RBAC] Access denied to "${pathname}" for role "${effectiveRole}"${
          isPreviewing ? ` (owner previewing as ${effectiveRole})` : ""
        }. Allowed: ${allowedRoles?.join(", ") ?? "none"}`,
      );
      // Customers never belong in the POS at all - bounce them out immediately.
      if (actualRole === "customer") router.push("/customer/home");
    }
  }, [
    user,
    loading,
    hasAccess,
    isUnregisteredOwnerRoute,
    pathname,
    allowedRoles,
    redirectTo,
    router,
    actualRole,
    effectiveRole,
    isPreviewing,
  ]);

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

  // Not signed in - the effect above is redirecting to the login page.
  if (!user) return null;

  if (!hasAccess) {
    /* ----------------------------------------------------------------
     * Case 1: an owner is previewing a lower role and hit a page that
     * role cannot open. This is the preview working as intended, so
     * explain it and offer the way back instead of a dead end.
     * ---------------------------------------------------------------- */
    if (isPreviewing && effectiveRole) {
      return (
        <div
          role="status"
          aria-live="polite"
          className="min-h-screen flex items-center justify-center bg-gray-50 px-4"
        >
          <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-amber-200 p-8 text-center">
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-amber-50">
              <Eye className="h-7 w-7 text-amber-600" aria-hidden="true" />
            </div>

            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
              Previewing as {ROLE_LABELS[effectiveRole]}
            </span>

            <h1 className="mt-4 text-2xl font-semibold text-gray-900">
              Hidden from {ROLE_LABELS[effectiveRole]}
            </h1>

            <p className="mt-3 text-sm text-gray-600">
              {routeRule?.description
                ? `"${routeRule.description}" is not available to a ${ROLE_LABELS[effectiveRole]}.`
                : `This page is not available to a ${ROLE_LABELS[effectiveRole]}.`}{" "}
              That is what a {ROLE_LABELS[effectiveRole]} would see here.
            </p>

            <button
              type="button"
              onClick={() => viewMode?.resetToActualRole()}
              className="mt-6 w-full px-6 py-2.5 bg-gradient-to-r from-rose-500 to-pink-500 text-white font-medium rounded-xl hover:from-rose-600 hover:to-pink-600 focus:outline-none focus:ring-2 focus:ring-pink-400 focus:ring-offset-2 transition-colors"
            >
              Exit preview and return to Owner view
            </button>

            <button
              type="button"
              onClick={() => router.push(landingPageFor(effectiveRole))}
              className="mt-3 w-full px-6 py-2.5 border border-gray-300 text-gray-700 font-medium rounded-xl hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-2 transition-colors"
            >
              Keep previewing, go to their home page
            </button>
          </div>
        </div>
      );
    }

    /* ----------------------------------------------------------------
     * Case 2: a real manager or staff member hit a page their role
     * cannot open.
     * ---------------------------------------------------------------- */
    const role = effectiveRole ?? "customer";
    return (
      <div
        role="alert"
        aria-live="assertive"
        className="min-h-screen flex items-center justify-center bg-gray-50 px-4"
      >
        <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-rose-50">
            <ShieldAlert className="h-7 w-7 text-rose-600" aria-hidden="true" />
          </div>

          <h1 className="text-2xl font-semibold text-gray-900">
            Access restricted
          </h1>

          <p className="mt-3 text-sm text-gray-600">
            {routeRule?.description
              ? `"${routeRule.description}" is not available to your role.`
              : "This page is not available to your role."}
          </p>

          <dl className="mt-5 rounded-xl bg-gray-50 border border-gray-200 px-4 py-3 text-sm">
            <div className="flex items-center justify-between py-1">
              <dt className="text-gray-500">Signed in as</dt>
              <dd className="font-medium text-gray-900">{ROLE_LABELS[role]}</dd>
            </div>
            {allowedRoles && allowedRoles.length > 0 && (
              <div className="flex items-center justify-between py-1">
                <dt className="text-gray-500">Requires</dt>
                <dd className="font-medium text-gray-900">
                  {allowedRoles.map((r) => ROLE_LABELS[r]).join(" or ")}
                </dd>
              </div>
            )}
          </dl>

          <button
            type="button"
            onClick={() => router.push(landingPageFor(role))}
            className="mt-6 w-full px-6 py-2.5 bg-gradient-to-r from-rose-500 to-pink-500 text-white font-medium rounded-xl hover:from-rose-600 hover:to-pink-600 focus:outline-none focus:ring-2 focus:ring-pink-400 focus:ring-offset-2 transition-colors"
          >
            Back to my home page
          </button>

          <p className="mt-4 text-xs text-gray-500">
            Need this access? Ask the shop owner to update your role.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
