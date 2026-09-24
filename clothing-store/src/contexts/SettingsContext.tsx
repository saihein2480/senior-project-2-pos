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
import { useAuth } from "./AuthContext";

interface SettingsContextType {
  taxRate: number;
  businessSettings: BusinessSettings | null;
  /**
   * The branch this user is currently working in.
   *
   * Always read this rather than `businessSettings.currentBranch` directly: the
   * shared settings document holds the business-wide default, while each user
   * may have their own selection layered on top.
   */
  currentBranch: string;
  /**
   * Switch the working branch.
   *
   * Applies immediately for this user on this device, and — when their role may
   * edit business settings — is persisted as the business-wide default too.
   * Returns once the local switch has been applied; persistence continues in the
   * background so the UI never waits on the network to change branch.
   */
  setCurrentBranch: (branchName: string, persistToBusiness?: boolean) => void;
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

/** localStorage key holding this user's own branch selection. */
const branchStorageKey = (userId: string) => `userBranch_${userId}`;

/**
 * Fired when this tab changes branch.
 *
 * `storage` events only reach *other* tabs, so a same-tab event is needed as
 * well for every provider instance and any non-React listener to keep up.
 */
const BRANCH_CHANGED_EVENT = "posBranchChanged";

export function SettingsProvider({ children }: SettingsProviderProps) {
  const { user } = useAuth();
  const [businessSettings, setBusinessSettings] =
    useState<BusinessSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  /**
   * This user's own branch choice, or null when they have not made one and
   * should follow the business-wide default.
   */
  const [branchOverride, setBranchOverride] = useState<string | null>(null);

  const userId = user?.uid || user?.email || "";

  // Kept in a ref so the storage listener below can read the current user
  // without being torn down and re-attached on every auth change.
  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  const readStoredBranch = useCallback((id: string) => {
    if (!id || typeof window === "undefined") return null;
    try {
      return localStorage.getItem(branchStorageKey(id));
    } catch {
      // Private browsing modes can refuse localStorage; the business-wide
      // default is a perfectly good fallback.
      return null;
    }
  }, []);

  // Load this user's stored branch choice whenever the signed-in user changes.
  useEffect(() => {
    setBranchOverride(readStoredBranch(userId));
  }, [userId, readStoredBranch]);

  /**
   * Stay subscribed to the shared settings document.
   *
   * This is what makes a branch switch, a tax-rate change or a new receipt size
   * appear on every open screen straight away instead of after a reload.
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

    const applyBranch = (branchName: string | null) => {
      setBranchOverride(branchName);
    };

    const handleSameTab = (event: Event) => {
      const detail = (event as CustomEvent<{ userId: string; branch: string }>)
        .detail;
      if (!detail || detail.userId !== userIdRef.current) return;
      applyBranch(detail.branch);
    };

    const handleOtherTab = (event: StorageEvent) => {
      const id = userIdRef.current;
      if (!id || event.key !== branchStorageKey(id)) return;
      applyBranch(event.newValue);
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

  const setCurrentBranch = useCallback(
    (branchName: string, persistToBusiness = false) => {
      const id = userIdRef.current;

      // Apply locally first. The branch picker should feel instant, and the
      // network write below must never be able to block or undo it.
      setBranchOverride(branchName);

      if (id && typeof window !== "undefined") {
        try {
          localStorage.setItem(branchStorageKey(id), branchName);
        } catch {
          // Selection still applies for this session even if it can't persist.
        }

        window.dispatchEvent(
          new CustomEvent(BRANCH_CHANGED_EVENT, {
            detail: { userId: id, branch: branchName },
          }),
        );
      }

      if (!persistToBusiness) return;

      // Only roles allowed to edit business settings get here. The snapshot
      // listener above will deliver the result, so there is nothing to await.
      void fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentBranch: branchName }),
      }).catch((error) => {
        console.error("Error saving branch to business settings:", error);
      });
    },
    [],
  );

  const currentBranch =
    branchOverride || businessSettings?.currentBranch || "Main Branch";

  /**
   * The settings handed to consumers carry this user's branch selection, so
   * every page that filters by `businessSettings.currentBranch` follows the
   * switch without needing to know the override exists.
   */
  const effectiveSettings = useMemo<BusinessSettings | null>(() => {
    if (!businessSettings) return null;
    if (businessSettings.currentBranch === currentBranch) {
      return businessSettings;
    }
    return { ...businessSettings, currentBranch };
  }, [businessSettings, currentBranch]);

  const value = useMemo<SettingsContextType>(
    () => ({
      taxRate: businessSettings?.taxRate || 0,
      businessSettings: effectiveSettings,
      currentBranch,
      setCurrentBranch,
      refreshSettings,
      isLoading,
    }),
    [
      businessSettings?.taxRate,
      effectiveSettings,
      currentBranch,
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
