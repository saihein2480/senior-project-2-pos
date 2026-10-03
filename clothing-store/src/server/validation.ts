/**
 * Request validation at the API route boundary (server only).
 *
 * Routes describe the input they accept as a zod schema and call one of the
 * helpers below. Anything that does not match becomes `ApiError(400, message)`,
 * which `handleRouteError` turns into the usual `{ success: false, error }`
 * response, so every route reports bad input the same way.
 *
 *   const body = await parseJson(request, createThingSchema);
 *   const { id } = parseQuery(request, z.object({ id: requiredId }));
 *
 * The message is the first issue only, worded for a person: a schema's own
 * message (`z.string({ error: "Name is required" })`) is used verbatim, and
 * zod's generic issues are rewritten to name the field, e.g.
 * "colorVariants[0].sizeQuantities[1].quantity must be a whole number".
 *
 * The domain modules in src/server/*Admin.ts still whitelist what they write;
 * these schemas are the boundary check in front of them.
 */

import { z } from "zod";
import { ApiError } from "./errors";

type RawIssue = z.core.$ZodRawIssue;

/** `a.b[0].c` for a zod path; undefined for the root. */
function fieldLabel(path: readonly PropertyKey[] | undefined): string | undefined {
  if (!path || path.length === 0) return undefined;
  return path
    .map((segment, index) =>
      typeof segment === "number"
        ? `[${segment}]`
        : `${index === 0 ? "" : "."}${String(segment)}`,
    )
    .join("");
}

const TYPE_NAMES: Record<string, string> = {
  string: "text",
  number: "a number",
  int: "a whole number",
  boolean: "true or false",
  array: "a list",
  object: "an object",
  date: "a date",
};

function sizeUnit(origin: string): string {
  if (origin === "string") return " characters";
  if (origin === "array" || origin === "set") return " items";
  return "";
}

/** zod's own English message for an issue, as a fallback. */
function localeMessage(issue: RawIssue): string | undefined {
  const result = z.config().localeError?.(issue);
  if (typeof result === "string") return result;
  return result?.message ?? undefined;
}

/**
 * Per-parse error map. Only consulted for issues whose schema did not supply
 * its own message, so route-specific wording always wins.
 */
function readableIssue(issue: RawIssue): string | undefined {
  const field = fieldLabel(issue.path);
  const subject = field ?? "Value";

  switch (issue.code) {
    case "invalid_type": {
      if (issue.input === undefined || issue.input === null) {
        return `${subject} is required`;
      }
      const expected = TYPE_NAMES[issue.expected] ?? issue.expected;
      return `${subject} must be ${expected}`;
    }
    case "too_small": {
      const min = Number(issue.minimum);
      if (issue.origin === "string" && min <= 1) return `${subject} must not be empty`;
      const unit = sizeUnit(issue.origin);
      return issue.inclusive === false
        ? `${subject} must be greater than ${min}${unit}`
        : `${subject} must be at least ${min}${unit}`;
    }
    case "too_big": {
      const max = Number(issue.maximum);
      if (issue.origin === "string") return `${subject} is too long (max ${max} characters)`;
      const unit = sizeUnit(issue.origin);
      return issue.inclusive === false
        ? `${subject} must be less than ${max}${unit}`
        : `${subject} must be at most ${max}${unit}`;
    }
    case "invalid_value":
      return `${subject} must be one of: ${issue.values.map(String).join(", ")}`;
    case "invalid_format":
      return `${subject} is not in a valid format`;
    default: {
      const fallback = localeMessage(issue);
      return fallback && field ? `${field}: ${fallback}` : fallback;
    }
  }
}

/** The message `parseJson` & co. put in the 400 response. */
export function firstIssueMessage(error: z.ZodError): string {
  return error.issues[0]?.message || "Invalid request";
}

function parseOrThrow<T>(
  schema: z.ZodType<T>,
  value: unknown,
  errorMap: (issue: RawIssue) => string | undefined = readableIssue,
): T {
  const result = schema.safeParse(value, { error: errorMap });
  if (!result.success) throw new ApiError(400, firstIssueMessage(result.error));
  return result.data;
}

/**
 * Validate an already-read value (e.g. one branch of a body that was parsed
 * loosely first). Throws `ApiError(400)` on failure.
 */
export function validate<T>(value: unknown, schema: z.ZodType<T>): T {
  return parseOrThrow(schema, value);
}

export interface ParseJsonOptions {
  /**
   * Message for a body that is not JSON, or not the JSON object the schema
   * expects at its root. Defaults to "Invalid JSON body", which is what the
   * routes have always answered.
   */
  invalidBodyMessage?: string;
}

/**
 * Read the request body as JSON and validate it against `schema`.
 *
 * Throws `ApiError(400)` for unparseable JSON and for any schema mismatch.
 * A schema-level message on the root object (`z.object(shape, { error })`)
 * takes precedence over `invalidBodyMessage`.
 */
export async function parseJson<T>(
  request: Request,
  schema: z.ZodType<T>,
  options: ParseJsonOptions = {},
): Promise<T> {
  const invalidBody = options.invalidBodyMessage ?? "Invalid JSON body";

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ApiError(400, invalidBody);
  }

  return parseOrThrow(schema, body, (issue) =>
    issue.code === "invalid_type" && fieldLabel(issue.path) === undefined
      ? invalidBody
      : readableIssue(issue),
  );
}

/**
 * Validate query-string parameters. Each key becomes its first value (as
 * `URLSearchParams.get` returns), so schemas see `string | undefined`.
 */
export function parseQuery<T>(
  source: Request | URL | URLSearchParams,
  schema: z.ZodType<T>,
): T {
  const params =
    source instanceof URLSearchParams
      ? source
      : source instanceof URL
        ? source.searchParams
        : new URL(source.url).searchParams;

  const raw: Record<string, string> = {};
  for (const key of params.keys()) {
    if (!(key in raw)) raw[key] = params.get(key) ?? "";
  }
  return parseOrThrow(schema, raw);
}

/**
 * Validate the non-file fields of a multipart form. Each key becomes its first
 * value (`FormData.get`); file entries arrive as `File`, so a `z.string()`
 * field rejects (or, with `.catch`, ignores) a file sent where text belongs.
 */
export function parseFormFields<T>(formData: FormData, schema: z.ZodType<T>): T {
  const raw: Record<string, FormDataEntryValue> = {};
  for (const key of formData.keys()) {
    if (!(key in raw)) {
      const value = formData.get(key);
      if (value !== null) raw[key] = value;
    }
  }
  return parseOrThrow(schema, raw);
}
