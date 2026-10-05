"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, User as FirebaseUser } from "firebase/auth";
import { auth, isFirebaseConfigured } from "@/lib/firebase";
import {
  AuthContextType,
  User,
  UserRole,
  LoginCredentials,
  RegisterCredentials,
} from "@/types/auth";
import { authService } from "@/services/authService";
import { logActivity } from "@/lib/activityClient";

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

interface AuthProviderProps {
  children: React.ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSigningInWithGoogle, setIsSigningInWithGoogle] = useState(false);

  useEffect(() => {
    if (!isFirebaseConfigured || !auth) {
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(
      auth,
      async (firebaseUser: FirebaseUser | null) => {
        try {
          console.log(
            "onAuthStateChanged triggered, firebaseUser:",
            firebaseUser?.uid
          );
          if (firebaseUser) {
            // Get user data from Firestore
            console.log(
              "Getting user data from Firestore for uid:",
              firebaseUser.uid
            );
            const userData = await authService.getUserData(firebaseUser.uid);
            console.log("Retrieved userData from Firestore:", userData);
            if (userData) {
              console.log("Setting user in AuthContext:", userData);
              setUser(userData);
            } else {
              console.log("No user data found in Firestore");
              // Don't immediately sign out if we're in the middle of Google sign-in
              if (!isSigningInWithGoogle) {
                console.log("Not in Google sign-in process, signing out...");
                await authService.logout();
              } else {
                console.log(
                  "Google sign-in in progress, waiting for user document creation..."
                );
              }
              setUser(null);
            }
          } else {
            console.log("No firebaseUser, setting user to null");
            setUser(null);
          }
        } catch (err) {
          console.error("Error in auth state change:", err);
          setError("Failed to load user data");
          setUser(null);
        } finally {
          setLoading(false);
        }
      }
    );

    return () => unsubscribe();
  }, []);

  const login = async (credentials: LoginCredentials, role: UserRole) => {
    if (!isFirebaseConfigured) {
      setError(
        "Firebase is not configured. Please check your environment variables."
      );
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const userData = await authService.login(credentials, role);
      setUser(userData);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Login failed";
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const register = async (credentials: RegisterCredentials) => {
    if (!isFirebaseConfigured) {
      setError(
        "Firebase is not configured. Please check your environment variables."
      );
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const userData = await authService.register(credentials);
      setUser(userData);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Registration failed";
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const signInWithGoogle = async (role: UserRole) => {
    console.log("AuthContext signInWithGoogle called with role:", role);
    if (!isFirebaseConfigured) {
      setError(
        "Firebase is not configured. Please check your environment variables."
      );
      return;
    }
    try {
      setLoading(true);
      setError(null);
      setIsSigningInWithGoogle(true);
      console.log("Calling authService.signInWithGoogle...");
      const userData = await authService.signInWithGoogle(role);
      console.log("AuthContext received userData:", userData);
      setUser(userData);
      console.log("AuthContext setUser completed");
    } catch (err) {
      console.error("AuthContext signInWithGoogle error:", err);
      const errorMessage =
        err instanceof Error ? err.message : "Google sign-in failed";
      setError(errorMessage);
      throw err;
    } finally {
      setIsSigningInWithGoogle(false);
      setLoading(false);
    }
  };

  const logout = async () => {
    if (!isFirebaseConfigured) {
      setUser(null);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      // Reported while still signed in (the server needs the ID token), and
      // capped at 2s so a slow network never holds up signing out.
      if (user && user.role !== "customer") {
        await logActivity({ action: "auth.signOut" }, 2000);
      }
      await authService.logout();
      setUser(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Logout failed";
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const clearError = () => {
    setError(null);
  };

  const value: AuthContextType = {
    user,
    loading,
    error,
    login,
    register,
    signInWithGoogle,
    logout,
    clearError,
    setUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
