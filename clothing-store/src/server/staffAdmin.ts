/**
 * Staff account management through the Admin SDK (server only).
 *
 * Replaces the client-SDK calls /api/staff used to make. Creating the Auth
 * account with `adminAuth.createUser` also stops the old side effect where
 * `createUserWithEmailAndPassword` signed the new account in on the server.
 */

import { Timestamp, type DocumentData } from "firebase-admin/firestore";
import type { User, UserRole } from "@/types/auth";
import { getAdminAuth, getAdminDb } from "./adminDb";
import { ApiError } from "./errors";

const USERS_COLLECTION = "users";

/** Roles this module may create, assign, edit or delete. */
const MANAGED_ROLES: UserRole[] = ["manager", "staff"];

/** Shape returned by GET /api/staff (the page keys rows by `id`). */
export type StaffUser = User & { id: string };

export interface CreateStaffInput {
  email: string;
  password: string;
  displayName: string;
  role: UserRole;
}

function toDate(value: unknown): Date {
  if (value instanceof Timestamp) return value.toDate();
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return new Date();
}

function errorCode(error: unknown): string | undefined {
  return error && typeof error === "object" && "code" in error
    ? String((error as { code: unknown }).code)
    : undefined;
}

export async function listStaff(): Promise<StaffUser[]> {
  const db = getAdminDb();

  // No orderBy, to avoid needing a composite index; sorted below.
  const snapshot = await db
    .collection(USERS_COLLECTION)
    .where("role", "in", MANAGED_ROLES)
    .get();

  const staffList: StaffUser[] = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      uid: data.uid,
      email: data.email,
      displayName: data.displayName,
      role: data.role,
      isActive: data.isActive !== false,
      createdAt: toDate(data.createdAt),
      updatedAt: toDate(data.updatedAt),
      createdBy: data.createdBy,
    };
  });

  return staffList.sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  );
}

export async function createStaff(
  input: CreateStaffInput,
  callerUid: string,
): Promise<StaffUser> {
  const auth = getAdminAuth();
  const db = getAdminDb();

  let uid: string;
  try {
    const record = await auth.createUser({
      email: input.email,
      password: input.password,
      displayName: input.displayName,
    });
    uid = record.uid;
  } catch (error) {
    switch (errorCode(error)) {
      case "auth/email-already-exists":
        throw new ApiError(409, "Email is already in use");
      case "auth/invalid-email":
        throw new ApiError(400, "Please enter a valid email address");
      case "auth/invalid-password":
        throw new ApiError(400, "Password must be at least 6 characters");
      case "auth/invalid-display-name":
        throw new ApiError(400, "Invalid display name");
    }
    throw error;
  }

  const now = Timestamp.now();
  const userData = {
    uid,
    email: input.email,
    displayName: input.displayName,
    role: input.role,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    createdBy: callerUid,
  };

  try {
    await db.collection(USERS_COLLECTION).doc(uid).set(userData);
  } catch (error) {
    // Without the profile the account can sign in but has no role; remove it
    // so the owner can simply try again.
    try {
      await auth.deleteUser(uid);
    } catch (cleanupError) {
      console.error(
        `Failed to roll back Auth user ${uid} after profile write failed:`,
        cleanupError,
      );
    }
    throw error;
  }

  return {
    id: uid,
    ...userData,
    createdAt: now.toDate(),
    updatedAt: now.toDate(),
  };
}

/** Load a user doc that this module is allowed to change. */
async function loadManagedUser(id: string): Promise<DocumentData> {
  const snapshot = await getAdminDb().collection(USERS_COLLECTION).doc(id).get();
  if (!snapshot.exists) throw new ApiError(404, "Staff member not found");

  const data = snapshot.data() ?? {};
  if (data.role === "owner") {
    throw new ApiError(403, "The owner account cannot be changed here");
  }
  if (!MANAGED_ROLES.includes(data.role)) {
    throw new ApiError(403, "Only staff and manager accounts can be changed here");
  }
  return data;
}

/**
 * Apply an edit from the staff page.
 *
 * Only displayName, isActive, currentBranch and role (staff/manager) are
 * accepted; anything else in `body` is ignored. Owner accounts are refused.
 */
export async function updateStaff(
  id: string,
  body: unknown,
): Promise<User | null> {
  const input =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const updateData: Record<string, unknown> = {};

  if (input.displayName !== undefined) {
    if (typeof input.displayName !== "string" || !input.displayName.trim()) {
      throw new ApiError(400, "displayName must be a non-empty string");
    }
    updateData.displayName = input.displayName.trim();
  }
  if (input.isActive !== undefined) {
    if (typeof input.isActive !== "boolean") {
      throw new ApiError(400, "isActive must be a boolean");
    }
    updateData.isActive = input.isActive;
  }
  if (input.currentBranch !== undefined) {
    if (typeof input.currentBranch !== "string") {
      throw new ApiError(400, "currentBranch must be a string");
    }
    updateData.currentBranch = input.currentBranch;
  }
  if (input.role !== undefined) {
    if (input.role !== "staff" && input.role !== "manager") {
      throw new ApiError(400, "Invalid role");
    }
    updateData.role = input.role;
  }

  if (Object.keys(updateData).length === 0) {
    throw new ApiError(400, "No editable fields provided");
  }

  await loadManagedUser(id);

  const docRef = getAdminDb().collection(USERS_COLLECTION).doc(id);
  await docRef.update({ ...updateData, updatedAt: Timestamp.now() });

  const updated = await docRef.get();
  if (!updated.exists) return null;
  const data = updated.data() ?? {};
  return {
    uid: data.uid || updated.id,
    email: data.email,
    displayName: data.displayName,
    role: data.role,
    currentBranch: data.currentBranch,
    isActive: data.isActive !== false,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
    createdBy: data.createdBy,
  } as User;
}

/**
 * Remove a staff/manager account: the users doc and the Auth user.
 * Refuses the caller's own account and owner accounts.
 */
export async function deleteStaff(id: string, callerUid: string): Promise<void> {
  if (id === callerUid) {
    throw new ApiError(403, "You cannot delete your own account");
  }

  await loadManagedUser(id);

  await getAdminDb().collection(USERS_COLLECTION).doc(id).delete();

  try {
    await getAdminAuth().deleteUser(id);
  } catch (error) {
    // Already gone from Auth is fine; the profile is what grants access.
    if (errorCode(error) !== "auth/user-not-found") {
      console.error(`Failed to delete Auth user ${id}:`, error);
    }
  }
}
