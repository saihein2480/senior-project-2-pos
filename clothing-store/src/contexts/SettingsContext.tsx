"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  ReactNode,
} from "react";
import { SettingsService, BusinessSettings } from "@/services/settingsService";
import { ShopService } from "@/services/shopService";
import type { Shop } from "@/types/shop";
import { useAuth } from "./AuthContext";
import { authFetch } from "@/lib/authFetch";
import {
  type BranchRef,
  NO_BRANCH_NAME,
  findBranchById,
  normalizeBranchName,
  resolveBranch,
  resolveStoredBranchSelection,
  serializeBranchSelection,
  toBranchRefs,
} from "@/lib/branch";

/** Fallback when the settings document names no default branch. */
const DEFAULT_BRANCH_NAME = "Main Branch";

interface SettingsContextType {
  taxRate: number;
  /**
   * Business settings, with `currentBranch` replaced by this user's branch
   * *name* for older pages that still read it from here.
   */
  businessSettings: BusinessSettings | null;

  /**
   * The branch this user is working in (their own selection, else the
   * business-wide default). `id` is "" when the branch does not resolve to a
   * shop (no shops yet, or a legacy name that matches none).
   *
   * Filter records with `matchesBranch(record, branch)` from `@/lib/branch`.
   */
  branch: BranchRef;
  /** The business-wide default branch every user starts in. */
  defaultBranch: BranchRef;
  /** All branches (shops), oldest first, kept live. */
  branches: BranchRef[];
  /** True once the shops list has loaded (or failed to). */
  branchesLoaded: boolean;
  /**
   * Switch this user's working branch on this device. Never changes the
   * business-wide default for anyone else.
   */
  selectBranch: (branch: BranchRef | string) => void;
  /**
   * Owner action: make `branchId` the business-wide default branch. Rejects
   * for other roles and for unknown ids. Does not change this user's own
   * selection.
   */
  setDefaultBranch: (branchId: string) => Promise<void>;

  /**
   * @deprecated Use `branch.name` (display) or `branch` (matching). Kept for
   * existing callers; equal to `branch.name`.
   */
  currentBranch: string;
  /**
   * @deprecated Use `selectBranch(id)`. The second argument is ignored: picking
   * a branch no longer changes the business default. Use `setDefaultBranch`
   * from an explicit owner action for that.
   */
  setCurrentBranch: (branchName: string, setAsDefault?: boolean) => void;

  refreshSettings: () => Promise<void>;
  isLoading: boolean;
}

const SettingsContext = createContext<SettingsContextType | undefined>(
  undefined,
);

export function useSettings() {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error("useSettings must be used within a SettingsProvider");
  }
  return context;
}

interface SettingsProviderProps {
  children: ReactNode;
}

/**
 * localStorage key holding this user's own branch selection. The value is a
 * JSON `{id, name}` (see `serializeBranchSelection`); older builds stored the
 * bare branch name, which is migrated to an id once the shops list is known.
 */
const branchStorageKey = (userId: string) => `userBranch_${userId}`;

/**
 * Fired when this tab changes branch.
 *
 * `storage` events only reach *other* tabs, so a same-tab event is needed as
 * well for every provider instance and any non-React listener to keep up.
 * `detail.raw` is the stored value (null when cleared).
 */
const BRANCH_CHANGED_EVENT = "posBranchChanged";

function readStorage(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(key);
  } catch {
    // Private browsing modes can refuse localStorage; the business-wide
    // default is a perfectly good fallback.
    return null;
  }
}

function writeStorage(key: string, raw: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (raw === null) localStorage.removeItem(key);
    else localStorage.setItem(key, raw);
  } catch {
    // Selection still applies for this session even if it can't persist.
  }
}

