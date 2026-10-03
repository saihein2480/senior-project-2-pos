/**
 * Branch identity.
 *
 * A branch is a document in the `shops` collection. Its document id is the
 * stable identity; its name is a label the owner can change at any time.
 *
 * Records have tagged their branch in several ways over the life of the app:
 *
 *   - `shopId`     an id (transactions, online orders). Authoritative when set.
 *   - `shop`       usually an id (stocks, cart items, promotions), but older
 *                  stock rows hold the branch *name* here instead.
 *   - `branchName` a name (transactions, promotions), written at the time.
 *
 * `matchesBranch` compares by id first and only falls back to names for legacy
 * records that carry no usable id, so renaming a shop does not drop its history
 * out of the filters. Names are compared trimmed and case-insensitively against
 * the branch's current name and any former names recorded on the shop.
 *
 * Everything here is pure (no Firestore, no React, no localStorage) so it can
 * be unit-tested and shared by pages, services and API routes alike.
 */

/** A branch as the rest of the app should hold it: id plus display name. */
export interface BranchRef {
  /** Shop document id. Empty when the branch could not be resolved to a shop. */
  id: string;
  /** Current display name. */
  name: string;
  /** Names this shop had before a rename, so legacy name-only records match. */
  formerNames?: readonly string[];
}

/** The minimum a shop document needs to become a `BranchRef`. */
export interface BranchSource {
  id: string;
  name?: string | null;
  formerNames?: readonly (string | null | undefined)[] | null;
}

/** Any record that may carry a branch tag. Every field is optional. */
export interface BranchTaggedRecord {
  shopId?: string | null;
  shop?: string | null;
  branchName?: string | null;
}

/** Sentinel the settings document and pickers use when there are no shops. */
export const NO_BRANCH_NAME = "No Branch";

/**
 * Legacy convention: stock rows saved with no branch at all were treated as
 * belonging to the branch called "Main Branch". Pass this as
 * `unassignedBranchName` where that tolerance is wanted (stock filters).
 */
export const LEGACY_UNASSIGNED_BRANCH_NAME = "Main Branch";

/** Upper bound on remembered former names per shop. */
const MAX_FORMER_NAMES = 20;

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Comparison key for a branch name: trimmed, inner whitespace collapsed,
 * lower-cased. Non-strings give "".
 */
export function normalizeBranchName(name: unknown): string {
  return cleanText(name).replace(/\s+/g, " ").toLowerCase();
}

/** True when `name` is the branch's current name or one of its former names. */
export function nameMatchesBranch(name: unknown, branch: BranchRef): boolean {
  const key = normalizeBranchName(name);
  if (!key) return false;
  if (normalizeBranchName(branch.name) === key) return true;
  return (branch.formerNames || []).some(
    (former) => normalizeBranchName(former) === key,
  );
}

export interface MatchesBranchOptions {
  /**
   * Records with no branch tag at all are treated as belonging to the branch
   * with this name (see `LEGACY_UNASSIGNED_BRANCH_NAME`). Omit to never match
   * untagged records.
   */
  unassignedBranchName?: string;
}

/**
 * Whether `record` belongs to `branch`.
 *
 * 1. `record.shopId` set: it decides on its own (exact id comparison).
 * 2. `record.shop` equal to the branch id: match.
 * 3. Otherwise `record.shop` / `record.branchName` are treated as legacy names
 *    and compared against the branch's current and former names.
 * 4. A record with no tag at all only matches via `unassignedBranchName`.
 */
export function matchesBranch(
  record: BranchTaggedRecord | null | undefined,
  branch: BranchRef | null | undefined,
  options: MatchesBranchOptions = {},
): boolean {
  if (!record || !branch) return false;

  const branchId = cleanText(branch.id);
  const shopId = cleanText(record.shopId);
  const shop = cleanText(record.shop);
  const branchName = cleanText(record.branchName);

  if (shopId) return branchId !== "" && shopId === branchId;

  if (shop && branchId && shop === branchId) return true;

  if (nameMatchesBranch(shop, branch) || nameMatchesBranch(branchName, branch)) {
    return true;
  }

  if (!shop && !branchName && options.unassignedBranchName) {
    return nameMatchesBranch(options.unassignedBranchName, branch);
  }

  return false;
}

