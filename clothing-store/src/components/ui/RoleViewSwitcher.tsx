"use client";

import React, { useState, useRef, useEffect } from "react";
import { UserRole } from "@/types/auth";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useViewMode } from "@/contexts/ViewModeContext";
import type { Translations } from "@/lib/translations";
import {
  Eye,
  ChevronDown,
  Check,
  Crown,
  Briefcase,
  UserRound,
  X,
  type LucideIcon,
} from "lucide-react";

interface RoleViewSwitcherProps {
  currentView: UserRole;
  onViewChange: (role: UserRole) => void;
}

/**
 * The selectable previews.
 *
 * Built from the active dictionary rather than declared as a module constant, so
 * the labels follow the language the user picked.
 */
function getViews(t: Translations): {
  role: UserRole;
  label: string;
  short: string;
  description: string;
  icon: LucideIcon;
}[] {
  return [
    {
      role: "owner",
      label: t.ownerView,
      short: t.owner,
      description: t.ownerViewDesc,
      icon: Crown,
    },
    {
      role: "manager",
      label: t.managerView,
      short: t.manager,
      description: t.managerViewDesc,
      icon: Briefcase,
    },
    {
      role: "staff",
      label: t.staffView,
      short: t.staff,
      description: t.staffViewDesc,
      icon: UserRound,
    },
  ];
}

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
  const { t } = useLanguage();
  const { resetToActualRole } = useViewMode();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Close on outside click or Escape.
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  // Only the owner can preview other roles - moved AFTER all hooks.
  if (user?.role !== "owner") {
    return null;
  }

  const views = getViews(t);
  const currentViewData = views.find((v) => v.role === currentView) ?? views[0];
  const isPreviewing = currentView !== "owner";
  const triggerLabel = isPreviewing
    ? `${currentViewData.label} ${t.previewActiveSuffix}`
    : t.previewAsAnotherRole;

  const exitPreview = () => {
    resetToActualRole();
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {isPreviewing ? (
        /* Previewing: a soft rose pill that names the role, with a one-tap
           exit, so it is obvious why parts of the UI have disappeared. */
        <div className="flex h-10 items-center rounded-xl bg-rose-50 ring-1 ring-inset ring-rose-200">
          <button
            ref={triggerRef}
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            aria-haspopup="menu"
            aria-expanded={isOpen}
            title={triggerLabel}
            aria-label={triggerLabel}
            className="flex h-full items-center gap-2 rounded-l-xl pl-3 pr-2 text-sm font-semibold text-rose-700 hover:bg-rose-100/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
          >
            
            <span className="hidden sm:inline">{currentViewData.short}</span>
            <span className="hidden xl:inline text-xs font-medium text-rose-500">
              · {t.previewBadge}
            </span>
          </button>
          <span className="h-5 w-px bg-rose-200" aria-hidden="true" />
          <button
            type="button"
            onClick={exitPreview}
            title={t.exitPreview}
            aria-label={t.exitPreview}
            className="flex h-full items-center rounded-r-xl px-2 text-rose-500 hover:bg-rose-100/70 hover:text-rose-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        /* Normal: a plain icon button like the bell, label on wide screens. */
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          aria-haspopup="menu"
          aria-expanded={isOpen}
          title={triggerLabel}
          aria-label={triggerLabel}
          className={`flex h-10 items-center gap-1.5 rounded-xl px-2.5 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 ${
            isOpen
              ? "bg-rose-50 text-rose-600"
              : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
          }`}
        >
          <Eye className="h-5 w-5" aria-hidden="true" />
          <span className="hidden xl:inline">{t.viewAs}</span>
          <ChevronDown
            className={`hidden xl:block h-4 w-4 text-gray-400 transition-transform ${
              isOpen ? "rotate-180" : ""
            }`}
            aria-hidden="true"
          />
        </button>
      )}

      {/* Menu */}
      {isOpen && (
        <div
          role="menu"
          aria-label={t.viewAs}
          className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl"
        >
          <div className="px-4 pt-4 pb-2">
            <p className="text-sm font-semibold text-gray-900">{t.viewAs}</p>
            <p className="mt-0.5 text-xs text-gray-500">{t.viewAsHint}</p>
          </div>

          <div className="space-y-0.5 p-1.5">
            {views.map((view) => {
              const isSelected = currentView === view.role;
              const Icon = view.icon;
              return (
                <button
                  key={view.role}
                  type="button"
                  role="menuitemradio"
                  aria-checked={isSelected}
                  onClick={() => {
                    onViewChange(view.role);
                    setIsOpen(false);
                  }}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                    isSelected ? "bg-rose-50" : "hover:bg-gray-50"
                  }`}
                >
                  <span
                    className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${
                      isSelected
                        ? "bg-brand text-white shadow-brand"
                        : "bg-gray-100 text-gray-500"
                    }`}
                    aria-hidden="true"
                  >
                    <Icon className="h-[18px] w-[18px]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block text-sm font-semibold ${
                        isSelected ? "text-rose-700" : "text-gray-900"
                      }`}
                    >
                      {view.label}
                    </span>
                    <span className="block text-xs leading-4 text-gray-500">
                      {view.description}
                    </span>
                  </span>
                  <span
                    className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full ${
                      isSelected
                        ? "bg-rose-500 text-white"
                        : "ring-1 ring-inset ring-gray-300"
                    }`}
                    aria-hidden="true"
                  >
                    {isSelected && <Check className="h-3 w-3" strokeWidth={3} />}
                  </span>
                </button>
              );
            })}
          </div>

          {isPreviewing && (
            <div className="border-t border-gray-100 p-1.5">
              <button
                type="button"
                role="menuitem"
                onClick={exitPreview}
                className="flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                <X className="h-4 w-4" aria-hidden="true" />
                {t.exitPreview}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
