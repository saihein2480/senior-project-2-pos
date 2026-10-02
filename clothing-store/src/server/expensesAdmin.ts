/**
 * Expenses, expense categories and spending menus through the Admin SDK
 * (server only). Mirrors src/services/expenseService.ts.
 */

import { Timestamp, type DocumentData } from "firebase-admin/firestore";
import type {
  CreateExpenseData,
  Expense,
  ExpenseCategory,
  SpendingMenu,
} from "@/types/expense";
import { getAdminDb } from "./adminDb";
import { ApiError } from "./errors";

const EXPENSES_COLLECTION = "expenses";
const CATEGORIES_COLLECTION = "expenseCategories";
const SPENDING_MENUS_COLLECTION = "spendingMenus";

function toDate(value: unknown): Date {
  return value instanceof Timestamp ? value.toDate() : new Date();
}

function mapExpense(id: string, data: DocumentData): Expense {
  return {
    id,
    categoryId: data.categoryId,
    categoryName: data.categoryName,
    spendingMenuId: data.spendingMenuId,
    spendingMenuName: data.spendingMenuName,
    note: data.note,
    imageUrl: data.imageUrl || "",
    date: toDate(data.date),
    amount: data.amount,
    currency: data.currency,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  };
}

async function addNamed(
  collectionName: string,
  name: string,
): Promise<{ id: string; name: string; createdAt: Date }> {
  const docRef = await getAdminDb()
    .collection(collectionName)
    .add({ name, createdAt: Timestamp.now() });
  return { id: docRef.id, name, createdAt: new Date() };
}

async function listNamed(
  collectionName: string,
): Promise<Array<{ id: string; name: string; createdAt: Date }>> {
  const snapshot = await getAdminDb()
    .collection(collectionName)
    .orderBy("createdAt", "desc")
    .get();
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    name: doc.data().name,
    createdAt: toDate(doc.data().createdAt),
  }));
}

// ---- Categories -------------------------------------------------------

export function addExpenseCategory(name: string): Promise<ExpenseCategory> {
  return addNamed(CATEGORIES_COLLECTION, name);
}

export function getExpenseCategories(): Promise<ExpenseCategory[]> {
  return listNamed(CATEGORIES_COLLECTION);
}

export async function deleteExpenseCategory(id: string): Promise<void> {
  await getAdminDb().collection(CATEGORIES_COLLECTION).doc(id).delete();
}

// ---- Spending menus ---------------------------------------------------

export function addSpendingMenu(name: string): Promise<SpendingMenu> {
  return addNamed(SPENDING_MENUS_COLLECTION, name);
}

export function getSpendingMenus(): Promise<SpendingMenu[]> {
  return listNamed(SPENDING_MENUS_COLLECTION);
}

export async function deleteSpendingMenu(id: string): Promise<void> {
  await getAdminDb().collection(SPENDING_MENUS_COLLECTION).doc(id).delete();
}

// ---- Expenses ---------------------------------------------------------

export async function addExpense(data: CreateExpenseData): Promise<Expense> {
  const db = getAdminDb();

  const categoryDoc = await db
    .collection(CATEGORIES_COLLECTION)
    .doc(data.categoryId)
    .get();

  // spendingMenuId is optional; an id that no longer exists is dropped.
  let spendingMenuId: string | undefined;
  let spendingMenuName = "";
  if (data.spendingMenuId) {
    const spendingMenuDoc = await db
      .collection(SPENDING_MENUS_COLLECTION)
      .doc(data.spendingMenuId)
      .get();
    if (spendingMenuDoc.exists) {
      spendingMenuId = data.spendingMenuId;
      spendingMenuName = spendingMenuDoc.data()?.name;
    }
  }

  if (!categoryDoc.exists) {
    throw new ApiError(400, "Category not found");
  }

  const now = Timestamp.now();
  const expenseData: Record<string, unknown> = {
    categoryId: data.categoryId,
    categoryName: categoryDoc.data()?.name,
    note: data.note,
    imageUrl: data.imageUrl || "",
    date: Timestamp.fromDate(data.date),
    amount: data.amount,
    currency: data.currency,
    createdAt: now,
    updatedAt: now,
  };

  if (spendingMenuId) {
    expenseData.spendingMenuId = spendingMenuId;
    expenseData.spendingMenuName = spendingMenuName;
  }

  const docRef = await db.collection(EXPENSES_COLLECTION).add(expenseData);

  return {
    id: docRef.id,
    categoryId: data.categoryId,
    categoryName: expenseData.categoryName as string,
    spendingMenuId: spendingMenuId || undefined,
    spendingMenuName: spendingMenuName || undefined,
    note: (expenseData.note as string) || "",
    imageUrl: (expenseData.imageUrl as string) || "",
    date: data.date,
    amount: expenseData.amount as number,
    currency: data.currency,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export async function getExpenses(): Promise<Expense[]> {
  const snapshot = await getAdminDb()
    .collection(EXPENSES_COLLECTION)
    .orderBy("date", "desc")
    .get();
  return snapshot.docs.map((doc) => mapExpense(doc.id, doc.data()));
}

export async function getExpenseById(id: string): Promise<Expense | null> {
  const snapshot = await getAdminDb()
    .collection(EXPENSES_COLLECTION)
    .doc(id)
    .get();
  return snapshot.exists ? mapExpense(snapshot.id, snapshot.data() ?? {}) : null;
}

export async function updateExpense(
  id: string,
  data: Partial<CreateExpenseData>,
): Promise<void> {
  const db = getAdminDb();
  const updateData: Record<string, unknown> = { updatedAt: Timestamp.now() };

  if (data.categoryId) {
    const categoryDoc = await db
      .collection(CATEGORIES_COLLECTION)
      .doc(data.categoryId)
      .get();
    if (categoryDoc.exists) {
      updateData.categoryId = data.categoryId;
      updateData.categoryName = categoryDoc.data()?.name;
    }
  }

  if (data.spendingMenuId) {
    const spendingMenuDoc = await db
      .collection(SPENDING_MENUS_COLLECTION)
      .doc(data.spendingMenuId)
      .get();
    if (spendingMenuDoc.exists) {
      updateData.spendingMenuId = data.spendingMenuId;
      updateData.spendingMenuName = spendingMenuDoc.data()?.name;
    }
  }

  if (data.note !== undefined) updateData.note = data.note;
  if (data.imageUrl !== undefined) updateData.imageUrl = data.imageUrl;
  if (data.date) updateData.date = Timestamp.fromDate(data.date);
  if (data.amount !== undefined) updateData.amount = data.amount;
  if (data.currency) updateData.currency = data.currency;

  await db.collection(EXPENSES_COLLECTION).doc(id).update(updateData);
}

export async function deleteExpense(id: string): Promise<void> {
  await getAdminDb().collection(EXPENSES_COLLECTION).doc(id).delete();
}
