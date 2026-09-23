"use client";

import React from "react";

interface ChartCardProps {
  title: string;
  /** One line explaining what decision the chart supports. */
  description?: string;
  /** Short highlight, e.g. a headline figure or a health badge. */
  badge?: React.ReactNode;
  /** Rendered instead of children when there is nothing to plot. */
  isEmpty?: boolean;
  emptyIcon?: React.ReactNode;
  emptyMessage?: string;
  /** Caveats about the data, shown under the chart in small print. */
  footnote?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Shared shell for dashboard charts.
 *
 * Matches the card styling already used on the owner dashboard, and gives every
 * chart a consistent place for the "what am I looking at" line and for data
 * caveats — a chart whose limitations are invisible invites confident wrong
 * conclusions.
 */
export function ChartCard({
  title,
  description,
  badge,
  isEmpty = false,
  emptyIcon,
  emptyMessage,
  footnote,
  children,
}: ChartCardProps) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
      <div className="flex flex-wrap items-start justify-between gap-2 mb-1">
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        {badge}
      </div>

      {description && (
        <p className="text-xs text-gray-500 mb-4 max-w-prose">{description}</p>
      )}

      {isEmpty ? (
        <div className="text-center py-16">
          {emptyIcon && (
            <div className="flex justify-center mb-2 text-gray-400">
              {emptyIcon}
            </div>
          )}
          <p className="text-gray-500">{emptyMessage}</p>
        </div>
      ) : (
        children
      )}

      {!isEmpty && footnote && (
        <p className="text-[11px] text-gray-400 mt-3 leading-relaxed">
          {footnote}
        </p>
      )}
    </div>
  );
}
