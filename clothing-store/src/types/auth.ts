export type UserRole = "customer" | "owner" | "manager" | "staff";

export interface User {
  uid: string;
  email: string;
  displayName?: string;
  role: UserRole;
  currentBranch?: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string; // ID of the owner who created this account
  isActive?: boolean; // To enable/disable accounts
}

export interface AuthState {
  user: User | null;
  loading: boolean;
  error: string | null;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterCredentials extends LoginCredentials {
  displayName: string;
  confirmPassword: string;
}

export interface AuthContextType {
  user: User | null;
  loading: boolean;
  error: string | null;
  login: (credentials: LoginCredentials, role: UserRole) => Promise<void>;
  register: (credentials: RegisterCredentials) => Promise<void>;
  signInWithGoogle: (role: UserRole) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
  setUser: (user: User | null) => void;
}

export interface FirebaseUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  emailVerified: boolean;
}
