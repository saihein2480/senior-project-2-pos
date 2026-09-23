"use client";

import React, { useState, useRef, useEffect } from "react";
import { UserRole } from "@/types/auth";
import { useAuth } from "@/contexts/AuthContext";
import { Eye, ChevronDown, Check } from "lucide-react";

interface RoleViewSwitcherProps {
  currentView: UserRole;
  onViewChange: (role: UserRole) => void;
}

const VIEWS: {
  role: UserRole;
  label: string;
  description: string;
  dot: string;
}[] = [
  {
    role: "owner",
    label: "Owner View",
    description: "Full system access",
    dot: "bg-purple-500",
  },
  {
    role: "manager",
    label: "Manager View",
    description: "Everything except shops and staff",
    dot: "bg-blue-500",
  },
  {
    role: "staff",
    label: "Staff View",
    description: "POS, customers and settings only",
    dot: "bg-green-500",
  },
];

/**
 * RoleViewSwitcher - lets an owner preview the POS as a Manager or Staff member.
 *
 * The preview is not cosmetic: it drives usePermissions() and ProtectedRoute, so
 * while previewing, the owner sees and can do exactly what that role can. The
 * owner's stored role never changes and one click restores full access.
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

  // Only the owner can preview other roles - moved AFTER all hooks.
  if (user?.role !== "owner") {
    return null;
  }

  const currentViewData = VIEWS.find((v) => v.role === currentView);
  const isPreviewing = currentView !== "owner";

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger. Turns amber while previewing, so it is obvious why parts of
          the UI have disappeared. */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        title={
          isPreviewing
            ? `Previewing as ${currentViewData?.label}. Your role is still Owner.`
            : "Preview the POS as another role"
        }
        className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 ${
          isPreviewing
            ? "bg-amber-50 border-amber-300 text-amber-900 hover:bg-amber-100 focus:ring-amber-300"
            : "bg-gray-50 border-gray-200 text-gray-800 hover:bg-gray-100 focus:ring-pink-300"
        }`}
      >
        <Eye className="w-4 h-4" aria-hidden="true" />
        <span>{currentViewData?.label}</span>
        <ChevronDown
          className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          role="menu"
          className="absolute top-full right-0 mt-2 w-72 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50"
        >
          <div className="px-3 py-2 border-b border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              View as
            </p>
            <p className="text-xs text-gray-400 mt-1">
              See and use the POS exactly as that role does
            </p>
          </div>

          <div className="py-1">
            {VIEWS.map((view) => (
              <button
                key={view.role}
                role="menuitemradio"
                aria-checked={currentView === view.role}
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
                    className={`flex-shrink-0 w-2 h-2 rounded-full mt-1.5 ${view.dot}`}
                    aria-hidden="true"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-gray-900">
                        {view.label}
                      </p>
                      {currentView === view.role && (
                        <Check
                          className="w-4 h-4 text-green-500"
                          aria-hidden="true"
                        />
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
            {isPreviewing ? (
              <p className="text-xs text-amber-800">
                You are working with{" "}
                <span className="font-semibold">{currentViewData?.label}</span>{" "}
                permissions. Actions that role cannot perform are hidden and
                blocked. Your account is still{" "}
                <span className="font-semibold">Owner</span> - switch back any
                time.
              </p>
            ) : (
              <p className="text-xs text-gray-500">
                Pick a role to check what it can reach. The preview applies real
                permissions, so it reflects what that person actually
                experiences.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
