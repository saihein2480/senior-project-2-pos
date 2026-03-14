import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  updateProfile,
  signInWithPopup,
} from "firebase/auth";
import {
  doc,
  setDoc,
  getDoc,
  serverTimestamp,
  query,
  where,
  collection,
  getDocs,
} from "firebase/firestore";
import { auth, db, isFirebaseConfigured, googleProvider } from "@/lib/firebase";
import {
  User,
  UserRole,
  LoginCredentials,
  RegisterCredentials,
} from "@/types/auth";

class AuthService {
  private readonly USERS_COLLECTION = "users";

  /**
   * Login user with email and password
   */
  async login(credentials: LoginCredentials, role: UserRole): Promise<User> {
    this.validateFirebaseConfig();

    const { email, password } = credentials;

    try {
      const userCredential = await signInWithEmailAndPassword(
        auth!,
        email,
        password,
      );
      const userData = await this.getUserData(userCredential.user.uid);

      if (!userData) {
        throw new Error("User data not found. Please contact support.");
      }

      if (userData.role !== role) {
        await signOut(auth!);
        throw new Error(
          `Access denied. This account is not registered as a ${role}.`,
        );
      }

      return userData;
    } catch (error) {
      throw this.handleAuthError(error, "Login failed");
    }
  }

  /**
   * Sign in with Google OAuth
   */
  async signInWithGoogle(role: UserRole): Promise<User> {
    this.validateFirebaseConfig();

    try {
      const result = await signInWithPopup(auth!, googleProvider);
      const firebaseUser = result.user;

      let userData = await this.getUserData(firebaseUser.uid);

      if (userData) {
        if (userData.role !== role) {
          await signOut(auth!);
          throw new Error(
            `Access denied. This account is not registered as a ${role}.`,
          );
        }
        return userData;
      }

      // Create new user
      userData = {
        uid: firebaseUser.uid,
        email: firebaseUser.email!,
        displayName: firebaseUser.displayName || "Google User",
        role,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await this.createUserDocument(userData);
      return userData;
    } catch (error) {
      throw this.handleAuthError(error, "Google sign-in failed");
    }
  }

  /**
   * Register new customer
   */
  async register(credentials: RegisterCredentials): Promise<User> {
    this.validateFirebaseConfig();

    const { email, password, displayName } = credentials;

    try {
      const existingUser = await this.checkUserExists(email);
      if (existingUser) {
        throw new Error("An account with this email already exists.");
      }

      const userCredential = await createUserWithEmailAndPassword(
        auth!,
        email,
        password,
      );
      const firebaseUser = userCredential.user;

      await updateProfile(firebaseUser, { displayName });

      const userData: User = {
        uid: firebaseUser.uid,
        email: firebaseUser.email!,
        displayName,
        role: "customer",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await this.createUserDocument(userData);
      return userData;
    } catch (error) {
      throw this.handleAuthError(error, "Registration failed");
    }
  }

  /**
   * Create owner account (admin function)
   */
  async createOwnerAccount(
    email: string,
    password: string,
    displayName: string,
  ): Promise<User> {
    this.validateFirebaseConfig();

    try {
      const existingUser = await this.checkUserExists(email);
      if (existingUser) {
        throw new Error("An account with this email already exists.");
      }

      const userCredential = await createUserWithEmailAndPassword(
        auth!,
        email,
        password,
      );
      const firebaseUser = userCredential.user;

      await updateProfile(firebaseUser, { displayName });

      const userData: User = {
        uid: firebaseUser.uid,
        email: firebaseUser.email!,
        displayName,
        role: "owner",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await this.createUserDocument(userData);
      return userData;
    } catch (error) {
      throw this.handleAuthError(error, "Failed to create owner account");
    }
  }

  /**
   * Logout user
   */
  async logout(): Promise<void> {
    if (!isFirebaseConfigured || !auth) {
      return;
    }

    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout error:", error);
      throw new Error("Logout failed");
    }
  }

  /**
   * Get user data from Firestore
   */
  async getUserData(uid: string): Promise<User | null> {
    if (!isFirebaseConfigured || !db) {
      return null;
    }

    try {
      const userDoc = await getDoc(doc(db, this.USERS_COLLECTION, uid));

      if (!userDoc.exists()) {
        return null;
      }

      const data = userDoc.data();
      return {
        uid: data.uid,
        email: data.email,
        displayName: data.displayName,
        currentBranch: data.currentBranch || undefined,
        role: data.role,
        createdAt: data.createdAt?.toDate() || new Date(),
        updatedAt: data.updatedAt?.toDate() || new Date(),
      };
    } catch (error) {
      console.error("Error getting user data:", error);
      return null;
    }
  }

  /**
   * Validate Firebase configuration
   */
  private validateFirebaseConfig(): void {
    if (!isFirebaseConfigured || !auth || !db) {
      throw new Error("Firebase is not configured");
    }
  }

  /**
   * Create user document in Firestore
   */
  private async createUserDocument(userData: User): Promise<void> {
    try {
      const userDocRef = doc(db!, this.USERS_COLLECTION, userData.uid);
      const docData = {
        ...userData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      await setDoc(userDocRef, docData);
    } catch (error) {
      console.error("Error creating user document:", error);
      throw this.handleFirestoreError(error);
    }
  }

  /**
   * Check if user exists by email
   */
  private async checkUserExists(email: string): Promise<boolean> {
    try {
      const q = query(
        collection(db!, this.USERS_COLLECTION),
        where("email", "==", email),
      );
      const querySnapshot = await getDocs(q);
      return !querySnapshot.empty;
    } catch (error) {
      console.error("Error checking user existence:", error);
      return false;
    }
  }

  /**
   * Handle authentication errors
   */
  private handleAuthError(error: unknown, defaultMessage: string): Error {
    console.error("Auth error:", error);

    const authError = error as { code?: string; message?: string };

    if (authError?.code) {
      switch (authError.code) {
        case "auth/invalid-credential":
        case "auth/user-not-found":
        case "auth/wrong-password":
          return new Error(
            "Invalid email or password. Please check your credentials and try again.",
          );
        case "auth/too-many-requests":
          return new Error(
            "Too many failed login attempts. Please try again later.",
          );
        case "auth/user-disabled":
          return new Error(
            "This account has been disabled. Please contact your administrator.",
          );
        case "auth/email-already-in-use":
          return new Error("An account with this email already exists.");
        case "auth/invalid-email":
          return new Error("Please enter a valid email address.");
      }
    }

    if (error instanceof Error) {
      // Make sure not to show raw Firebase errors (e.g. Firebase: Error...)
      if (error.message.startsWith("Firebase:")) {
        return new Error(
          `${defaultMessage}. Please check your credentials and try again.`,
        );
      }
      return error;
    }

    return new Error(`${defaultMessage}. Please try again.`);
  }

  /**
   * Handle Firestore-specific errors
   */
  private handleFirestoreError(error: unknown): Error {
    const firebaseError = error as { code?: string; message?: string };

    switch (firebaseError?.code) {
      case "permission-denied":
        return new Error(
          "Permission denied. Please check Firestore security rules.",
        );
      case "unavailable":
        return new Error(
          "Firestore service is currently unavailable. Please try again.",
        );
      default:
        if (firebaseError?.message?.includes("net::ERR_ABORTED")) {
          return new Error(
            "Network connection error. Please check your internet connection and try again.",
          );
        }
        return new Error("Failed to create user profile. Please try again.");
    }
  }
}

export const authService = new AuthService();
