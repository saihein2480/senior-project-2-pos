/**
 * customers collection through the Admin SDK (server only).
 *
 * Mirrors the CustomerService methods /api/customers uses. Writes are
 * whitelisted: loyalty state (points, coupons, membership) is never accepted
 * from a request body here, because any POS role may call these routes.
 */

import { Timestamp, type DocumentSnapshot } from "firebase-admin/firestore";
import { z } from "zod";
import type {
  CreateCustomerRequest,
  Customer,
  CustomerFilters,
  CustomerStats,
} from "@/types/customer";
import { getAdminDb } from "./adminDb";
import { ApiError } from "./errors";
import { toClientJson } from "./serialize";

const CUSTOMERS_COLLECTION = "customers";

const CUSTOMER_TYPES = [
  "retailer",
  "wholesaler",
  "distributor",
  "individual",
  "other",
] as const;

type CustomerType = (typeof CUSTOMER_TYPES)[number];

/**
 * Profile fields the POS customer form edits (NewCustomerModal). Everything
 * else on the document - loyaltyPoints, totalPointsEarned, pointsHistory,
 * coupons, activeCouponsCount, isMember, memberId, uid, createdAt, email,
 * receivables, totals - is ignored on update.
 */
const EDITABLE_TEXT_FIELDS = [
  "displayName",
  "phone",
  "secondaryPhone",
  "address",
  "township",
  "city",
  "customerImage",
] as const;

const MAX_TEXT_LENGTH = 2000;

// ---- Request validation (POST /api/customers, PUT /api/customers/[id]) ---
//
// The same rules createCustomer/updateCustomer apply below, checked at the
// route boundary with the same messages. Those functions still whitelist
// what they write, so these schemas only decide what is a 400.

/** Optional profile text: absent or null means "not given". */
const customerText = (field: string) =>
  z
    .string({ error: `${field} must be a string` })
    .max(MAX_TEXT_LENGTH, `${field} is too long`)
    .nullish();

/** Optional customer type; "" is treated as not given. */
const customerTypeField = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.enum(CUSTOMER_TYPES, { error: "Invalid customerType" }).nullish(),
);

/** POST body (createCustomer checks customerType first, so it leads here). */
export const createCustomerSchema = z.object({
  customerType: customerTypeField,
  email: customerText("email"),
  displayName: customerText("displayName"),
  phone: customerText("phone"),
  address: customerText("address"),
  secondaryPhone: customerText("secondaryPhone"),
  township: customerText("township"),
  city: customerText("city"),
  customerImage: customerText("customerImage"),
});

const UPDATE_REQUIRED = "Update data is required";

/**
 * PUT body. Unknown keys are kept (and later ignored by updateCustomer) so an
 * object holding only non-editable fields still reaches it and gets "No
 * editable fields provided"; only an empty object is "Update data is required".
 */
export const updateCustomerSchema = z
  .looseObject(
    {
      displayName: customerText("displayName"),
      phone: customerText("phone"),
      secondaryPhone: customerText("secondaryPhone"),
      address: customerText("address"),
      township: customerText("township"),
      city: customerText("city"),
      customerImage: customerText("customerImage"),
      customerType: customerTypeField,
    },
    { error: UPDATE_REQUIRED },
  )
  .refine((body) => Object.keys(body).length > 0, {
    message: UPDATE_REQUIRED,
  });

function customers() {
  return getAdminDb().collection(CUSTOMERS_COLLECTION);
}

function toDate(value: unknown): Date {
  return value instanceof Timestamp
    ? value.toDate()
    : new Date(value as string | number);
}

function mapCustomer(doc: DocumentSnapshot): Customer {
  const data = doc.data() ?? {};
  return toClientJson({
    uid: doc.id,
    ...data,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  }) as Customer;
}

function optionalText(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") {
    throw new ApiError(400, `${field} must be a string`);
  }
  if (value.length > MAX_TEXT_LENGTH) {
    throw new ApiError(400, `${field} is too long`);
  }
  return value;
}

function optionalCustomerType(value: unknown): CustomerType | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (!CUSTOMER_TYPES.includes(value as CustomerType)) {
    throw new ApiError(400, "Invalid customerType");
  }
  return value as CustomerType;
}

