/**
 * shops collection through the Admin SDK (server only).
 *
 * Mirrors src/services/shopService.ts, minus its mock-data fallbacks: a
 * failed read is an error (500), not a list of made-up branches.
 */

import {
  FieldValue,
  type DocumentSnapshot,
  type Query,
} from "firebase-admin/firestore";
import type {
  CreateShopRequest,
  Shop,
  ShopFilters,
  ShopStats,
  UpdateShopRequest,
} from "@/types/shop";
import { nextFormerNames, normalizeBranchName } from "@/lib/branch";
import { getAdminDb } from "./adminDb";
import { timestampToIso, toClientJson } from "./serialize";

const COLLECTION_NAME = "shops";

function shops() {
  return getAdminDb().collection(COLLECTION_NAME);
}

function mapShop(doc: DocumentSnapshot): Shop {
  const data = doc.data() ?? {};
  return toClientJson({
    id: doc.id,
    ...data,
    createdAt: timestampToIso(data.createdAt),
    updatedAt: timestampToIso(data.updatedAt),
  }) as Shop;
}

function matchesSearch(shop: Shop, search: string): boolean {
  const searchTerm = search.toLowerCase();
  return (
    shop.name.toLowerCase().includes(searchTerm) ||
    shop.address.toLowerCase().includes(searchTerm) ||
    shop.primaryPhone.includes(searchTerm) ||
    (!!shop.secondaryPhone && shop.secondaryPhone.includes(searchTerm))
  );
}

export async function getAllShops(): Promise<Shop[]> {
  // Oldest first, so the branch the business started with stays on top.
  const snapshot = await shops().orderBy("createdAt", "asc").get();
  return snapshot.docs.map(mapShop);
}

export async function getShopsWithFilters(filters: ShopFilters): Promise<Shop[]> {
  let q: Query = shops().orderBy("createdAt", "desc");

  if (filters.status) q = q.where("status", "==", filters.status);
  if (filters.city) q = q.where("city", "==", filters.city);
  if (filters.township) q = q.where("township", "==", filters.township);

  const snapshot = await q.get();
  let result = snapshot.docs.map(mapShop);

  // Free-text search is applied in memory.
  if (filters.search) {
    const search = filters.search;
    result = result.filter((shop) => matchesSearch(shop, search));
  }

  return result;
}

export async function getShopById(id: string): Promise<Shop | null> {
  const snapshot = await shops().doc(id).get();
  return snapshot.exists ? mapShop(snapshot) : null;
}

export async function createShop(
  shopData: CreateShopRequest,
  userId: string,
): Promise<Shop> {
  // Firestore rejects undefined, so optional fields that were not given are
  // left out entirely.
  const cleanShopData = Object.fromEntries(
    Object.entries({
      ...shopData,
      status: shopData.status || "active",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: userId,
    }).filter(([, value]) => value !== undefined),
  );

  const docRef = await shops().add({
    ...cleanShopData,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return { id: docRef.id, ...cleanShopData } as Shop;
}

/**
 * The business-wide default branch is stored by *name* in
 * business_settings/main.currentBranch (see settingsAdmin.ts). A rename keeps
 * it pointing at the same shop.
 */
const SETTINGS_COLLECTION = "business_settings";
const SETTINGS_DOC_ID = "main";

export async function updateShop(
  id: string,
  updates: UpdateShopRequest,
): Promise<void> {
  // The routes set optional fields (secondaryPhone, openingHours) to
  // undefined when the owner clears them; that means "delete the field".
  const payload = Object.fromEntries(
    Object.entries(updates).map(([key, value]) => [
      key,
      value === undefined ? FieldValue.delete() : value,
    ]),
  );

  const shopRef = shops().doc(id);

  if (typeof updates.name !== "string") {
    await shopRef.update({ ...payload, updatedAt: FieldValue.serverTimestamp() });
    return;
  }

  const newName = updates.name;
  const db = getAdminDb();
  const settingsRef = db.collection(SETTINGS_COLLECTION).doc(SETTINGS_DOC_ID);

  // A rename: remember the old name so records that only stored a branch name
  // still match this shop, and keep the business default on the same shop.
  // One transaction so two renames in quick succession cannot lose a name.
  await db.runTransaction(async (tx) => {
    // The whole (small) shops collection is read so the default is only moved
    // when no other shop still carries the old name.
    const [shopSnap, allShopsSnap, settingsSnap] = await Promise.all([
      tx.get(shopRef),
      tx.get(shops()),
      tx.get(settingsRef),
    ]);

    const data = shopSnap.data() ?? {};
    const oldName = typeof data.name === "string" ? data.name : "";
    const renamed =
      normalizeBranchName(oldName) !== normalizeBranchName(newName);

    const existingFormer: unknown[] = Array.isArray(data.formerNames)
      ? data.formerNames
      : [];
    const formerNames = nextFormerNames(
      existingFormer.filter((name): name is string => typeof name === "string"),
      renamed ? oldName : null,
      newName,
    );

    // update() (not set) so a missing shop still fails as before.
    tx.update(shopRef, {
      ...payload,
      formerNames: formerNames.length > 0 ? formerNames : FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    const defaultBranch = settingsSnap.exists
      ? settingsSnap.get("currentBranch")
      : undefined;
    const oldNameStillUsed = allShopsSnap.docs.some(
      (doc) =>
        doc.id !== id &&
        normalizeBranchName(doc.get("name")) === normalizeBranchName(oldName),
    );
    if (
      renamed &&
      !oldNameStillUsed &&
      typeof defaultBranch === "string" &&
      normalizeBranchName(defaultBranch) === normalizeBranchName(oldName)
    ) {
      tx.update(settingsRef, {
        currentBranch: newName,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  });
}

export async function deleteShop(id: string): Promise<void> {
  await shops().doc(id).delete();
}

export async function getShopStats(): Promise<ShopStats> {
  const all = await getAllShops();

  return {
    totalShops: all.length,
    activeShops: all.filter((shop) => shop.status === "active").length,
    inactiveShops: all.filter((shop) => shop.status === "inactive").length,
    citiesCount: new Set(all.map((shop) => shop.city)).size,
    townshipsCount: new Set(all.map((shop) => shop.township)).size,
  };
}
