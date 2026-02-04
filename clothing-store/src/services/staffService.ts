import {
  collection,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  query,
  where,
  Timestamp,
  getDoc,
  setDoc,
} from "firebase/firestore";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { User, UserRole } from "@/types/auth";

const USERS_COLLECTION = "users";

interface CreateStaffData {
  email: string;
  password: string;
  displayName: string;
  role: UserRole;
}

export const createStaffAccount = async (
  data: CreateStaffData,
): Promise<User> => {
  try {
    if (!auth) {
      throw new Error("Auth not initialized");
    }
    if (!db) {
      throw new Error("Database not initialized");
    }

    // Create Firebase Auth account
    const userCredential = await createUserWithEmailAndPassword(
      auth,
      data.email,
      data.password,
    );

    const userId = userCredential.user.uid;

    // Create user document in Firestore using uid as document ID
    const userData = {
      uid: userId,
      email: data.email,
      displayName: data.displayName,
      role: data.role,
      isActive: true,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      createdBy: auth.currentUser?.uid || "",
    };

    await setDoc(doc(db, USERS_COLLECTION, userId), userData);

    return {
      uid: userId,
      email: data.email,
      displayName: data.displayName,
      role: data.role,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: auth.currentUser?.uid || "",
    };
  } catch (error) {
    console.error("Error creating staff account:", error);
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "auth/email-already-in-use"
    ) {
      throw new Error("Email is already in use");
    }
    throw error;
  }
};

export const getAllStaff = async (): Promise<User[]> => {
  try {
    if (!db) {
      throw new Error("Database not initialized");
    }

    // Query without orderBy to avoid composite index requirement
    const q = query(
      collection(db, USERS_COLLECTION),
      where("role", "in", ["manager", "staff"]),
    );

    const querySnapshot = await getDocs(q);

    const staffList = querySnapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id, // Document ID (which is now uid)
        uid: data.uid,
        email: data.email,
        displayName: data.displayName,
        role: data.role,
        isActive: data.isActive !== false,
        createdAt: data.createdAt?.toDate() || new Date(),
        updatedAt: data.updatedAt?.toDate() || new Date(),
        createdBy: data.createdBy,
      };
    });

    // Sort in memory by createdAt descending
    return staffList.sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
  } catch (error) {
    console.error("Error getting staff:", error);
    // Return empty array instead of throwing to prevent UI from breaking
    return [];
  }
};

export const updateStaff = async (
  id: string,
  updates: Partial<User> & { currentBranch?: string },
): Promise<User | null> => {
  try {
    if (!db) {
      throw new Error("Database not initialized");
    }

    const updateData: Record<string, unknown> = {
      updatedAt: Timestamp.now(),
    };

    if (updates.displayName !== undefined)
      updateData.displayName = updates.displayName;
    if (updates.role !== undefined) updateData.role = updates.role;
    if (updates.isActive !== undefined) updateData.isActive = updates.isActive;
    if (updates.currentBranch !== undefined)
      updateData.currentBranch = updates.currentBranch;

    await updateDoc(doc(db, USERS_COLLECTION, id), updateData);
    // Return the updated user document
    const updatedDoc = await getDoc(doc(db, USERS_COLLECTION, id));
    if (!updatedDoc.exists()) return null;
    const data = updatedDoc.data();
    return {
      uid: data.uid || updatedDoc.id,
      email: data.email,
      displayName: data.displayName,
      role: data.role,
      currentBranch: data.currentBranch,
      isActive: data.isActive !== false,
      createdAt: data.createdAt?.toDate() || new Date(),
      updatedAt: data.updatedAt?.toDate() || new Date(),
      createdBy: data.createdBy,
    } as User;
  } catch (error) {
    console.error("Error updating staff:", error);
    throw error;
  }
};

// Change the return type of the function to Promise<User | null>

export const deleteStaff = async (uid: string): Promise<void> => {
  try {
    if (!db) {
      throw new Error("Database not initialized");
    }

    // Get the user document
    const docRef = doc(db, USERS_COLLECTION, uid);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      // Note: Firebase Admin SDK is needed to delete Auth users
      // For now, we'll just delete the Firestore document
      // In production, you should use Firebase Admin SDK to delete the auth user
      await deleteDoc(docRef);
    }
  } catch (error) {
    console.error("Error deleting staff:", error);
    throw error;
  }
};
