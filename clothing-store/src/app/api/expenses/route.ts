import { NextRequest, NextResponse } from "next/server";
import { MANAGEMENT, OWNER_ONLY } from "@/config/rolePermissions";
import {
  handleRouteError,
  jsonError,
  requireRole,
} from "@/lib/server/apiAuth";
import {
  addExpense,
  getExpenses,
  addExpenseCategory,
  getExpenseCategories,
  deleteExpenseCategory,
  addSpendingMenu,
  getSpendingMenus,
  deleteSpendingMenu,
  updateExpense,
  deleteExpense,
} from "@/server/expensesAdmin";

// Access (Doc: Expenses section):
//   GET                      - Owner + Manager ("View Expenses")
//   POST / PUT               - Owner + Manager ("Add/Edit Expense",
//                              "Manage Categories")
//   DELETE category/menu     - Owner + Manager ("Manage Categories")
//   DELETE expense           - Owner only ("Delete Expense" / "Bulk Delete")

const CURRENCIES = ["THB", "MMK"] as const;
type Currency = (typeof CURRENCIES)[number];

const MAX_NAME_LENGTH = 200;

function isCurrency(value: unknown): value is Currency {
  return CURRENCIES.includes(value as Currency);
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseAmount(value: unknown): number | null {
  const amount = typeof value === "number" ? value : parseFloat(String(value));
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

function parseName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim();
  return name && name.length <= MAX_NAME_LENGTH ? name : null;
}

function optionalString(value: unknown): string | undefined | null {
  if (value === undefined || value === null) return undefined;
  return typeof value === "string" ? value : null;
}

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, MANAGEMENT);
  if ("response" in auth) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");

    if (type === "categories") {
      const categories = await getExpenseCategories();
      return NextResponse.json({ success: true, data: categories });
    } else if (type === "spendingMenus") {
      const spendingMenus = await getSpendingMenus();
      return NextResponse.json({ success: true, data: spendingMenus });
    } else {
      const expenses = await getExpenses();
      return NextResponse.json({ success: true, data: expenses });
    }
  } catch (error) {
    return handleRouteError(error, "GET /api/expenses", "Failed to fetch data");
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, MANAGEMENT);
  if ("response" in auth) return auth.response;

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return jsonError(400, "Invalid JSON body");
    }
    const { type } = body;

    if (type === "category") {
      const name = parseName(body.name);
      if (!name) {
        return jsonError(400, "Category name is required");
      }
      const category = await addExpenseCategory(name);
      return NextResponse.json({ success: true, data: category });
    } else if (type === "spendingMenu") {
      const name = parseName(body.name);
      if (!name) {
        return jsonError(400, "Spending menu name is required");
      }
      const spendingMenu = await addSpendingMenu(name);
      return NextResponse.json({ success: true, data: spendingMenu });
    } else {
      const {
        categoryId,
        spendingMenuId,
        note,
        imageUrl,
        date,
        amount,
        currency,
      } = body;

      // spendingMenuId is optional (feature removed in UI), validate required fields only
      if (!categoryId || !date || !amount || !currency) {
        return jsonError(400, "Missing required fields");
      }

      const parsedDate = parseDate(date);
      const parsedAmount = parseAmount(amount);
      const parsedNote = optionalString(note);
      const parsedImageUrl = optionalString(imageUrl);
      if (
        typeof categoryId !== "string" ||
        (spendingMenuId !== undefined &&
          spendingMenuId !== null &&
          typeof spendingMenuId !== "string") ||
        parsedDate === null ||
        parsedAmount === null ||
        !isCurrency(currency) ||
        parsedNote === null ||
        parsedImageUrl === null
      ) {
        return jsonError(400, "Invalid expense fields");
      }

      const expense = await addExpense({
        categoryId,
        spendingMenuId: spendingMenuId || undefined,
        note: parsedNote || "",
        imageUrl: parsedImageUrl || "",
        date: parsedDate,
        amount: parsedAmount,
        currency,
      });

      return NextResponse.json({ success: true, data: expense });
    }
  } catch (error) {
    return handleRouteError(error, "POST /api/expenses", "Failed to create data");
  }
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");
  const id = searchParams.get("id");

  const isLookup = type === "category" || type === "spendingMenu";
  const auth = await requireRole(request, isLookup ? MANAGEMENT : OWNER_ONLY);
  if ("response" in auth) return auth.response;

  try {
    if (!id) {
      return jsonError(400, "ID is required");
    }

    if (type === "category") {
      await deleteExpenseCategory(id);
    } else if (type === "spendingMenu") {
      await deleteSpendingMenu(id);
    } else {
      await deleteExpense(id);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleRouteError(error, "DELETE /api/expenses", "Failed to delete data");
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireRole(request, MANAGEMENT);
  if ("response" in auth) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return jsonError(400, "ID is required");
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return jsonError(400, "Invalid JSON body");
    }

    const {
      categoryId,
      spendingMenuId,
      note,
      imageUrl,
      date,
      amount,
      currency,
    } = body;

    const parsedDate = date ? parseDate(date) : undefined;
    const parsedAmount = amount !== undefined ? parseAmount(amount) : undefined;
    const parsedNote = optionalString(note);
    const parsedImageUrl = optionalString(imageUrl);

    if (
      (categoryId !== undefined && typeof categoryId !== "string") ||
      (spendingMenuId !== undefined &&
        spendingMenuId !== null &&
        typeof spendingMenuId !== "string") ||
      parsedDate === null ||
      parsedAmount === null ||
      (currency !== undefined && currency !== "" && !isCurrency(currency)) ||
      parsedNote === null ||
      parsedImageUrl === null
    ) {
      return jsonError(400, "Invalid expense fields");
    }

    await updateExpense(id, {
      categoryId,
      spendingMenuId: spendingMenuId || undefined,
      note: parsedNote,
      imageUrl: parsedImageUrl,
      date: parsedDate,
      amount: parsedAmount,
      currency: isCurrency(currency) ? currency : undefined,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleRouteError(error, "PUT /api/expenses", "Failed to update expense");
  }
}
