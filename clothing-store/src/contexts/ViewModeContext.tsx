"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { UserRole } from "@/types/auth";
import { useAuth } from "@/contexts/AuthContext";
import { POS_ROLES, resolveEffectiveRole } from "@/config/rolePermissions";

/**
 * View Mode - the owner's "View as role" preview
 * ==============================================
 *
 * An owner can step into a Manager or Staff view to see the POS exactly as that
 * role sees it. While previewing, the owner also *operates* as that role: the
 * preview drives `usePermissions()` and `ProtectedRoute`, so hidden buttons are
 * genuinely inactive rather than merely invisible. That makes the preview
 * trustworthy for checking RBAC instead of just a cosmetic filter.
 *
 * Two invariants keep this safe:
 *   1. Only an owner can preview. For every other role `effectiveRole` is
 *      pinned to their real role, so nobody can widen their own access by
 *      poking at this context.
 *   2. Previewing can only ever NARROW permissions. Owner is the top role, so
 *      any previewed role is a subset, and the owner can leave at any time.
 *
 * None of this is a security control - it is a UI fidelity control. The real
 * boundary is Firestore rules plus server-side checks on the API routes.
 */

const STORAGE_KEY = "ownerViewAsRole";

/** A role may only be previewed if it is one of the three POS roles. */
function isPreviewableRole(value: unknown): value is UserRole {
  return typeof value === "string" && (POS_ROLES as string[]).includes(value);
}

interface ViewModeContextType {
  /** The role the owner is previewing. Equals the real role for everyone else. */
  viewAsRole: UserRole;
  /** Switch preview role. Ignored for non-owners. */
  setViewAsRole: (role: UserRole) => void;
  /** True only while an owner is previewing a different role. */
  isViewingAsOtherRole: boolean;
  /** The role on the account. Never affected by the preview. */
  actualRole: UserRole | null;
  /**
   * The role every permission and route decision should use.
   * Owner previewing Staff -> "staff". Everyone else -> their real role.
   */
  effectiveRole: UserRole | null;
  /** Leave preview mode and return to full owner access. */
  resetToActualRole: () => void;
}

const ViewModeContext = createContext<ViewModeContextType | undefined>(
  undefined,
);

export function useViewMode() {
  const context = useContext(ViewModeContext);
  if (context === undefined) {
    throw new Error("useViewMode must be used within a ViewModeProvider");
  }
  return context;
}

/**
 * Same as useViewMode but returns null instead of throwing when there is no
 * provider. Used by usePermissions so a component rendered outside the provider
 * still resolves permissions from the real role rather than crashing.
 */
export function useViewModeOptional(): ViewModeContextType | null {
  return useContext(ViewModeContext) ?? null;
}

interface ViewModeProviderProps {
  children: React.ReactNode;
}

export function ViewModeProvider({ children }: ViewModeProviderProps) {
  const { user } = useAuth();
  const actualRole = user?.role ?? null;
  const isOwner = actualRole === "owner";

  const [viewAsRole, setViewAsRole] = useState<UserRole>(actualRole ?? "staff");

  // Follow the signed-in account. On login/logout/role change, drop any stale
  // preview so a new user never inherits the previous session's view.
  useEffect(() => {
    if (!actualRole) return;

    if (actualRole !== "owner") {
      setViewAsRole(actualRole);
      return;
    }

    // Owners get their last preview back so a refresh does not reset the view.
    let restored: string | null = null;
    try {
      restored = localStorage.getItem(STORAGE_KEY);
    } catch {
      // localStorage unavailable (private mode, SSR) - fall back to owner view.
    }

    setViewAsRole(isPreviewableRole(restored) ? restored : actualRole);
  }, [actualRole]);

  const handleSetViewAsRole = useCallback(
    (role: UserRole) => {
      // Only an owner may preview, and only a real POS role.
      if (!isOwner || !isPreviewableRole(role)) return;

      setViewAsRole(role);
      try {
        localStorage.setItem(STORAGE_KEY, role);
      } catch {
        // Preference is a nicety; ignore storage failures.
      }
    },
    [isOwner],
  );

  const resetToActualRole = useCallback(() => {
    if (!actualRole) return;

    setViewAsRole(actualRole);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }, [actualRole]);

  // Single source of truth for the invariant, shared with the audit script.
  const effectiveRole = resolveEffectiveRole(actualRole, viewAsRole);
  const isViewingAsOtherRole = isOwner && effectiveRole !== actualRole;

  const value: ViewModeContextType = {
    viewAsRole,
    setViewAsRole: handleSetViewAsRole,
    isViewingAsOtherRole,
    actualRole,
    effectiveRole,
    resetToActualRole,
  };

  return (
    <ViewModeContext.Provider value={value}>
      {children}
    </ViewModeContext.Provider>
  );
}
