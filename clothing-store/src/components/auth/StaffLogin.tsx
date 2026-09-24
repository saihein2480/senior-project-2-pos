"use client";

import React, { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { loginSchema, LoginFormData } from "@/types/schemas";
import { Alert } from "@/components/ui/Alert";
import { authService } from "@/services/authService";

export function StaffLogin() {
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const { user, setUser } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();

  useEffect(() => {
    if (user) {
      if (user.role === "manager" || user.role === "staff") {
        router.push("/owner/home");
      } else if (user.role === "owner") {
        router.push("/owner/dashboard");
      }
    }
  }, [user, router]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true);
    setLocalError(null);

    try {
      const originalConsoleError = console.error;
      console.error = () => {};

      try {
        const userData = await authService.login(data, "manager");
        console.error = originalConsoleError;
        setUser(userData);
        router.push("/owner/home");
        return;
      } catch (managerError) {
        console.error = originalConsoleError;
      }

      try {
        const userData = await authService.login(data, "staff");
        setUser(userData);
        router.push("/owner/home");
        return;
      } catch (staffError) {
        const errorMessage =
          staffError instanceof Error ? staffError.message : t.loginFailed;
        setLocalError(errorMessage);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
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
      <div className="flex-1 flex">
        {/* Left Side - Hero */}
        <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-pink-50 via-rose-50 to-pink-100 p-12 flex-col justify-between">
          <Link href="/" className="mb-8 flex items-center gap-2 text-gray-700 hover:text-gray-900 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            {t.backToWorkspaces}
          </Link>

          <div>
            <h1 className="text-5xl font-bold text-gray-900 mb-2">
              {t.staffTaglineOne}
            </h1>
            <h1 className="text-5xl font-bold text-gray-900 mb-2">
              {t.staffTaglineTwo}
            </h1>
            <h1 className="text-5xl font-bold text-pink-600 mb-6">
              {t.staffTaglineThree}
            </h1>
            <p className="text-gray-600 text-lg mb-12">{t.staffLoginBlurb}</p>

            <div className="flex justify-center mb-8">
              <Image 
                src="/pink-boutique.png" 
                alt="Pink Boutique" 
                width={300}
                height={300}
                className="object-contain"
              />
            </div>
          </div>

          <p className="text-gray-500 text-sm flex items-center gap-2">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
            </svg>
            {t.madeForYourEveryday}
          </p>
        </div>

        {/* Right Side - Form */}
        <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-white">
          <div className="max-w-md w-full">
            {/* Mobile Back Button */}
            <Link href="/" className="lg:hidden flex items-center gap-2 text-gray-700 hover:text-gray-900 transition-colors mb-8">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              {t.backToWorkspaces}
            </Link>

            {/* Account Badge */}
            <div className="flex justify-center mb-8">
              <div className="w-16 h-16 bg-pink-50 rounded-2xl flex items-center justify-center">
                <svg className="w-8 h-8 text-pink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
            </div>

            <p className="text-center text-pink-600 text-sm font-medium mb-4">
              {t.staffAccount}
            </p>
            <h2 className="text-4xl font-bold text-gray-900 text-center mb-2">
              {t.helloAgain}
            </h2>
            <p className="text-gray-600 text-center mb-8">
              {t.staffLoginSubtitle}
            </p>

            <form className="space-y-6" onSubmit={handleSubmit(onSubmit)}>
              {localError && (
                <Alert
                  type="error"
                  message={localError}
                  onClose={() => setLocalError(null)}
                />
              )}

              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  {t.emailAddress}
                </label>
                <div className="relative">
                  <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <input
                    {...register("email")}
                    type="email"
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent text-gray-900 placeholder-gray-400"
                    placeholder={t.emailPlaceholder}
                    autoComplete="email"
                  />
                </div>
                {errors.email && (
                  <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-semibold text-gray-900">
                    {t.password}
                  </label>
                  <button type="button" className="text-sm text-pink-600 hover:text-pink-700 font-medium">
                    {t.forgotPassword}
                  </button>
                </div>
                <div className="relative">
                  <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <input
                    {...register("password")}
                    type={showPassword ? "text" : "password"}
                    className="w-full pl-10 pr-12 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent text-gray-900 placeholder-gray-400"
                    placeholder={t.passwordPlaceholder}
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? t.hidePassword : t.showPassword}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? (
                      <EyeOff className="h-5 w-5" />
                    ) : (
                      <Eye className="h-5 w-5" />
                    )}
                  </button>
                </div>
                {errors.password && (
                  <p className="mt-1 text-sm text-red-600">{errors.password.message}</p>
                )}
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-gradient-to-r from-pink-500 to-rose-500 text-white py-3 px-6 rounded-lg font-semibold hover:from-pink-600 hover:to-rose-600 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isLoading ? t.signingIn : t.signIn}
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </button>

              <div className="text-center">
                <p className="text-sm text-gray-600 mb-2">
                  {t.areYouTheOwner}
                </p>
                <Link
                  href="/auth/owner/login"
                  className="text-pink-600 hover:text-pink-700 font-medium text-sm inline-flex items-center gap-1"
                >
                  {t.signInAsOwner}
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                </Link>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 py-4">
        <p className="text-center text-sm text-gray-500">
          © 2026 ClothingStore POS · {t.loginFooterNote}
        </p>
      </footer>
    </div>
  );
}