/** One shop document as a `BranchRef` (former names cleaned and de-duplicated). */
export function toBranchRef(shop: BranchSource): BranchRef {
  const name = cleanText(shop.name);
  const ownKey = normalizeBranchName(name);
  const seen = new Set<string>(ownKey ? [ownKey] : []);
  const formerNames: string[] = [];

  for (const former of shop.formerNames || []) {
    const text = cleanText(former);
    const key = normalizeBranchName(text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    formerNames.push(text);
  }

  return formerNames.length > 0
    ? { id: shop.id, name, formerNames }
    : { id: shop.id, name };
}

/**
 * The shops list as `BranchRef`s, order preserved.
 *
 * A former name that is now another shop's *current* name is dropped: the shop
 * that carries the name today owns the legacy records written under it.
 */
export function toBranchRefs(
  shops: readonly BranchSource[] | null | undefined,
): BranchRef[] {
  const refs = (shops || []).filter((shop) => !!shop?.id).map(toBranchRef);
  const currentNames = new Set(refs.map((ref) => normalizeBranchName(ref.name)));

  return refs.map((ref) => {
    if (!ref.formerNames) return ref;
    const formerNames = ref.formerNames.filter(
      (former) => !currentNames.has(normalizeBranchName(former)),
    );
    return formerNames.length > 0
      ? { ...ref, formerNames }
      : { id: ref.id, name: ref.name };
  });
}

export function findBranchById(
  branches: readonly BranchRef[],
  id: string | null | undefined,
): BranchRef | undefined {
  const key = cleanText(id);
  if (!key) return undefined;
  return branches.find((branch) => branch.id === key);
}

/** Current names win over former names; earlier (older) shops win ties. */
export function findBranchByName(
  branches: readonly BranchRef[],
  name: string | null | undefined,
): BranchRef | undefined {
  const key = normalizeBranchName(name);
  if (!key) return undefined;
  return (
    branches.find((branch) => normalizeBranchName(branch.name) === key) ||
    branches.find((branch) => nameMatchesBranch(key, branch))
  );
}

/** Resolve a value that may be either a shop id or a branch name. */
export function resolveBranch(
  branches: readonly BranchRef[],
  idOrName: string | null | undefined,
): BranchRef | undefined {
  return findBranchById(branches, idOrName) || findBranchByName(branches, idOrName);
}

/**
 * The value to keep in a branch filter `<select>`: the id when known, else the
 * name (an unresolved legacy branch).
 */
export function branchKey(branch: BranchRef | null | undefined): string {
  if (!branch) return "";
  return cleanText(branch.id) || cleanText(branch.name);
}

/**
 * Turn a branch filter value back into a `BranchRef`.
 *
 * `""` and `"all"` mean "no branch filter" (null). A value that resolves to no
 * known shop (shops still loading, or a legacy name) is used as both id and
 * name, so it still matches records tagged with it either way.
 */
export function resolveBranchFilter(
  value: string | null | undefined,
  branches: readonly BranchRef[],
): BranchRef | null {
  const key = cleanText(value);
  if (!key || key === "all") return null;
  return resolveBranch(branches, key) || { id: key, name: key };
}

/**
 * Former names after renaming a shop from `oldName` to `newName`.
 *
 * The old name is appended, the new name is removed (renaming back to an old
 * name makes it current again), duplicates are dropped case-insensitively, and
 * only the most recent `MAX_FORMER_NAMES` are kept.
 */
export function nextFormerNames(
  existing: readonly (string | null | undefined)[] | null | undefined,
  oldName: string | null | undefined,
  newName: string | null | undefined,
): string[] {
  const newKey = normalizeBranchName(newName);
  const seen = new Set<string>();
  const result: string[] = [];

  for (const name of [...(existing || []), oldName]) {
    const text = cleanText(name);
    const key = normalizeBranchName(text);
    if (!key || key === newKey || seen.has(key)) continue;
    seen.add(key);
    result.push(text);
  }

  return result.slice(-MAX_FORMER_NAMES);
}

// ---------------------------------------------------------------------------
// Per-user branch selection as stored in localStorage (`userBranch_<uid>`).
//
// Current format: JSON `{"id":"<shopId>","name":"<name at selection time>"}`.
// The name is only a display hint until the shops list arrives.
// Legacy format: the bare branch name.
// ---------------------------------------------------------------------------

export type StoredBranchSelection =
  | { kind: "id"; id: string; name: string }
  | { kind: "legacyName"; name: string };

export function serializeBranchSelection(branch: BranchRef): string {
  return JSON.stringify({ id: branch.id, name: branch.name });
}

export function parseBranchSelection(
  raw: string | null | undefined,
): StoredBranchSelection | null {
  const text = cleanText(raw);
  if (!text) return null;

  if (text.startsWith("{")) {
    try {
      const parsed = JSON.parse(text) as { id?: unknown; name?: unknown };
      const id = cleanText(parsed?.id);
      if (id) return { kind: "id", id, name: cleanText(parsed?.name) || id };
    } catch {
      // Not JSON after all: a branch name that happens to start with "{".
    }
  }

  return { kind: "legacyName", name: text };
}

export interface StoredBranchResolution {
  /** The user's own branch, or null to follow the business-wide default. */
  branch: BranchRef | null;
  /**
   * What to do with the stored value: a string to write, null to remove it,
   * undefined to leave it alone.
   */
  write?: string | null;
}

/**
 * Resolve the stored per-user selection against the shops list.
 *
 * Pass `branches = null` while the list is not known authoritatively yet: the
 * stored value is then used as-is (id with its name hint, or a legacy name) and
 * nothing is rewritten, so a slow or failed shops load never loses a choice.
 *
 * Once the list is known:
 *   - an id that still exists resolves to that shop (with its current name);
 *   - a legacy name is migrated to the id of the shop it names (current or
 *     former name) — the caller writes `write` back once;
 *   - anything that no longer resolves (deleted shop, "No Branch", unknown
 *     name) is cleared so the user follows the business default again.
 */
export function resolveStoredBranchSelection(
  raw: string | null | undefined,
  branches: readonly BranchRef[] | null,
): StoredBranchResolution {
  const stored = parseBranchSelection(raw);
  if (!stored) return { branch: null };

  if (stored.kind === "id") {
    if (!branches) return { branch: { id: stored.id, name: stored.name } };
    const found = findBranchById(branches, stored.id);
    if (!found) return { branch: null, write: null };
    return found.name === stored.name
      ? { branch: found }
      : { branch: found, write: serializeBranchSelection(found) };
  }

  const isNoBranch =
    normalizeBranchName(stored.name) === normalizeBranchName(NO_BRANCH_NAME);

  if (!branches) {
    return isNoBranch ? { branch: null } : { branch: { id: "", name: stored.name } };
  }

  const found = isNoBranch ? undefined : findBranchByName(branches, stored.name);
  if (!found) return { branch: null, write: null };
  return { branch: found, write: serializeBranchSelection(found) };
}
