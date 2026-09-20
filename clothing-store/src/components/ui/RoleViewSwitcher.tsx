"use client";

import React, { useState, useRef, useEffect } from "react";
import { UserRole } from "@/types/auth";
import { useAuth } from "@/contexts/AuthContext";
import { Eye, ChevronDown } from "lucide-react";

interface RoleViewSwitcherProps {
  currentView: UserRole;
  onViewChange: (role: UserRole) => void;
}

/**
 * RoleViewSwitcher - Allows owner to switch between different role views
 * to see what managers and staff can see
 */
export function RoleViewSwitcher({
  currentView,
  onViewChange,
}: RoleViewSwitcherProps) {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // Only show for owner - moved AFTER all hooks
  if (user?.role !== "owner") {
    return null;
  }

  const views: { role: UserRole; label: string; description: string; color: string }[] = [
    {
      role: "owner",
      label: "Owner View",
      description: "Full system access",
      color: "flex items-center gap-2 px-3 py-1.5 bg-gray-50 backdrop-blur-sm border border-gray-200 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-pink-300 rounded-full transition-all text-gray-800",
    },
    {
      role: "manager",
      label: "Manager View",
      description: "Advanced operations",
      color: "flex items-center gap-2 px-3 py-1.5 bg-gray-50 backdrop-blur-sm border border-gray-200 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-pink-300 rounded-full transition-all text-gray-800",
    },
    {
      role: "staff",
      label: "Staff View",
      description: "Basic POS operations",
      color: "flex items-center gap-2 px-3 py-1.5 bg-gray-50 backdrop-blur-sm border border-gray-200 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-pink-300 rounded-full transition-all text-gray-800",
    },
  ];

  const currentViewData = views.find((v) => v.role === currentView);

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Current View Badge */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 px-3 py-2 rounded-full border ${currentViewData?.color} hover:opacity-80 transition-opacity text-sm font-medium`}
      >
        <span>{currentViewData?.label}</span>
        <ChevronDown
          className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50">
          <div className="px-3 py-2 border-b border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Switch View As
            </p>
            <p className="text-xs text-gray-400 mt-1">
              See what other roles can access
            </p>
          </div>

          <div className="py-1">
            {views.map((view) => (
              <button
                key={view.role}
                onClick={() => {
                  onViewChange(view.role);
                  setIsOpen(false);
                }}
                className={`w-full text-left px-3 py-2.5 hover:bg-gray-50 transition-colors ${
                  currentView === view.role ? "bg-gray-50" : ""
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`flex-shrink-0 w-2 h-2 rounded-full mt-1.5 ${
                      view.role === "owner"
                        ? "bg-purple-500"
                        : view.role === "manager"
                          ? "bg-blue-500"
                          : "bg-green-500"
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-gray-900">
                        {view.label}
                      </p>
                      {currentView === view.role && (
                        <svg
                          className="w-4 h-4 text-green-500"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {view.description}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>

          <div className="px-3 py-2 border-t border-gray-100 mt-1">
            <p className="text-xs text-gray-500">
              💡 This only affects what you see. Your actual role is still{" "}
              <span className="font-semibold">Owner</span>.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
