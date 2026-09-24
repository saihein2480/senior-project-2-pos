"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  useCallback,
  ReactNode,
} from "react";
import { Language, Translations, translations } from "@/lib/translations";

interface LanguageContextType {
  language: Language;
  setLanguage: (language: Language) => void;
  t: Translations;
}

const LanguageContext = createContext<LanguageContextType | undefined>(
  undefined,
);

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}

interface LanguageProviderProps {
  children: ReactNode;
}

const STORAGE_KEY = "preferredLanguage";

/**
 * Broadcast so every provider instance and any non-React listener follows a
 * language change in the same tab. `storage` events only reach other tabs.
 */
const LANGUAGE_CHANGED_EVENT = "posLanguageChanged";

function isLanguage(value: unknown): value is Language {
  return value === "en" || value === "my";
}

export function LanguageProvider({ children }: LanguageProviderProps) {
  const [language, setLanguageState] = useState<Language>("en");

  const applyDocumentLanguage = useCallback((next: Language) => {
    if (typeof document === "undefined") return;
    // Screen readers and the browser's own font fallback both rely on this to
    // render Burmese correctly.
    document.documentElement.lang = next;
  }, []);

  // Restore the saved preference, and follow changes from other tabs.
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(STORAGE_KEY);
    } catch {
      // Private browsing can refuse localStorage; English is a fine default.
    }

    if (isLanguage(saved)) {
      setLanguageState(saved);
      applyDocumentLanguage(saved);
    } else {
      applyDocumentLanguage("en");
    }

    const handleSameTab = (event: Event) => {
      const next = (event as CustomEvent<Language>).detail;
      if (isLanguage(next)) {
        setLanguageState(next);
        applyDocumentLanguage(next);
      }
    };

    const handleOtherTab = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return;
      if (isLanguage(event.newValue)) {
        setLanguageState(event.newValue);
        applyDocumentLanguage(event.newValue);
      }
    };

    window.addEventListener(LANGUAGE_CHANGED_EVENT, handleSameTab);
    window.addEventListener("storage", handleOtherTab);

    return () => {
      window.removeEventListener(LANGUAGE_CHANGED_EVENT, handleSameTab);
      window.removeEventListener("storage", handleOtherTab);
    };
  }, [applyDocumentLanguage]);

  const setLanguage = useCallback(
    (newLanguage: Language) => {
      setLanguageState(newLanguage);
      applyDocumentLanguage(newLanguage);

      try {
        localStorage.setItem(STORAGE_KEY, newLanguage);
      } catch {
        // The choice still applies for this session even if it can't persist.
      }

      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent(LANGUAGE_CHANGED_EVENT, { detail: newLanguage }),
        );
      }
    },
    [applyDocumentLanguage],
  );

  // Memoized so switching language is the only thing that re-renders consumers.
  const value = useMemo<LanguageContextType>(
    () => ({
      language,
      setLanguage,
      t: translations[language],
    }),
    [language, setLanguage],
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}
