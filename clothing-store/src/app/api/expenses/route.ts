import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { MANAGEMENT, OWNER_ONLY } from "@/config/rolePermissions";
import { handleRouteError, requireRole } from "@/lib/server/apiAuth";
import { parseJson, parseQuery, validate } from "@/server/validation";
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

const MAX_NAME_LENGTH = 200;

const MISSING_FIELDS = "Missing required fields";
const INVALID_EXPENSE_FIELDS = "Invalid expense fields";

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseAmount(value: unknown): number | null {
  const amount = typeof value === "number" ? value : parseFloat(String(value));
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

// ---- Request schemas -------------------------------------------------------

/** Category / spending-menu name: trimmed, 1-200 characters. */
const namedEntrySchema = (message: string) =>
  z.object({
    name: z.string({ error: message }).trim().min(1, message).max(MAX_NAME_LENGTH, message),
  });

/** A date string or timestamp that `new Date` understands. */
const expenseDate = z.unknown().transform((value, ctx) => {
  const date = parseDate(value);
  if (!date) {
    ctx.addIssue({ code: "custom", message: INVALID_EXPENSE_FIELDS });
    return z.NEVER;
  }
  return date;
});

/** A finite amount >= 0, given as a number or numeric text. */
const expenseAmount = z.unknown().transform((value, ctx) => {
  const amount = parseAmount(value);
  if (amount === null) {
    ctx.addIssue({ code: "custom", message: INVALID_EXPENSE_FIELDS });
    return z.NEVER;
  }
  return amount;
});

const optionalExpenseText = z.string({ error: INVALID_EXPENSE_FIELDS }).nullish();

/** Present in the truthy sense the form check has always used (0 is missing). */
const presentValue = z.unknown().refine((value) => Boolean(value), {
  message: MISSING_FIELDS,
});

/**
 * POST body for a new expense. Presence is checked before types, so a form
 * with a blank required field keeps getting "Missing required fields".
 * spendingMenuId is optional (the feature was removed from the UI).
 */
const createExpenseSchema = z
  .looseObject({
    categoryId: presentValue,
    date: presentValue,
    amount: presentValue,
    currency: presentValue,
  })
  .pipe(
    z.object({
      categoryId: z.string({ error: INVALID_EXPENSE_FIELDS }),
      spendingMenuId: optionalExpenseText,
      note: optionalExpenseText,
      imageUrl: optionalExpenseText,
      date: expenseDate,
      amount: expenseAmount,
      currency: z.enum(CURRENCIES, { error: INVALID_EXPENSE_FIELDS }),
    }),
  );

/** PUT body: every field optional; a falsy date or "" currency means "unchanged". */
const updateExpenseSchema = z.object({
  categoryId: z.string({ error: INVALID_EXPENSE_FIELDS }).optional(),
  spendingMenuId: optionalExpenseText,
  note: optionalExpenseText,
  imageUrl: optionalExpenseText,
  date: z.preprocess((value) => value || undefined, expenseDate.optional()),
  amount: expenseAmount.optional(),
  currency: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.enum(CURRENCIES, { error: INVALID_EXPENSE_FIELDS }).optional(),
  ),
});

const expenseIdQuerySchema = z.object({
  id: z.string({ error: "ID is required" }).min(1, "ID is required"),
});

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
    // One endpoint, three bodies; `type` picks the schema.
    const body = await parseJson(request, z.looseObject({}));

    if (body.type === "category") {
      const { name } = validate(
        body,
        namedEntrySchema("Category name is required"),
      );
      const category = await addExpenseCategory(name);
      return NextResponse.json({ success: true, data: category });
    } else if (body.type === "spendingMenu") {
      const { name } = validate(
        body,
        namedEntrySchema("Spending menu name is required"),
      );
      const spendingMenu = await addSpendingMenu(name);
      return NextResponse.json({ success: true, data: spendingMenu });
    } else {
      const input = validate(body, createExpenseSchema);

      const expense = await addExpense({
        categoryId: input.categoryId,
        spendingMenuId: input.spendingMenuId || undefined,
        note: input.note || "",
        imageUrl: input.imageUrl || "",
        date: input.date,
        amount: input.amount,
        currency: input.currency,
      });

      return NextResponse.json({ success: true, data: expense });
    }
  } catch (error) {
    return handleRouteError(error, "POST /api/expenses", "Failed to create data");
  }
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  // Read before auth: the type decides which roles may delete. Any other
  // value (or none) deletes an expense, which is Owner only.
  const type = searchParams.get("type");

  const isLookup = type === "category" || type === "spendingMenu";
  const auth = await requireRole(request, isLookup ? MANAGEMENT : OWNER_ONLY);
  if ("response" in auth) return auth.response;

  try {
    const { id } = parseQuery(searchParams, expenseIdQuerySchema);

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
    const { id } = parseQuery(request, expenseIdQuerySchema);
    const body = await parseJson(request, updateExpenseSchema);

    await updateExpense(id, {
      categoryId: body.categoryId,
      spendingMenuId: body.spendingMenuId || undefined,
      note: body.note ?? undefined,
      imageUrl: body.imageUrl ?? undefined,
      date: body.date,
      amount: body.amount,
      currency: body.currency,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleRouteError(error, "PUT /api/expenses", "Failed to update expense");
  }
}
