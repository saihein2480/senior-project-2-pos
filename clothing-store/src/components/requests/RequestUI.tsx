"use client";

/**
 * Shared building blocks for the owner request pages
 * (/owner/requests/cancellations, /refunds, /pending-refunds), so the three
 * queues look and behave the same: one header, one stat strip, one toolbar,
 * one card layout, one modal shell, consistent buttons and badges.
 *
 * Presentation only. No data access, no business rules.
 */

import React, { useEffect, useId, useRef } from "react";
import { Loader2, Search, X, type LucideIcon } from "lucide-react";

// ---------------------------------------------------------------------------
// Tone palette
// ---------------------------------------------------------------------------

export type Tone = "rose" | "amber" | "blue" | "emerald" | "violet" | "gray" | "red";

const TONE: Record<Tone, { soft: string; text: string; ring: string; solid: string; dot: string }> = {
  rose: { soft: "bg-rose-50", text: "text-rose-700", ring: "ring-rose-200", solid: "bg-rose-500", dot: "bg-rose-500" },
  amber: { soft: "bg-amber-50", text: "text-amber-700", ring: "ring-amber-200", solid: "bg-amber-500", dot: "bg-amber-500" },
  blue: { soft: "bg-sky-50", text: "text-sky-700", ring: "ring-sky-200", solid: "bg-sky-500", dot: "bg-sky-500" },
  emerald: { soft: "bg-emerald-50", text: "text-emerald-700", ring: "ring-emerald-200", solid: "bg-emerald-500", dot: "bg-emerald-500" },
  violet: { soft: "bg-violet-50", text: "text-violet-700", ring: "ring-violet-200", solid: "bg-violet-500", dot: "bg-violet-500" },
  gray: { soft: "bg-gray-100", text: "text-gray-700", ring: "ring-gray-200", solid: "bg-gray-500", dot: "bg-gray-400" },
  red: { soft: "bg-red-50", text: "text-red-700", ring: "ring-red-200", solid: "bg-red-500", dot: "bg-red-500" },
};

// ---------------------------------------------------------------------------
// Page header
// ---------------------------------------------------------------------------

