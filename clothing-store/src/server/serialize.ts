/**
 * Helpers for turning Admin SDK document data into the same JSON the routes
 * produced when they used the client SDK.
 */

import { Timestamp } from "firebase-admin/firestore";

/**
 * Replace every Admin `Timestamp` nested anywhere in `value` with the object
 * the client SDK's `Timestamp.toJSON()` produces.
 *
 * The routes used to return client-SDK data, so a nested timestamp (e.g. a
 * customer's `memberSince` or `coupons[].expiresAt`) reached the browser as
 * `{ type, seconds, nanoseconds }`. An Admin Timestamp would serialise as
 * `{ _seconds, _nanoseconds }` instead, so this keeps the wire format stable.
 * Dates and other values are left untouched.
 */
export function toClientJson<T>(value: T): T {
  return convert(value) as T;
}

function convert(value: unknown): unknown {
  if (value instanceof Timestamp) {
    return {
      type: "firestore/timestamp/1.0",
      seconds: value.seconds,
      nanoseconds: value.nanoseconds,
    };
  }
  if (Array.isArray(value)) return value.map(convert);
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value)) out[key] = convert(inner);
    return out;
  }
  return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** Top-level timestamp field -> ISO string, leaving other values as stored. */
export function timestampToIso(value: unknown): unknown {
  return value instanceof Timestamp ? value.toDate().toISOString() : value;
}

/**
 * Drop `undefined` values (deeply) before a write. Firestore rejects them, and
 * callers use `undefined` to mean "not provided".
 */
export function stripUndefined<T>(value: T): T {
  return strip(value) as T;
}

function strip(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(strip);
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value)) {
      if (inner !== undefined) out[key] = strip(inner);
    }
    return out;
  }
  return value;
}
