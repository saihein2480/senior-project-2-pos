"use client";

import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  BarChart3,
  Heart,
  Lock,
  ShoppingBag,
  Users,
} from "lucide-react";
import ConfigNotification from "@/components/ui/ConfigNotification";

export default function Home() {
  return (
    <div className="min-h-screen bg-canvas">
      {/* Header */}
      <header className="border-b border-gray-200/80 bg-white/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand shadow-brand">
              <ShoppingBag className="h-5 w-5 text-white" aria-hidden="true" />
            </div>
            <span className="text-lg font-bold text-gray-900">
              ClothingStore <span className="font-medium text-rose-500">POS</span>
            </span>
          </div>
          <span className="hidden items-center gap-2 text-sm text-gray-500 sm:flex">
            <Lock className="h-4 w-4" aria-hidden="true" />
            Your workspace. Your access.
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10 lg:py-14">
        <div className="mb-8">
          <ConfigNotification />
        </div>

        {/* Hero */}
        <section className="relative mb-10 overflow-hidden rounded-3xl bg-brand px-8 py-10 text-white shadow-brand sm:px-12 lg:py-14">
          <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-white/10" aria-hidden="true" />
          <div className="pointer-events-none absolute -bottom-24 right-40 h-60 w-60 rounded-full bg-white/10" aria-hidden="true" />
          <div className="relative grid items-center gap-8 lg:grid-cols-[1fr_auto]">
            <div>
              <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-sm font-medium backdrop-blur">
                <Heart className="h-4 w-4" aria-hidden="true" />
                A lovely day to do business
              </p>
              <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
                Your store,
                <br />
                <span className="text-white/85">in good hands.</span>
              </h1>
              <p className="mt-4 max-w-xl text-lg text-white/85">
                A little less admin. A little more doing what you love. Welcome
                to your ClothingStore workspace.
              </p>
            </div>
            <Image
              src="/pink-boutique.png"
              alt="Pink Boutique"
              width={260}
              height={260}
              className="hidden h-56 w-56 object-contain drop-shadow-2xl lg:block"
              priority
            />
          </div>
        </section>

        {/* Workspaces */}
        <section aria-label="Choose a workspace" className="grid gap-5 md:grid-cols-2">
          {/* Staff Card */}
          <Link
            href="/auth/staff/login"
            className="group flex flex-col rounded-3xl border border-gray-200/80 bg-white p-7 shadow-sm transition-all hover:-translate-y-0.5 hover:border-rose-200 hover:shadow-lg hover:shadow-rose-100/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:ring-offset-2"
          >
            <div className="mb-5 flex items-start justify-between">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-500">
                <Users className="h-6 w-6" aria-hidden="true" />
              </div>
              <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
                Store essentials
              </span>
            </div>
            <h2 className="text-2xl font-bold text-gray-900">Staff &amp; Manager</h2>
            <p className="mt-2 mb-6 leading-relaxed text-gray-500">
              Keep the shop running beautifully. Everything you need for a smooth
              day on the floor.
            </p>
            <span className="mt-auto flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand font-semibold text-white shadow-brand transition-all group-hover:bg-brand-strong">
              Sign in as Staff
              <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </span>
          </Link>

          {/* Owner Card */}
          <Link
            href="/auth/owner/login"
            className="group flex flex-col rounded-3xl border border-gray-200/80 bg-white p-7 shadow-sm transition-all hover:-translate-y-0.5 hover:border-rose-200 hover:shadow-lg hover:shadow-rose-100/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:ring-offset-2"
          >
            <div className="mb-5 flex items-start justify-between">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-500">
                <BarChart3 className="h-6 w-6" aria-hidden="true" />
              </div>
              <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
                Full access
              </span>
            </div>
            <h2 className="text-2xl font-bold text-gray-900">Owner</h2>
            <p className="mt-2 mb-6 leading-relaxed text-gray-500">
              See the bigger picture. Your people, performance, and business, all
              in one lovely place.
            </p>
            <span className="mt-auto flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-rose-50 font-semibold text-rose-700 ring-1 ring-inset ring-rose-200 transition-all group-hover:bg-rose-100">
              Sign in as Owner
              <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </span>
          </Link>
        </section>

        {/* Footer */}
        <footer className="mt-12 flex flex-col items-center justify-center gap-3 text-sm text-gray-400 sm:flex-row sm:gap-8">
          <span className="flex items-center gap-2">
            <Lock className="h-4 w-4" aria-hidden="true" />
            Your workspace. Your access.
          </span>
          <span className="flex items-center gap-2">
            <Heart className="h-4 w-4" aria-hidden="true" />
            Made for your everyday
          </span>
        </footer>
      </main>
    </div>
  );
}
