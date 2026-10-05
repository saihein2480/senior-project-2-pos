"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, ShoppingBag, Store, CreditCard, BarChart3 } from "lucide-react";

/**
 * Shared frame for the owner and staff sign-in screens: a rose -> pink brand
 * panel on the left (large screens) and the form card on the right.
 * Presentation only; each login component keeps its own form logic.
 */
export function AuthShell({
  taglines,
  blurb,
  footnote,
  backLabel,
  footerNote,
  children,
}: {
  /** Three short lines; the last one is emphasised. */
  taglines: [string, string, string];
  blurb: string;
  footnote: string;
  backLabel: string;
  footerNote: string;
  children: React.ReactNode;
}) {
  const highlights = [
    { icon: ShoppingBag, label: "Fast checkout" },
    { icon: Store, label: "Multi-branch stock" },
    { icon: CreditCard, label: "Cash, QR scan & COD" },
    { icon: BarChart3, label: "Live sales reports" },
  ];

  return (
    <div className="min-h-screen flex bg-canvas">
      {/* Brand panel */}
      <aside className="relative hidden lg:flex lg:w-[46%] xl:w-1/2 flex-col justify-between overflow-hidden bg-brand p-10 xl:p-14 text-white">
        {/* Soft decorative shapes */}
        <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-white/10" aria-hidden="true" />
        <div className="pointer-events-none absolute -bottom-32 -left-20 h-96 w-96 rounded-full bg-white/10" aria-hidden="true" />

        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-rose-500 shadow-lg shadow-rose-900/10">
              <ShoppingBag className="h-6 w-6" aria-hidden="true" />
            </div>
            <div className="leading-tight">
              <p className="text-lg font-bold">ClothingStore</p>
              <p className="text-xs font-medium text-white/80">Point of Sale</p>
            </div>
          </div>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-xl bg-white/15 px-3 py-2 text-sm font-medium text-white backdrop-blur transition-colors hover:bg-white/25"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {backLabel}
          </Link>
        </div>

        <div className="relative">
          <h1 className="text-4xl xl:text-5xl font-bold leading-tight tracking-tight">
            {taglines[0]}
            <br />
            {taglines[1]}
            <br />
            <span className="text-white/85">{taglines[2]}</span>
          </h1>
          <p className="mt-5 max-w-md text-base xl:text-lg text-white/85">{blurb}</p>

          <ul className="mt-8 grid max-w-md grid-cols-2 gap-3">
            {highlights.map(({ icon: Icon, label }) => (
              <li
                key={label}
                className="flex items-center gap-2.5 rounded-2xl bg-white/12 px-3.5 py-3 text-sm font-medium backdrop-blur ring-1 ring-inset ring-white/20"
              >
                <Icon className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                {label}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative flex items-end justify-between gap-6">
          <p className="text-sm text-white/80">{footnote}</p>
          {/* <Image
            src="/pink-boutique.png"
            alt=""
            width={150}
            height={150}
            className="h-28 w-28 xl:h-36 xl:w-36 object-contain drop-shadow-xl"
          /> */}
        </div>
      </aside>

      {/* Form side */}
      <main className="flex flex-1 flex-col">
        {/* Compact brand header for small screens */}
        <header className="flex items-center justify-between px-5 py-4 lg:hidden">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand shadow-brand">
              <ShoppingBag className="h-5 w-5 text-white" aria-hidden="true" />
            </div>
            <span className="text-base font-bold text-gray-900">
              ClothingStore <span className="font-medium text-rose-500">POS</span>
            </span>
          </div>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium text-gray-600 hover:bg-white hover:text-gray-900"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {backLabel}
          </Link>
        </header>

        <div className="flex flex-1 items-center justify-center px-5 py-8 sm:px-8">
          <div className="w-full max-w-md rounded-3xl border border-gray-200/80 bg-white p-7 shadow-sm sm:p-9">
            {children}
          </div>
        </div>

        <footer className="px-6 py-5 text-center text-xs text-gray-400">
          © {new Date().getFullYear()} ClothingStore POS · {footerNote}
        </footer>
      </main>
    </div>
  );
}

/** Shared input styling for the sign-in forms. */
export const authInputClass =
  "h-12 w-full rounded-xl border border-gray-200 bg-white pl-11 text-gray-900 placeholder-gray-400 shadow-sm transition-all hover:border-gray-300 focus:border-rose-400 focus:outline-none focus:ring-4 focus:ring-rose-100";

/** Shared primary submit button styling for the sign-in forms. */
export const authSubmitClass =
  "flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand px-6 font-semibold text-white shadow-brand transition-all hover:bg-brand-strong active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50";
