"use client";

import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useCart } from "@/contexts/CartContext";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useSettings } from "@/contexts/SettingsContext";
import {
  LogOut,
  ChevronDown,
  ShoppingCart,
  Globe,
  Store,
  Menu,
} from "lucide-react";
import { ShoppingCartModal } from "./ShoppingCartModal";

interface TopNavBarProps {
  onCartModalStateChange?: (isOpen: boolean) => void;
  onMenuToggle?: () => void;
}

export function TopNavBar({
  onCartModalStateChange,
  onMenuToggle,
}: TopNavBarProps) {
  const { user, logout } = useAuth();
  const { getCartItemCount } = useCart();
  const {
    selectedCurrency,
    setSelectedCurrency,
    defaultCurrency,
    getCurrencySymbol,
  } = useCurrency();
  const { businessSettings } = useSettings();
  const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState(false);
  const [isLanguageDropdownOpen, setIsLanguageDropdownOpen] = useState(false);
  const [isCurrencyDropdownOpen, setIsCurrencyDropdownOpen] = useState(false);
  const [isCartModalOpen, setIsCartModalOpen] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState("English");
  const languageDropdownRef = useRef<HTMLDivElement>(null);
  const currencyDropdownRef = useRef<HTMLDivElement>(null);
  const profileDropdownRef = useRef<HTMLDivElement>(null);

  const languages = [
    { name: "English", flag: "🇺🇸", code: "EN" },
    { name: "Burmese", flag: "🇲🇲", code: "MM" },
  ];

  const currencies = [
    { code: "MMK", name: "Myanmar Kyat", symbol: "Ks" },
    { code: "THB", name: "Thai Baht", symbol: "฿" },
  ];

  const handleLanguageChange = (language: string) => {
    setSelectedLanguage(language);
    setIsLanguageDropdownOpen(false);
    console.log("Language changed to:", language);
  };

  const handleCurrencyChange = (currency: "THB" | "MMK") => {
    setSelectedCurrency(currency);
    setIsCurrencyDropdownOpen(false);
    console.log("Currency changed to:", currency);
  };

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        profileDropdownRef.current &&
        !profileDropdownRef.current.contains(event.target as Node)
      ) {
        setIsProfileDropdownOpen(false);
      }
      if (
        languageDropdownRef.current &&
        !languageDropdownRef.current.contains(event.target as Node)
      ) {
        setIsLanguageDropdownOpen(false);
      }
      if (
        currencyDropdownRef.current &&
        !currencyDropdownRef.current.contains(event.target as Node)
      ) {
        setIsCurrencyDropdownOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  return (
    <header className="sticky top-0 z-10 bg-white shadow border-b border-gray-200">
      <div className="px-4">
        <div className="flex justify-between items-center py-6">
          <div className="flex items-center">
            <button
              onClick={() => onMenuToggle?.()}
              className="mr-3 p-2 rounded-md hover:bg-gray-100 md:hidden"
              aria-label="Toggle menu"
            >
              <Menu className="w-6 h-6 text-gray-700" />
            </button>

            <h1 className="text-2xl font-bold text-gray-900">
              {user?.displayName || user?.email || "Owner"}
            </h1>
          </div>
          <div className="flex items-center space-x-6">
              {/* Current Branch/Shop Display */}
              <div className="flex items-center space-x-2 px-3 py-2 bg-white border rounded-full border-gray-300 ">
                <Store className="w-4 h-4 text-gray-600" />
                <span className="text-sm font-medium text-gray-700">
                  {businessSettings?.currentBranch === "No Branch"
                    ? "No Branch"
                    : businessSettings?.currentBranch || "Main Branch"}
                </span>
              </div>
            {/* Date Display */}
            <div className="text-sm text-gray-600">
              {new Date().toLocaleDateString("en-US", {
                weekday: "short",
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </div>


            {/* Main Currency Title */}
            <div className="flex items-center space-x-1 px-3 py-2 bg-white border-gray-300 rounded-lg">
              <span className="text-sm font-semibold text-gray-800">
                Main Currency:
              </span>
              <span className="text-sm font-bold text-blue-900">
                {getCurrencySymbol(defaultCurrency)} {defaultCurrency}
              </span>
            </div>

            {/* Currency Selector (clean pill + simple dropdown) */}
            <div className="relative" ref={currencyDropdownRef}>
              <button
                onClick={() =>
                  setIsCurrencyDropdownOpen(!isCurrencyDropdownOpen)
                }
                aria-haspopup="menu"
                aria-expanded={isCurrencyDropdownOpen}
                className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-400  hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-200"
              >
                <span className="text-sm font-semibold text-gray-800">
                  {currencies.find((c) => c.code === selectedCurrency)?.symbol}
                </span>
                <span className="text-xs text-gray-500">
                  {selectedCurrency}
                </span>
                <ChevronDown
                  className={`w-4 h-4 text-gray-600 transition-transform ${
                    isCurrencyDropdownOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {isCurrencyDropdownOpen && (
                <div
                  role="menu"
                  aria-orientation="vertical"
                  className="absolute right-0 mt-2 w-40 bg-white rounded-md shadow-lg border border-gray-200 py-1 z-50"
                >
                  {currencies.map((currency) => {
                    const isSelected = selectedCurrency === currency.code;
                    return (
                      <button
                        key={currency.code}
                        role="menuitem"
                        onClick={() =>
                          handleCurrencyChange(currency.code as "THB" | "MMK")
                        }
                        className={`w-full flex items-center justify-between px-3 py-2 text-sm transition-colors ${
                          isSelected
                            ? "bg-blue-50 text-blue-700"
                            : "text-gray-700 hover:bg-gray-50"
                        }`}
                      >
                        <div className="flex flex-col text-left">
                          <span className="font-medium">{currency.code}</span>
                          <span className="text-xs text-gray-500">
                            {currency.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{currency.symbol}</span>
                          {/* {isSelected && (
                            <span className="text-blue-600">✓</span>
                          )} */}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Language Selector (compact pill + dropdown) */}
            <div className="relative" ref={languageDropdownRef}>
              <button
                title="language"
                onClick={() =>
                  setIsLanguageDropdownOpen(!isLanguageDropdownOpen)
                }
                aria-haspopup="menu"
                aria-expanded={isLanguageDropdownOpen}
                className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-400 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-200"
              >
                <span className="text-sm font-medium text-gray-700">
                  {selectedLanguage}
                </span>
                <ChevronDown
                  className={`w-4 h-4 text-gray-600 transition-transform ${
                    isLanguageDropdownOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {isLanguageDropdownOpen && (
                <div
                  role="menu"
                  aria-orientation="vertical"
                  className="absolute right-0 mt-2 w-40 bg-white rounded-md shadow-lg border border-gray-200 py-1 z-50"
                >
                  {languages.map((language) => {
                    const isSelected = selectedLanguage === language.name;
                    return (
                      <button
                        key={language.code}
                        role="menuitem"
                        onClick={() => handleLanguageChange(language.name)}
                        className={`w-full flex items-center justify-between gap-3 px-3 py-2 text-sm transition-colors ${
                          isSelected
                            ? "bg-blue-50 text-blue-700"
                            : "text-gray-700 hover:bg-gray-50"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-lg">{language.flag}</span>
                          <div className="text-left">
                            <div className="font-medium">{language.name}</div>
                            <div className="text-xs text-gray-500">
                              {language.code}
                            </div>
                          </div>
                        </div>
                        {/* {isSelected && <span className="text-blue-600">✓</span>} */}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Shopping Cart */}
            <div
              className="relative cursor-pointer"
              onClick={() => {
                setIsCartModalOpen(true);
                onCartModalStateChange?.(true);
              }}
            >
              <ShoppingCart className="h-6 w-6 text-gray-700 hover:text-gray-900" />
              <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                {getCartItemCount()}
              </span>
            </div>

            {/* User Profile Dropdown */}
            <div className="relative" ref={profileDropdownRef}>
              <button
                onClick={() => setIsProfileDropdownOpen(!isProfileDropdownOpen)}
                className="flex items-center space-x-2 focus:outline-none"
              >
                <div className="w-9 h-9 bg-gradient-to-br from-blue-400 to-blue-600 rounded-full flex items-center justify-center hover:from-blue-500 hover:to-blue-700 transition-colors">
                  <span className="text-white text-xl font-medium">
                    {(user?.displayName || user?.email || "U")
                      .charAt(0)
                      .toUpperCase()}
                  </span>
                </div>
                <ChevronDown
                  className={`h-4 w-4 text-gray-500 transition-transform ${
                    isProfileDropdownOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {/* Dropdown Menu */}
              {isProfileDropdownOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg border border-gray-200 py-1 z-50">
                  <div className="px-4 py-2 border-b border-gray-100">
                    <p className="text-sm font-medium text-gray-900">
                      {user?.displayName || "User"}
                    </p>
                    <p className="text-xs text-gray-500">{user?.email}</p>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center"
                  >
                    <LogOut className="h-4 w-4 mr-2" />
                    Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Shopping Cart Modal */}
      <ShoppingCartModal
        isOpen={isCartModalOpen}
        onClose={() => {
          setIsCartModalOpen(false);
          onCartModalStateChange?.(false);
        }}
      />
    </header>
  );
}
