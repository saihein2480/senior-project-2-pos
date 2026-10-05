import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { ViewModeProvider } from "@/contexts/ViewModeContext";
import { CartProvider } from "@/contexts/CartContext";
import { CurrencyProvider } from "@/contexts/CurrencyContext";
import { SettingsProvider } from "@/contexts/SettingsContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { NumberInputGuard } from "@/components/ui/NumberInputGuard";
import { Toaster } from "react-hot-toast";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const viewport: Viewport = {
  // Brand rose (rose-500), matching the rose -> pink theme.
  themeColor: "#f43f5e",
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
            <ViewModeProvider>
              <SettingsProvider>
                <CurrencyProvider>
                  <CartProvider>{children}</CartProvider>
                </CurrencyProvider>
              </SettingsProvider>
            </ViewModeProvider>
          </AuthProvider>
        </LanguageProvider>
        <NumberInputGuard />
        <Toaster
          position="top-center"
          containerStyle={{ zIndex: 100000 }}
          toastOptions={{
            style: {
              borderRadius: "12px",
              border: "1px solid #ececf0",
              boxShadow: "0 10px 30px -10px rgb(16 24 40 / 0.25)",
              color: "#111827",
              fontSize: "14px",
              padding: "10px 14px",
            },
            success: { iconTheme: { primary: "#16a34a", secondary: "#fff" } },
            error: { iconTheme: { primary: "#e11d48", secondary: "#fff" } },
          }}
        />
        <SpeedInsights />
      </body>
    </html>
  );
}
