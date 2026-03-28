import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { CartProvider } from "@/contexts/CartContext";
import { CurrencyProvider } from "@/contexts/CurrencyContext";
import { SettingsProvider } from "@/contexts/SettingsContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { InstallPrompt } from "@/components/ui/InstallPrompt";
import { NumberInputGuard } from "@/components/ui/NumberInputGuard";
import { Toaster } from "react-hot-toast";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const viewport: Viewport = {
  themeColor: "#3b82f6",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export const metadata: Metadata = {
  title: "ClothingStore POS",
  description: "A modern point-of-sale system for clothing stores",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "ClothingStore POS",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} font-sans antialiased`}
        suppressHydrationWarning
      >
        <LanguageProvider>
          <AuthProvider>
            <SettingsProvider>
              <CurrencyProvider>
                <CartProvider>{children}</CartProvider>
              </CurrencyProvider>
            </SettingsProvider>
          </AuthProvider>
        </LanguageProvider>
        <InstallPrompt />
        <NumberInputGuard />
        <Toaster position="top-center" />
        <SpeedInsights />
      </body>
    </html>
  );
}