export function SettingsProvider({ children }: SettingsProviderProps) {
  const { user } = useAuth();
  const [businessSettings, setBusinessSettings] =
    useState<BusinessSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [shops, setShops] = useState<Shop[]>([]);
  const [branchesLoaded, setBranchesLoaded] = useState(false);
  /**
   * True once a shops snapshot came from the server. Only then is the list
   * trusted to drop or migrate a stored selection.
   */
  const [shopsConfirmed, setShopsConfirmed] = useState(false);

  const userId = user?.uid || user?.email || "";

  /**
   * Raw stored selection, tagged with the user it was read for so a value
   * read for one account is never resolved (or migrated) for another.
   */
  const [stored, setStored] = useState<{ userId: string; raw: string | null }>(
    { userId: "", raw: null },
  );
  const storedIsCurrent = stored.userId === userId;
  const storedRaw = storedIsCurrent ? stored.raw : null;

  // Kept in a ref so the storage listener below can read the current user
  // without being torn down and re-attached on every auth change.
  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  // Load this user's stored branch choice whenever the signed-in user changes.
  useEffect(() => {
    setStored({
      userId,
      raw: userId ? readStorage(branchStorageKey(userId)) : null,
    });
  }, [userId]);

  /**
   * Stay subscribed to the shared settings document.
   *
   * This is what makes a default-branch change, a tax-rate change or a new
   * receipt size appear on every open screen straight away.
   */
  useEffect(() => {
    let cancelled = false;

    const unsubscribe = SettingsService.subscribeToBusinessSettings(
      (settings) => {
        if (cancelled) return;
        setBusinessSettings(settings);
        setIsLoading(false);
      },
      () => {
        if (cancelled) return;
        setIsLoading(false);
      },
    );

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  /** Live shops list, so renames and new branches show up everywhere. */
  useEffect(() => {
    let cancelled = false;

    const unsubscribe = ShopService.subscribeToShops(
      (next, { fromServer }) => {
        if (cancelled) return;
        setShops(next);
        setBranchesLoaded(true);
        if (fromServer) setShopsConfirmed(true);
      },
      () => {
        if (cancelled) return;
        setBranchesLoaded(true);
      },
    );

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  /**
   * Force a re-read of the settings document.
   *
   * The subscription already keeps everything current, so this is only needed
   * when a caller wants to be certain it has the latest values before acting.
   */
  const refreshSettings = useCallback(async () => {
    try {
      const settings = await SettingsService.getBusinessSettings();
      setBusinessSettings(settings);
    } catch (error) {
      console.error("Error loading settings:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Pick up branch switches made in this tab and in other tabs.
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleSameTab = (event: Event) => {
      const detail = (
        event as CustomEvent<{ userId: string; raw: string | null }>
      ).detail;
      if (!detail || detail.userId !== userIdRef.current) return;
      setStored({ userId: detail.userId, raw: detail.raw });
    };

    const handleOtherTab = (event: StorageEvent) => {
      const id = userIdRef.current;
      if (!id || event.key !== branchStorageKey(id)) return;
      setStored({ userId: id, raw: event.newValue });
    };

    // Retained so existing callers that dispatch "refreshSettings" (e.g. after
    // the last shop is deleted) still force a re-read.
    const handleLegacyRefresh = () => {
      void refreshSettings();
    };

    window.addEventListener(BRANCH_CHANGED_EVENT, handleSameTab);
    window.addEventListener("storage", handleOtherTab);
    window.addEventListener("refreshSettings", handleLegacyRefresh);

    return () => {
      window.removeEventListener(BRANCH_CHANGED_EVENT, handleSameTab);
      window.removeEventListener("storage", handleOtherTab);
      window.removeEventListener("refreshSettings", handleLegacyRefresh);
    };
  }, [refreshSettings]);

  const branches = useMemo(() => toBranchRefs(shops), [shops]);

  /** Store a selection for this user and tell every listener. */
  const persistSelection = useCallback((raw: string | null) => {
    const id = userIdRef.current;
    setStored({ userId: id, raw });
    if (!id || typeof window === "undefined") return;
    writeStorage(branchStorageKey(id), raw);
    window.dispatchEvent(
      new CustomEvent(BRANCH_CHANGED_EVENT, { detail: { userId: id, raw } }),
    );
  }, []);

  const storedSelection = useMemo(
    () =>
      resolveStoredBranchSelection(storedRaw, shopsConfirmed ? branches : null),
    [storedRaw, shopsConfirmed, branches],
  );

  // One-time migration of a legacy name-based value (and cleanup of a
  // selection whose shop no longer exists) once the shops list is confirmed.
  // Only for a value read for the signed-in user.
  useEffect(() => {
    if (storedSelection.write === undefined) return;
    if (!userId || !storedIsCurrent) return;
    persistSelection(storedSelection.write);
  }, [storedSelection, storedIsCurrent, userId, persistSelection]);

  const defaultBranch = useMemo<BranchRef>(() => {
    const stored = (businessSettings?.currentBranch || "").trim();
    const name = stored || DEFAULT_BRANCH_NAME;
    if (normalizeBranchName(name) === normalizeBranchName(NO_BRANCH_NAME)) {
      return { id: "", name: NO_BRANCH_NAME };
    }
    return resolveBranch(branches, name) || { id: "", name };
  }, [businessSettings?.currentBranch, branches]);

  const branch = storedSelection.branch || defaultBranch;

  const selectBranch = useCallback(
    (next: BranchRef | string) => {
      const ref =
        typeof next === "string"
          ? findBranchById(branches, next) || { id: next, name: next }
          : next;
      if (!ref.id) {
        // Nothing to select by id (e.g. "No Branch"): follow the default.
        persistSelection(null);
        return;
      }
      persistSelection(serializeBranchSelection(ref));
    },
    [branches, persistSelection],
  );

  const setCurrentBranch = useCallback(
    (branchName: string, setAsDefault?: boolean) => {
      if (setAsDefault && process.env.NODE_ENV !== "production") {
        console.warn(
          "setCurrentBranch(name, true) no longer changes the business default branch. " +
            "Call setDefaultBranch(id) from an explicit owner action instead.",
        );
      }

      const resolved = resolveBranch(branches, branchName);
      if (resolved) {
        persistSelection(serializeBranchSelection(resolved));
      } else if (
        !branchName.trim() ||
        normalizeBranchName(branchName) === normalizeBranchName(NO_BRANCH_NAME)
      ) {
        persistSelection(null);
      } else {
        // Unknown name (shops not loaded yet?): keep it in the legacy format
        // so it is migrated or cleared once the shops list is confirmed.
        persistSelection(branchName.trim());
      }
    },
    [branches, persistSelection],
  );

  const userRole = user?.role;

  const setDefaultBranch = useCallback(
    async (branchId: string) => {
      if (userRole !== "owner") {
        throw new Error("Only the owner can change the default branch");
      }
      const target = findBranchById(branches, branchId);
      if (!target) {
        throw new Error("Unknown branch");
      }

      // The settings document stores the default by name (PATCH accepts only
      // `currentBranch`). Renames keep it in step: PUT /api/shops/[id] moves
      // a default that named the renamed shop, and names resolve through
      // `formerNames` either way.
      const response = await authFetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentBranch: target.name }),
      });
      const result = (await response.json().catch(() => null)) as {
        success?: boolean;
        error?: string;
      } | null;
      if (!response.ok || !result?.success) {
        throw new Error(result?.error || "Failed to save the default branch");
      }

      // The snapshot listener will confirm; apply now so the UI is in step.
      setBusinessSettings((prev) =>
        prev ? { ...prev, currentBranch: target.name } : prev,
      );
    },
    [branches, userRole],
  );

  /**
   * The settings handed to consumers carry this user's branch name, so pages
   * that still read `businessSettings.currentBranch` follow the switch.
   */
  const effectiveSettings = useMemo<BusinessSettings | null>(() => {
    if (!businessSettings) return null;
    if (businessSettings.currentBranch === branch.name) {
      return businessSettings;
    }
    return { ...businessSettings, currentBranch: branch.name };
  }, [businessSettings, branch.name]);

  const value = useMemo<SettingsContextType>(
    () => ({
      taxRate: businessSettings?.taxRate || 0,
      businessSettings: effectiveSettings,
      branch,
      defaultBranch,
      branches,
      branchesLoaded,
      selectBranch,
      setDefaultBranch,
      currentBranch: branch.name,
      setCurrentBranch,
      refreshSettings,
      isLoading,
    }),
    [
      businessSettings?.taxRate,
      effectiveSettings,
      branch,
      defaultBranch,
      branches,
      branchesLoaded,
      selectBranch,
      setDefaultBranch,
      setCurrentBranch,
      refreshSettings,
      isLoading,
    ],
  );

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}
