"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { UserRole } from "@/types/auth";
import { useAuth } from "@/contexts/AuthContext";

interface ViewModeContextType {
  viewAsRole: UserRole;
  setViewAsRole: (role: UserRole) => void;
  isViewingAsOtherRole: boolean;
  actualRole: UserRole | null;
}

const ViewModeContext = createContext<ViewModeContextType | undefined>(
  undefined
);

export function useViewMode() {
  const context = useContext(ViewModeContext);
  if (context === undefined) {
    throw new Error("useViewMode must be used within a ViewModeProvider");
  }
  return context;
}

interface ViewModeProviderProps {
  children: React.ReactNode;
}

export function ViewModeProvider({ children }: ViewModeProviderProps) {
  const { user } = useAuth();
  const [viewAsRole, setViewAsRole] = useState<UserRole>(
    user?.role || "staff"
  );

  // Sync viewAsRole with actual user role when it changes
  useEffect(() => {
    if (user?.role) {
      setViewAsRole(user.role);
    }
  }, [user?.role]);

  // Load saved view preference from localStorage for owner
  useEffect(() => {
    if (user?.role === "owner") {
      try {
        const savedView = localStorage.getItem("ownerViewAsRole") as UserRole;
        if (savedView && ["owner", "manager", "staff"].includes(savedView)) {
          setViewAsRole(savedView);
        }
      } catch (e) {
        // ignore
      }
    }
  }, [user?.role]);

  // Save view preference to localStorage
  const handleSetViewAsRole = (role: UserRole) => {
    setViewAsRole(role);
    
    // Only save if user is owner
    if (user?.role === "owner") {
      try {
        localStorage.setItem("ownerViewAsRole", role);
      } catch (e) {
        // ignore
      }
    }
  };

  const isViewingAsOtherRole =
    user?.role === "owner" && viewAsRole !== user.role;

  const value: ViewModeContextType = {
    viewAsRole,
    setViewAsRole: handleSetViewAsRole,
    isViewingAsOtherRole,
    actualRole: user?.role || null,
  };

  return (
    <ViewModeContext.Provider value={value}>
      {children}
    </ViewModeContext.Provider>
  );
}
