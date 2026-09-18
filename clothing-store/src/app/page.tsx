"use client";

import Link from "next/link";
import Image from "next/image";
import ConfigNotification from "@/components/ui/ConfigNotification";

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 via-rose-50 to-pink-100">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-r from-pink-500 to-rose-500 rounded-full flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
              </svg>
            </div>
            <div>
              <span className="text-xl font-bold text-gray-900">ClothingStore</span>
              <span className="text-xl font-light text-gray-500 ml-1">POS</span>
            </div>
          </div>
          
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-12">
        {/* Config Notification */}
        <div className="mb-8">
          <ConfigNotification />
        </div>

        {/* Hero Section */}
        <div className="grid lg:grid-cols-2 gap-12 items-center mb-16">
          <div>
            <p className="text-pink-600 text-sm font-medium mb-4 flex items-center gap-2">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
              </svg>
              A lovely day to do business
            </p>
            <h1 className="text-5xl font-bold text-gray-900 mb-2">
              Your store,
            </h1>
            <h1 className="text-5xl font-bold text-pink-600 mb-6">
              in good hands.
            </h1>
            <p className="text-gray-600 text-lg mb-2">
              A little less admin. A little more doing what you love.
            </p>
            <p className="text-gray-600 text-lg">
              Welcome to your ClothingStore workspace.
            </p>
          </div>
          <div className="flex justify-center lg:justify-end">
            <Image 
              src="/pink-boutique.png" 
              alt="Pink Boutique" 
              width={400}
              height={400}
              className="object-contain"
              priority
            />
          </div>
        </div>

       

        {/* Cards */}
        <div className="grid md:grid-cols-2 gap-6 max-w-5xl">
          {/* Staff Card */}
          <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-6">
              <div className="w-12 h-12 bg-pink-50 rounded-xl flex items-center justify-center">
                <svg className="w-6 h-6 text-pink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <span className="text-xs text-gray-500 bg-gray-50 px-3 py-1 rounded-full">Store essentials</span>
            </div>

            <h3 className="text-2xl font-bold text-gray-900 mb-3">Staff & Manager</h3>
            <p className="text-gray-600 mb-6 leading-relaxed">
              Keep the shop running beautifully. Everything you need for a smooth day on the floor.
            </p>

            

            <Link href="/auth/staff/login">
              <button className="w-full bg-gradient-to-r from-pink-500 to-rose-500 text-white py-3 px-6 rounded-xl font-semibold hover:from-pink-600 hover:to-rose-600 transition-all shadow-sm flex items-center justify-center gap-2">
                Sign in as Staff
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </button>
            </Link>
          </div>

          {/* Owner Card */}
          <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-6">
              <div className="w-12 h-12 bg-pink-50 rounded-xl flex items-center justify-center">
                <svg className="w-6 h-6 text-pink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <span className="text-xs text-gray-500 bg-gray-50 px-3 py-1 rounded-full">Full access</span>
            </div>

            <h3 className="text-2xl font-bold text-gray-900 mb-3">Owner</h3>
            <p className="text-gray-600 mb-6 leading-relaxed">
              See the bigger picture. Your people, performance, and business, all in one lovely place.
            </p>


            <Link href="/auth/owner/login">
              <button className="w-full bg-pink-100 text-pink-700 py-3 px-6 rounded-xl font-semibold hover:bg-pink-200 transition-all flex items-center justify-center gap-2">
                Sign in as Owner
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </button>
            </Link>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-center gap-8 mt-12 text-sm text-gray-500">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            Your workspace. Your access.
          </div>
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
            </svg>
            Made for your everyday
          </div>
        </div>
      </main>
    </div>
  );
}