export async function getAllCustomers(): Promise<Customer[]> {
  const snapshot = await customers().orderBy("createdAt", "desc").get();
  return snapshot.docs.map(mapCustomer);
}

export async function getCustomersWithFilters(
  filters: CustomerFilters,
): Promise<Customer[]> {
  const all = await getAllCustomers();

  return all.filter((customer) => {
    if (filters.customerType && customer.customerType !== filters.customerType) {
      return false;
    }

    if (filters.customerSource && filters.customerSource !== "all") {
      const source =
        customer.customerSource || (customer.isOnline ? "online" : "pos");
      if (source !== filters.customerSource) return false;
    }

    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      const nameMatch = customer.displayName?.toLowerCase().includes(searchLower);
      const emailMatch = customer.email?.toLowerCase().includes(searchLower);
      if (!nameMatch && !emailMatch) return false;
    }

    return true;
  });
}

export async function getCustomerById(id: string): Promise<Customer | null> {
  const snapshot = await customers().doc(id).get();
  return snapshot.exists ? mapCustomer(snapshot) : null;
}

/** Same fields and defaults as CustomerService.createCustomer. */
export async function createCustomer(body: unknown): Promise<Customer> {
  const input = (
    body && typeof body === "object" ? body : {}
  ) as Partial<Record<keyof CreateCustomerRequest, unknown>>;

  const customerType = optionalCustomerType(input.customerType);
  const now = Timestamp.now();

  const newCustomer = {
    email: optionalText(input.email, "email") ?? "",
    displayName: optionalText(input.displayName, "displayName") ?? "",
    ...(customerType ? { customerType } : {}),
    phone: optionalText(input.phone, "phone") || "",
    address: optionalText(input.address, "address") || "",
    secondaryPhone: optionalText(input.secondaryPhone, "secondaryPhone") || "",
    township: optionalText(input.township, "township") || "",
    city: optionalText(input.city, "city") || "",
    customerImage: optionalText(input.customerImage, "customerImage") || "",
    totalPurchases: 0,
    totalSpent: 0,
    receivables: 0,
    customerSource: "pos" as const, // Manually created customers are POS customers
    isOnline: false,
    createdAt: now,
    updatedAt: now,
  };

  const docRef = await customers().add(newCustomer);

  return {
    uid: docRef.id,
    ...newCustomer,
    createdAt: now.toDate(),
    updatedAt: now.toDate(),
  } as Customer;
}

/**
 * Update the profile fields the POS form edits. Unknown or protected fields in
 * `body` are dropped; a body with nothing editable is a 400.
 */
export async function updateCustomer(
  id: string,
  body: unknown,
): Promise<Customer> {
  const input =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const updateFields: Record<string, unknown> = {};

  for (const field of EDITABLE_TEXT_FIELDS) {
    const value = optionalText(input[field], field);
    if (value !== undefined) updateFields[field] = value;
  }

  if (input.customerType !== undefined) {
    const customerType = optionalCustomerType(input.customerType);
    if (customerType) updateFields.customerType = customerType;
  }

  if (Object.keys(updateFields).length === 0) {
    throw new ApiError(400, "No editable fields provided");
  }

  const docRef = customers().doc(id);
  const existing = await docRef.get();
  if (!existing.exists) throw new ApiError(404, "Customer not found");

  await docRef.update({ ...updateFields, updatedAt: Timestamp.now() });

  const updated = await getCustomerById(id);
  if (!updated) throw new ApiError(404, "Customer not found");
  return updated;
}

export async function deleteCustomer(id: string): Promise<void> {
  await customers().doc(id).delete();
}

export async function getCustomerStats(): Promise<CustomerStats> {
  const all = await getAllCustomers();

  return {
    totalCustomers: all.length,
    retailerCustomers: all.filter((c) => c.customerType === "retailer").length,
    wholesalerCustomers: all.filter((c) => c.customerType === "wholesaler")
      .length,
    totalReceivables: all.reduce((sum, c) => sum + (c.receivables || 0), 0),
    onlineCustomers: all.filter(
      (c) => c.customerSource === "online" || c.isOnline === true,
    ).length,
    posCustomers: all.filter(
      (c) => c.customerSource === "pos" || (!c.customerSource && !c.isOnline),
    ).length,
  };
}
