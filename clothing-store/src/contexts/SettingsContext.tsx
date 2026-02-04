"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { SettingsService, BusinessSettings } from "@/services/settingsService";
import { useAuth } from "./AuthContext";

interface SettingsContextType {
  taxRate: number;
  businessSettings: BusinessSettings | null;
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

export function SettingsProvider({ children }: SettingsProviderProps) {
  const { user } = useAuth();
  const [taxRate, setTaxRate] = useState<number>(0);
  const [businessSettings, setBusinessSettings] =
    useState<BusinessSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load settings from business settings
  const loadSettings = async () => {
    try {
      setIsLoading(true);
      const settings = await SettingsService.getBusinessSettings();
      if (settings) {
        setTaxRate(settings.taxRate || 0);

        // For all users, override currentBranch with user-specific branch from localStorage
        if (user?.uid) {
          const userBranch = localStorage.getItem(`userBranch_${user.uid}`);
          if (userBranch) {
            setBusinessSettings({ ...settings, currentBranch: userBranch });
          } else {
            setBusinessSettings(settings);
          }
        } else {
          setBusinessSettings(settings);
        }
      }
    } catch (error) {
      console.error("Error loading settings:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Refresh settings function that can be called from anywhere
  const refreshSettings = async () => {
    await loadSettings();
  };

  // Load settings on mount and listen for refresh events
  useEffect(() => {
    loadSettings();
    // Listen for manual refresh events (e.g., after all shops deleted)
    const handler = () => loadSettings();
    window.addEventListener("refreshSettings", handler);
    return () => {
      window.removeEventListener("refreshSettings", handler);
    };
  }, [user]);

  const value: SettingsContextType = {
    taxRate,
    businessSettings,
    refreshSettings,
    isLoading,
  };

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}