export function RequestPageHeader({
  icon: Icon,
  title,
  description,
  actions,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  /** Right-hand side: e.g. a live indicator or a refresh button. */
  actions?: React.ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-500 to-pink-500 text-white shadow-md shadow-rose-500/20">
          <Icon className="h-6 w-6" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900 sm:text-3xl">{title}</h1>
          {description && <p className="mt-0.5 text-sm text-gray-500">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}

/** Small "Live" pill: the list updates on its own (Firestore listener). */
export function LiveIndicator({ label = "Live" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
      <span className="relative flex h-2 w-2" aria-hidden="true">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
      </span>
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

export function StatGrid({ children }: { children: React.ReactNode }) {
  return <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">{children}</div>;
}

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "gray",
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon: LucideIcon;
  tone?: Tone;
}) {
  const t = TONE[tone];
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
          <p className="mt-1.5 truncate text-2xl font-semibold text-gray-900">{value}</p>
          {hint && <p className="mt-0.5 truncate text-xs text-gray-500">{hint}</p>}
        </div>
        <div className={`rounded-xl p-2.5 ${t.soft} ${t.text}`}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toolbar: search + segmented filter
// ---------------------------------------------------------------------------

export interface FilterOption<V extends string> {
  value: V;
  label: string;
  count?: number;
}

export function RequestToolbar<V extends string>({
  search,
  onSearchChange,
  searchPlaceholder = "Search by order, customer or phone",
  filters,
  filterValue,
  onFilterChange,
  filterLabel = "Filter",
  trailing,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  filters?: ReadonlyArray<FilterOption<V>>;
  filterValue?: V;
  onFilterChange?: (value: V) => void;
  filterLabel?: string;
  trailing?: React.ReactNode;
}) {
  const searchId = useId();
  return (
    <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm lg:flex-row lg:items-center lg:justify-between">
      <div className="relative w-full lg:max-w-sm">
        <label htmlFor={searchId} className="sr-only">
          {searchPlaceholder}
        </label>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
        <input
          id={searchId}
          type="search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2 pl-9 pr-9 text-sm text-gray-900 placeholder:text-gray-400 focus:border-rose-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-100"
        />
        {search && (
          <button
            type="button"
            onClick={() => onSearchChange("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="Clear search"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {filters && filters.length > 0 && onFilterChange && (
          <div role="radiogroup" aria-label={filterLabel} className="flex flex-wrap gap-1 rounded-xl bg-gray-100 p-1">
            {filters.map((option) => {
              const active = option.value === filterValue;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => onFilterChange(option.value)}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                    active ? "bg-white text-rose-700 shadow-sm" : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  {option.label}
                  {option.count !== undefined && (
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                        active ? "bg-rose-100 text-rose-700" : "bg-gray-200 text-gray-600"
                      }`}
                    >
                      {option.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
        {trailing}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Badges
// ---------------------------------------------------------------------------

export function Badge({ tone = "gray", children, dot = false }: { tone?: Tone; children: React.ReactNode; dot?: boolean }) {
  const t = TONE[tone];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${t.soft} ${t.text} ${t.ring}`}>
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${t.dot}`} aria-hidden="true" />}
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Request card
// ---------------------------------------------------------------------------

export interface CardMeta {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
}

export function RequestCard({
  tone = "amber",
  title,
  badges,
  meta,
  children,
  actions,
  footer,
}: {
  /** Colour of the left accent bar (the request's state). */
  tone?: Tone;
  title: React.ReactNode;
  badges?: React.ReactNode;
  meta?: CardMeta[];
  /** Body under the meta row: reason, notes, progress. */
  children?: React.ReactNode;
  /** Buttons; stacked on the right on wide screens, a row below on small ones. */
  actions?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <article className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md">
      <span className={`absolute inset-y-0 left-0 w-1 ${TONE[tone].solid}`} aria-hidden="true" />
      <div className="flex flex-col gap-4 p-4 pl-5 sm:p-5 sm:pl-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-gray-900">{title}</h3>
            {badges}
          </div>
          {meta && meta.length > 0 && (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
              {meta.map(({ icon: Icon, label, value }) => (
                <div key={label} className="flex min-w-0 items-center gap-2">
                  <div className="rounded-lg bg-gray-100 p-1.5 text-gray-500">
                    <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <dt className="text-[11px] text-gray-500">{label}</dt>
                    <dd className="truncate text-sm font-medium text-gray-900">{value}</dd>
                  </div>
                </div>
              ))}
            </dl>
          )}
          {children && <div className="mt-3 space-y-2">{children}</div>}
        </div>
        {actions && (
          <div className="flex flex-wrap gap-2 lg:w-44 lg:flex-col lg:flex-nowrap">{actions}</div>
        )}
      </div>
      {footer && <div className="border-t border-gray-100 bg-gray-50/60 px-5 py-3">{footer}</div>}
    </article>
  );
}

/** A labelled note block inside a card (reason, rejection note, ...). */
export function NoteBlock({ label, children, tone = "gray" }: { label: string; children: React.ReactNode; tone?: Tone }) {
  const t = TONE[tone];
  return (
    <div className={`rounded-xl px-3 py-2.5 ring-1 ring-inset ${t.soft} ${t.ring}`}>
      <p className={`mb-0.5 text-[11px] font-semibold uppercase tracking-wide ${t.text}`}>{label}</p>
      <div className="text-sm leading-relaxed text-gray-700">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

export type ActionVariant = "primary" | "approve" | "danger" | "secondary";

const VARIANT: Record<ActionVariant, string> = {
  primary:
    "bg-gradient-to-r from-rose-500 to-pink-500 text-white shadow-sm hover:from-rose-600 hover:to-pink-600 focus-visible:ring-rose-300",
  approve: "bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 focus-visible:ring-emerald-300",
  danger: "bg-white text-red-600 ring-1 ring-inset ring-red-200 hover:bg-red-50 focus-visible:ring-red-300",
  secondary: "bg-white text-gray-700 ring-1 ring-inset ring-gray-200 hover:bg-gray-50 focus-visible:ring-gray-300",
};

export function ActionButton({
  variant = "secondary",
  icon: Icon,
  loading = false,
  loadingLabel = "Processing...",
  children,
  className = "",
  disabled,
  type = "button",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ActionVariant;
  icon?: LucideIcon;
  loading?: boolean;
  loadingLabel?: string;
}) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50 lg:flex-none lg:w-full ${VARIANT[variant]} ${className}`}
      {...rest}
    >
      {loading ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          {loadingLabel}
        </>
      ) : (
        <>
          {Icon && <Icon className="h-4 w-4" aria-hidden="true" />}
          {children}
        </>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// States
// ---------------------------------------------------------------------------

export function LoadingList({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading requests</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="animate-pulse rounded-2xl border border-gray-200 bg-white p-5">
          <div className="mb-4 h-4 w-40 rounded bg-gray-200" />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {Array.from({ length: 4 }, (_, j) => (
              <div key={j} className="h-8 rounded bg-gray-100" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-white px-6 py-14 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-rose-50 text-rose-400">
        <Icon className="h-7 w-7" aria-hidden="true" />
      </div>
      <h3 className="text-base font-semibold text-gray-900">{title}</h3>
      {description && <p className="mx-auto mt-1 max-w-sm text-sm text-gray-500">{description}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal shell
// ---------------------------------------------------------------------------

export function RequestModal({
  open,
  onClose,
  title,
  subtitle,
  icon: Icon,
  size = "lg",
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  size?: "md" | "lg" | "xl";
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  // Escape closes; focus moves into the dialog when it opens.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    panelRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  const width = size === "md" ? "max-w-lg" : size === "xl" ? "max-w-5xl" : "max-w-3xl";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-3 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`flex max-h-[92vh] w-full ${width} flex-col overflow-hidden rounded-2xl bg-white shadow-2xl focus:outline-none`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
          <div className="flex items-center gap-3">
            {Icon && (
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </div>
            )}
            <div>
              <h2 id={titleId} className="text-base font-semibold text-gray-900">
                {title}
              </h2>
              {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="flex flex-col-reverse gap-2 border-t border-gray-100 bg-gray-50/60 px-5 py-3 sm:flex-row sm:justify-end [&>button]:lg:w-auto [&>button]:lg:flex-none">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/** Titled section inside a modal. */
export function ModalSection({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="mb-5 last:mb-0">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** Label/value rows for a summary (customer, payment, totals). */
export function KeyValueList({ rows }: { rows: Array<{ label: string; value: React.ReactNode; strong?: boolean }> }) {
  return (
    <dl className="divide-y divide-gray-100 rounded-xl border border-gray-200">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center justify-between gap-4 px-3 py-2">
          <dt className="text-sm text-gray-500">{row.label}</dt>
          <dd className={`text-right text-sm ${row.strong ? "font-semibold text-gray-900" : "text-gray-800"}`}>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}
