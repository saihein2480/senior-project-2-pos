"use client";

import React, { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, Mail, Lock, ArrowRight, BarChart3 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { loginSchema, LoginFormData } from "@/types/schemas";
import { Alert } from "@/components/ui/Alert";
import { AuthShell, authInputClass, authSubmitClass } from "./AuthShell";

export function OwnerLogin() {
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { login, error, clearError, user } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();

  useEffect(() => {
    if (user && user.role === "owner") {
      // Dashboard, not Home: it matches what submitting the form does, and an
      // owner who has hidden the walk-in POS in Settings no longer has Home in
      // their menu.
      router.push("/owner/dashboard");
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
    try {
      setIsLoading(true);
      clearError();
      await login(data, "owner");
      router.push("/owner/dashboard");
    } catch (error) {
      // Error is handled by the auth context
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthShell
      taglines={[t.loginTaglineOne, t.loginTaglineTwo, t.loginTaglineThree]}
      blurb={t.ownerLoginBlurb}
      footnote={t.madeForTheBusinessYouLove}
      backLabel={t.backToWorkspaces}
      footerNote={t.loginFooterNote}
    >
      {/* Account Badge */}
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-500">
          <BarChart3 className="h-6 w-6" aria-hidden="true" />
        </div>
        <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-600 ring-1 ring-inset ring-rose-200">
          {t.ownerAccount}
        </span>
      </div>

      <h2 className="text-3xl font-bold tracking-tight text-gray-900">
        {t.helloAgain}
      </h2>
      <p className="mt-1.5 mb-7 text-sm text-gray-500">{t.ownerLoginSubtitle}</p>

      <form className="space-y-5" onSubmit={handleSubmit(onSubmit)} noValidate>
        {error && <Alert type="error" message={error} onClose={clearError} />}

        <div>
          <label
            htmlFor="owner-email"
            className="mb-1.5 block text-sm font-semibold text-gray-800"
          >
            {t.emailAddress}
          </label>
          <div className="relative">
            <Mail
              className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400"
              aria-hidden="true"
            />
            <input
              {...register("email")}
              id="owner-email"
              type="email"
              className={`${authInputClass} pr-4`}
              placeholder={t.emailPlaceholder}
              autoComplete="email"
              aria-invalid={errors.email ? true : undefined}
            />
          </div>
          {errors.email && (
            <p className="mt-1.5 text-sm text-red-600">{errors.email.message}</p>
          )}
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label
              htmlFor="owner-password"
              className="block text-sm font-semibold text-gray-800"
            >
              {t.password}
            </label>
            <button
              type="button"
              className="text-sm font-medium text-rose-600 hover:text-rose-700"
            >
              {t.forgotPassword}
            </button>
          </div>
          <div className="relative">
            <Lock
              className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400"
              aria-hidden="true"
            />
            <input
              {...register("password")}
              id="owner-password"
              type={showPassword ? "text" : "password"}
              className={`${authInputClass} pr-12`}
              placeholder={t.passwordPlaceholder}
              autoComplete="current-password"
              aria-invalid={errors.password ? true : undefined}
            />
            <button
              type="button"
              aria-label={showPassword ? t.hidePassword : t.showPassword}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
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
            <p className="mt-1.5 text-sm text-red-600">{errors.password.message}</p>
          )}
        </div>

        <button type="submit" disabled={isLoading} className={authSubmitClass}>
          {isLoading && (
            <span
              className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
              aria-hidden="true"
            />
          )}
          {isLoading ? t.signingIn : t.signIn}
          {!isLoading && <ArrowRight className="h-5 w-5" aria-hidden="true" />}
        </button>

        <div className="border-t border-gray-100 pt-5 text-center">
          <p className="mb-1 text-sm text-gray-500">{t.partOfStoreTeam}</p>
          <Link
            href="/auth/staff/login"
            className="inline-flex items-center gap-1 text-sm font-semibold text-rose-600 hover:text-rose-700"
          >
            {t.signInAsStaff}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </form>
    </AuthShell>
  );
}
