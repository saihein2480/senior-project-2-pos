"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  CheckCircle,
  ClipboardCheck,
  CreditCard,
  FolderPlus,
  Gift,
  Globe,
  History,
  LogIn,
  LogOut,
  PackageCheck,
  PackagePlus,
  Pencil,
  Receipt,
  RefreshCw,
  RotateCcw,
  Search,
  Settings,
  ShoppingBag,
  Store,
  Trash2,
  Truck,
  UserCheck,
  UserMinus,
  UserPen,
  UserPlus,
  UserX,
  Wallet,
  X,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { Sidebar } from "@/components/ui/Sidebar";
import { TopNavBar } from "@/components/ui/TopNavBar";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { authFetch } from "@/lib/authFetch";
import type { Language } from "@/lib/translations";

// ---------------------------------------------------------------------------
// Data from GET /api/activity
// ---------------------------------------------------------------------------

interface ActivityEntry {
  id: string;
  action: string;
  targetCollection: string | null;
  targetId: string | null;
  transactionId: string | null;
  actorUid: string;
  actorRole: string | null;
  actorName: string | null;
  actorEmail: string | null;
  reason: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  details: Record<string, unknown> | null;
  at: string | null;
}

interface ActivityPerson {
  uid: string;
  name: string;
  email: string | null;
  role: string;
  isActive: boolean;
}

// ---------------------------------------------------------------------------
// What each logged action means
// ---------------------------------------------------------------------------

type Category =
  | "sales"
  | "orders"
  | "inventory"
  | "customers"
  | "expenses"
  | "team"
  | "settings"
  | "access";

type Tone = "brand" | "success" | "danger" | "neutral";

interface ActionInfo {
  category: Category;
  icon: LucideIcon;
  tone: Tone;
  /** Verb phrase after the person's name, per language. */
  text: Record<Language, string>;
}

/**
 * Every action the server writes (src/server/orders/*, the CRUD routes and
 * /api/activity). Kept here rather than in translations.ts: these phrases
 * only exist to read the log. Unknown actions still show, as their raw name.
 */
const ACTIONS: Record<string, ActionInfo> = {
  // Sales
  "sale.complete": { category: "sales", icon: ShoppingBag, tone: "brand", text: { en: "completed a sale", my: "အရောင်းတစ်ခု ပြီးမြောက်ခဲ့သည်" } },
  awardLoyalty: { category: "sales", icon: Gift, tone: "brand", text: { en: "awarded loyalty points", my: "အမှတ်များ ပေးခဲ့သည်" } },

  // Orders, refunds, cancellations
  processRefund: { category: "orders", icon: RotateCcw, tone: "danger", text: { en: "processed a refund", my: "ငွေပြန်အမ်းမှု ဆောင်ရွက်ခဲ့သည်" } },
  confirmReturnStatus: { category: "orders", icon: PackageCheck, tone: "neutral", text: { en: "updated a return", my: "ပြန်အပ်မှု အခြေအနေ ပြင်ခဲ့သည်" } },
  confirmRefundPayment: { category: "orders", icon: Wallet, tone: "neutral", text: { en: "paid out a refund", my: "ငွေပြန်အမ်း ပေးချေခဲ့သည်" } },
  cancel: { category: "orders", icon: XCircle, tone: "danger", text: { en: "cancelled an order", my: "အော်ဒါ ပယ်ဖျက်ခဲ့သည်" } },
  confirmCancellationRefund: { category: "orders", icon: Wallet, tone: "neutral", text: { en: "paid a cancellation refund", my: "ပယ်ဖျက်မှု ငွေပြန်အမ်း ပေးချေခဲ့သည်" } },
  approve: { category: "orders", icon: CheckCircle, tone: "success", text: { en: "approved an order", my: "အော်ဒါ အတည်ပြုခဲ့သည်" } },
  reject: { category: "orders", icon: XCircle, tone: "danger", text: { en: "rejected an order", my: "အော်ဒါ ငြင်းပယ်ခဲ့သည်" } },
  updateDeliveryStatus: { category: "orders", icon: Truck, tone: "neutral", text: { en: "updated a delivery", my: "ပို့ဆောင်မှု အခြေအနေ ပြင်ခဲ့သည်" } },
  approveCancellationRequest: { category: "orders", icon: CheckCircle, tone: "success", text: { en: "approved a cancellation request", my: "ပယ်ဖျက်ရန် တောင်းဆိုမှု အတည်ပြုခဲ့သည်" } },
  rejectCancellationRequest: { category: "orders", icon: XCircle, tone: "danger", text: { en: "rejected a cancellation request", my: "ပယ်ဖျက်ရန် တောင်းဆိုမှု ငြင်းပယ်ခဲ့သည်" } },
  approveRefundRequest: { category: "orders", icon: CheckCircle, tone: "success", text: { en: "approved a return request", my: "ပြန်အပ်ရန် တောင်းဆိုမှု အတည်ပြုခဲ့သည်" } },
  rejectRefundRequest: { category: "orders", icon: XCircle, tone: "danger", text: { en: "rejected a return request", my: "ပြန်အပ်ရန် တောင်းဆိုမှု ငြင်းပယ်ခဲ့သည်" } },
  markReturnReceived: { category: "orders", icon: PackageCheck, tone: "neutral", text: { en: "received a returned item", my: "ပြန်အပ်ပစ္စည်း လက်ခံခဲ့သည်" } },
  completeReturnInspection: { category: "orders", icon: ClipboardCheck, tone: "neutral", text: { en: "inspected a return", my: "ပြန်အပ်ပစ္စည်း စစ်ဆေးခဲ့သည်" } },
  archive: { category: "orders", icon: Trash2, tone: "danger", text: { en: "deleted a transaction", my: "ငွေလွှဲမှတ်တမ်း ဖျက်ခဲ့သည်" } },
  "onlineOrder.setStatus": { category: "orders", icon: Globe, tone: "neutral", text: { en: "changed an online order", my: "အွန်လိုင်းအော်ဒါ အခြေအနေ ပြောင်းခဲ့သည်" } },
  "onlineOrder.setPaymentStatus": { category: "orders", icon: CreditCard, tone: "neutral", text: { en: "changed an online payment", my: "အွန်လိုင်း ငွေပေးချေမှု အခြေအနေ ပြောင်းခဲ့သည်" } },

  // Inventory
  "stock.create": { category: "inventory", icon: PackagePlus, tone: "success", text: { en: "added a product", my: "ပစ္စည်းအသစ် ထည့်ခဲ့သည်" } },
  "stock.update": { category: "inventory", icon: Pencil, tone: "neutral", text: { en: "edited a product", my: "ပစ္စည်း ပြင်ဆင်ခဲ့သည်" } },
  "stock.delete": { category: "inventory", icon: Trash2, tone: "danger", text: { en: "deleted a product", my: "ပစ္စည်း ဖျက်ခဲ့သည်" } },

  // Customers
  "customer.create": { category: "customers", icon: UserPlus, tone: "success", text: { en: "added a customer", my: "ဖောက်သည်အသစ် ထည့်ခဲ့သည်" } },
  "customer.update": { category: "customers", icon: UserPen, tone: "neutral", text: { en: "edited a customer", my: "ဖောက်သည် ပြင်ဆင်ခဲ့သည်" } },
  "customer.delete": { category: "customers", icon: UserMinus, tone: "danger", text: { en: "deleted a customer", my: "ဖောက်သည် ဖျက်ခဲ့သည်" } },

  // Expenses
  "expense.create": { category: "expenses", icon: Receipt, tone: "neutral", text: { en: "added an expense", my: "ကုန်ကျစရိတ် ထည့်ခဲ့သည်" } },
  "expense.update": { category: "expenses", icon: Receipt, tone: "neutral", text: { en: "edited an expense", my: "ကုန်ကျစရိတ် ပြင်ဆင်ခဲ့သည်" } },
  "expense.delete": { category: "expenses", icon: Trash2, tone: "danger", text: { en: "deleted an expense", my: "ကုန်ကျစရိတ် ဖျက်ခဲ့သည်" } },
  "expenseCategory.create": { category: "expenses", icon: FolderPlus, tone: "neutral", text: { en: "added an expense category", my: "ကုန်ကျစရိတ် အမျိုးအစား ထည့်ခဲ့သည်" } },
  "expenseCategory.delete": { category: "expenses", icon: Trash2, tone: "danger", text: { en: "deleted an expense category", my: "ကုန်ကျစရိတ် အမျိုးအစား ဖျက်ခဲ့သည်" } },
  "spendingMenu.create": { category: "expenses", icon: FolderPlus, tone: "neutral", text: { en: "added a spending menu", my: "သုံးစွဲမှု မီနူး ထည့်ခဲ့သည်" } },
  "spendingMenu.delete": { category: "expenses", icon: Trash2, tone: "danger", text: { en: "deleted a spending menu", my: "သုံးစွဲမှု မီနူး ဖျက်ခဲ့သည်" } },

  // Staff & branches
  "staff.create": { category: "team", icon: UserPlus, tone: "success", text: { en: "added a team member", my: "ဝန်ထမ်းအသစ် ထည့်ခဲ့သည်" } },
  "staff.update": { category: "team", icon: UserPen, tone: "neutral", text: { en: "edited a team member", my: "ဝန်ထမ်း ပြင်ဆင်ခဲ့သည်" } },
  "staff.activate": { category: "team", icon: UserCheck, tone: "success", text: { en: "activated a team member", my: "ဝန်ထမ်းအကောင့် ဖွင့်ခဲ့သည်" } },
  "staff.deactivate": { category: "team", icon: UserX, tone: "danger", text: { en: "deactivated a team member", my: "ဝန်ထမ်းအကောင့် ပိတ်ခဲ့သည်" } },
  "staff.delete": { category: "team", icon: UserMinus, tone: "danger", text: { en: "removed a team member", my: "ဝန်ထမ်း ဖယ်ရှားခဲ့သည်" } },
  "shop.create": { category: "team", icon: Store, tone: "success", text: { en: "added a branch", my: "ဆိုင်ခွဲအသစ် ထည့်ခဲ့သည်" } },
  "shop.update": { category: "team", icon: Store, tone: "neutral", text: { en: "edited a branch", my: "ဆိုင်ခွဲ ပြင်ဆင်ခဲ့သည်" } },
  "shop.delete": { category: "team", icon: Trash2, tone: "danger", text: { en: "deleted a branch", my: "ဆိုင်ခွဲ ဖျက်ခဲ့သည်" } },

  // Settings
  "settings.update": { category: "settings", icon: Settings, tone: "neutral", text: { en: "updated settings", my: "ဆက်တင်များ ပြင်ဆင်ခဲ့သည်" } },
  "settings.reset": { category: "settings", icon: RotateCcw, tone: "danger", text: { en: "reset settings to default", my: "ဆက်တင်များ မူလအတိုင်း ပြန်ထားခဲ့သည်" } },
  "settings.defaultBranch": { category: "settings", icon: Store, tone: "neutral", text: { en: "changed the default branch", my: "မူလဆိုင်ခွဲ ပြောင်းခဲ့သည်" } },

  // Sign-ins
  "auth.signIn": { category: "access", icon: LogIn, tone: "neutral", text: { en: "signed in", my: "ဝင်ရောက်ခဲ့သည်" } },
  "auth.signOut": { category: "access", icon: LogOut, tone: "neutral", text: { en: "signed out", my: "ထွက်ခွာခဲ့သည်" } },
};

const FALLBACK_ACTION: Omit<ActionInfo, "text"> = {
  category: "orders",
  icon: History,
  tone: "neutral",
};

const TONE_CLASSES: Record<Tone, string> = {
  brand: "bg-rose-50 text-rose-600",
  success: "bg-emerald-50 text-emerald-600",
  danger: "bg-red-50 text-red-600",
  neutral: "bg-gray-100 text-gray-600",
};

type Period = "today" | "7d" | "30d" | "all";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Start of the selected period, in ms (undefined = no lower bound). */
function periodStart(period: Period): number | undefined {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (period === "today") return startOfToday;
  if (period === "7d") return startOfToday - 6 * DAY_MS;
  if (period === "30d") return startOfToday - 29 * DAY_MS;
  return undefined;
}

/** "partially_refunded" -> "Partially refunded" */
function humanize(value: unknown): string {
  const text = String(value ?? "").replace(/[_-]+/g, " ").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
}

const asNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

function ActivityContent() {
  const { t, language } = useLanguage();
  const { formatPrice } = useCurrency();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isCartModalOpen, setIsCartModalOpen] = useState(false);

  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [people, setPeople] = useState<ActivityPerson[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [period, setPeriod] = useState<Period>("7d");
  const [category, setCategory] = useState<Category | "all">("all");
  const [personUid, setPersonUid] = useState<string>("all");
  const [search, setSearch] = useState("");

  const fetchPage = useCallback(
    async (cursor: string | null) => {
      const params = new URLSearchParams({ limit: "80" });
      const from = periodStart(period);
      if (from !== undefined) params.set("from", String(from));
      if (cursor) params.set("cursor", cursor);

      const response = await authFetch(`/api/activity?${params.toString()}`);
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) {
        throw new Error(result?.error || t.activityLoadFailed);
      }
      return result.data as {
        entries: ActivityEntry[];
        people: ActivityPerson[];
        nextCursor: string | null;
      };
    },
    [period, t.activityLoadFailed],
  );

  const loadFirstPage = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchPage(null);
      setEntries(data.entries);
      setPeople(data.people);
      setNextCursor(data.nextCursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.activityLoadFailed);
    } finally {
      setIsLoading(false);
    }
  }, [fetchPage, t.activityLoadFailed]);

  useEffect(() => {
    void loadFirstPage();
  }, [loadFirstPage]);

  const loadMore = async () => {
    if (!nextCursor || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const data = await fetchPage(nextCursor);
      setEntries((previous) => {
        const seen = new Set(previous.map((entry) => entry.id));
        return [...previous, ...data.entries.filter((entry) => !seen.has(entry.id))];
      });
      setNextCursor(data.nextCursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.activityLoadFailed);
    } finally {
      setIsLoadingMore(false);
    }
  };

  // ---------------------------------------------------------------------
  // Presentation helpers
  // ---------------------------------------------------------------------
  const roleLabels: Record<string, string> = {
    owner: t.owner,
    manager: t.manager,
    staff: t.staff_role,
  };
  const paymentLabels: Record<string, string> = {
    cash: t.cash,
    // Both are the storefront's QR payment ("wallet" on older records).
    scan: t.onlineQrPayment,
    wallet: t.onlineQrPayment,
    cod: t.cod,
  };

  const infoOf = (entry: ActivityEntry) => ACTIONS[entry.action];

  /** The thing acted on: a receipt number or a name. */
  const targetOf = (entry: ActivityEntry): string | null => {
    if (entry.transactionId) return entry.transactionId;
    const name = entry.details?.name;
    return typeof name === "string" && name.trim() ? name : null;
  };

  /** One short line of facts under the sentence. */
  const factsOf = (entry: ActivityEntry): string[] => {
    const d = entry.details ?? {};
    const facts: string[] = [];

    switch (entry.action) {
      case "sale.complete": {
        const total = asNumber(d.total);
        if (total !== null) facts.push(formatPrice(total));
        if (typeof d.paymentMethod === "string") {
          facts.push(paymentLabels[d.paymentMethod] ?? humanize(d.paymentMethod));
        }
        const units = asNumber(d.units);
        if (units) facts.push(`${units} ${t.items.toLowerCase()}`);
        if (typeof d.customer === "string" && d.customer) facts.push(d.customer);
        if (typeof d.branch === "string" && d.branch) facts.push(d.branch);
        if (d.status === "pending") facts.push(humanize("pending"));
        break;
      }
      case "expense.create":
      case "expense.update": {
        const amount = asNumber(d.amount);
        if (amount !== null) {
          facts.push(
            `${amount.toLocaleString()} ${typeof d.currency === "string" ? d.currency : ""}`.trim(),
          );
        }
        if (typeof d.note === "string" && d.note) facts.push(d.note);
        break;
      }
      case "staff.create":
      case "staff.update":
      case "staff.delete": {
        if (typeof d.role === "string") facts.push(roleLabels[d.role] ?? humanize(d.role));
        if (typeof d.email === "string") facts.push(d.email);
        break;
      }
      case "shop.update": {
        if (typeof d.renamedFrom === "string") facts.push(`← ${d.renamedFrom}`);
        break;
      }
      case "settings.update": {
        const fields = Array.isArray(d.fields) ? d.fields.map(humanize) : [];
        if (fields.length > 0) {
          facts.push(fields.slice(0, 4).join(", ") + (fields.length > 4 ? ` +${fields.length - 4}` : ""));
        }
        break;
      }
      case "settings.defaultBranch": {
        if (typeof d.previous === "string" && d.previous) facts.push(`← ${d.previous}`);
        break;
      }
      case "stock.create":
      case "stock.update": {
        const price = asNumber(d.unitPrice);
        if (price !== null) facts.push(formatPrice(price));
        break;
      }
      default:
        break;
    }

    // Order actions carry a before/after snapshot: show what moved.
    const before = entry.before ?? null;
    const after = entry.after ?? null;
    if (before && after) {
      const refunded =
        (asNumber(after.alreadyRefunded) ?? 0) - (asNumber(before.alreadyRefunded) ?? 0);
      if (refunded > 0) facts.push(formatPrice(refunded));
      for (const key of ["status", "orderStatus", "deliveryStatus", "paymentStatus"]) {
        if (before[key] !== after[key] && after[key]) {
          facts.push(
            before[key]
              ? `${humanize(before[key])} → ${humanize(after[key])}`
              : humanize(after[key]),
          );
          break;
        }
      }
    } else if (before && !after) {
      const total = asNumber(before.total);
      if (total !== null) facts.push(formatPrice(total));
    }

    if (typeof d.deliveryStatus === "string" && !facts.some((f) => f.includes("→"))) {
      facts.push(humanize(d.deliveryStatus));
    }
    return facts;
  };

  const categoryLabels: Record<Category | "all", string> = {
    all: t.all,
    sales: t.sales,
    orders: t.activityCatOrders,
    inventory: t.inventory,
    customers: t.customers,
    expenses: t.expenses,
    team: t.activityCatTeam,
    settings: t.settings,
    access: t.activityCatAccess,
  };

  // ---------------------------------------------------------------------
  // Filtering (person, search and category run on the loaded pages)
  // ---------------------------------------------------------------------
  const basicFiltered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return entries.filter((entry) => {
      if (personUid !== "all" && entry.actorUid !== personUid) return false;
      if (!term) return true;
      const info = ACTIONS[entry.action];
      const haystack = [
        entry.actorName,
        entry.actorEmail,
        entry.transactionId,
        entry.reason,
        typeof entry.details?.name === "string" ? entry.details.name : "",
        typeof entry.details?.customer === "string" ? entry.details.customer : "",
        info ? info.text[language] : entry.action,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [entries, personUid, search, language]);

  const categoryCounts = useMemo(() => {
    const counts: Partial<Record<Category, number>> = {};
    for (const entry of basicFiltered) {
      const cat = (ACTIONS[entry.action] ?? FALLBACK_ACTION).category;
      counts[cat] = (counts[cat] ?? 0) + 1;
    }
    return counts;
  }, [basicFiltered]);

  const visible = useMemo(
    () =>
      category === "all"
        ? basicFiltered
        : basicFiltered.filter(
            (entry) => (ACTIONS[entry.action] ?? FALLBACK_ACTION).category === category,
          ),
    [basicFiltered, category],
  );

  /** Entries grouped under a day heading, newest day first. */
  const groups = useMemo(() => {
    const result: { key: string; label: string; items: ActivityEntry[] }[] = [];
    const todayKey = new Date().toDateString();
    const yesterdayKey = new Date(Date.now() - DAY_MS).toDateString();
    for (const entry of visible) {
      const date = entry.at ? new Date(entry.at) : null;
      const key = date ? date.toDateString() : "unknown";
      let group = result[result.length - 1];
      if (!group || group.key !== key) {
        const label = !date
          ? "—"
          : key === todayKey
            ? t.today
            : key === yesterdayKey
              ? t.yesterday
              : date.toLocaleDateString(language === "my" ? "my-MM" : "en-US", {
                  weekday: "long",
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                });
        group = { key, label, items: [] };
        result.push(group);
      }
      group.items.push(entry);
    }
    return result;
  }, [visible, t.today, t.yesterday, language]);

  const activePeople = useMemo(
    () => new Set(visible.map((entry) => entry.actorUid)).size,
    [visible],
  );

  // People who appear in the log plus every current account, for the filter.
  const personOptions = useMemo(() => {
    const map = new Map<string, { uid: string; name: string; role: string | null }>();
    for (const person of people) map.set(person.uid, { uid: person.uid, name: person.name, role: person.role });
    for (const entry of entries) {
      if (entry.actorUid && !map.has(entry.actorUid)) {
        map.set(entry.actorUid, {
          uid: entry.actorUid,
          name: entry.actorName || entry.actorUid,
          role: entry.actorRole,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [people, entries]);

  const periodOptions: { value: Period; label: string }[] = [
    { value: "today", label: t.today },
    { value: "7d", label: t.last7Days },
    { value: "30d", label: t.last30Days },
    { value: "all", label: t.allTime },
  ];

  const hasFilters = category !== "all" || personUid !== "all" || search.trim() !== "";

  return (
    <div className="flex h-screen bg-canvas">
      {/* Desktop Sidebar */}
      <div className="hidden lg:block">
        <Sidebar
          activeItem="activity"
          onItemClick={() => {}}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          isCartModalOpen={isCartModalOpen}
        />
      </div>

      {/* Mobile Sidebar (overlay) */}
      <div className="lg:hidden">
        <Sidebar
          activeItem="activity"
          onItemClick={() => setIsMobileSidebarOpen(false)}
          isCollapsed={false}
          isCartModalOpen={isCartModalOpen}
          isMobileOpen={isMobileSidebarOpen}
          onCloseMobile={() => setIsMobileSidebarOpen(false)}
        />
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        <TopNavBar
          onCartModalStateChange={setIsCartModalOpen}
          onMenuToggle={() => setIsMobileSidebarOpen((s) => !s)}
        />

        <main className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="mx-auto max-w-5xl space-y-5">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand text-white shadow-brand">
                  <History className="h-5 w-5" aria-hidden="true" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold tracking-tight text-gray-900">
                    {t.activityLog}
                  </h1>
                  <p className="text-sm text-gray-500">{t.activitySubtitle}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div
                  role="radiogroup"
                  aria-label={t.allTime}
                  className="flex items-center gap-1 overflow-x-auto scrollbar-none rounded-xl border border-gray-200 bg-white p-1 shadow-sm"
                >
                  {periodOptions.map((option) => {
                    const isActive = period === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={isActive}
                        onClick={() => setPeriod(option.value)}
                        className={`h-8 flex-shrink-0 whitespace-nowrap rounded-lg px-3 text-xs font-semibold transition-colors ${
                          isActive
                            ? "bg-brand text-white shadow-sm"
                            : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                        }`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={() => void loadFirstPage()}
                  disabled={isLoading}
                  aria-label={t.refresh}
                  title={t.refresh}
                  className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600 shadow-sm hover:bg-gray-50 hover:text-gray-900 disabled:opacity-60"
                >
                  <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} aria-hidden="true" />
                </button>
              </div>
            </div>

            {/* Search & person */}
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <Search
                  className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t.activitySearchPlaceholder}
                  aria-label={t.activitySearchPlaceholder}
                  className="h-10 w-full rounded-xl border border-gray-200 bg-white pl-10 pr-9 text-sm text-gray-900 placeholder-gray-400 shadow-sm focus:border-rose-400 focus:outline-none focus:ring-4 focus:ring-rose-100 [&::-webkit-search-cancel-button]:hidden"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    aria-label={t.clear}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <select
                value={personUid}
                onChange={(e) => setPersonUid(e.target.value)}
                aria-label={t.everyone}
                className="h-10 rounded-xl border border-gray-200 bg-white px-3 pr-8 text-sm font-medium text-gray-800 shadow-sm focus:border-rose-400 focus:outline-none focus:ring-4 focus:ring-rose-100 sm:w-56"
              >
                <option value="all">{t.everyone}</option>
                {personOptions.map((person) => (
                  <option key={person.uid} value={person.uid}>
                    {person.name}
                    {person.role ? ` · ${roleLabels[person.role] ?? humanize(person.role)}` : ""}
                  </option>
                ))}
              </select>
            </div>

            {/* Categories */}
            <div className="-mx-1 flex items-center gap-2 overflow-x-auto scrollbar-none px-1 pb-0.5">
              {(Object.keys(categoryLabels) as (Category | "all")[]).map((key) => {
                const count = key === "all" ? basicFiltered.length : categoryCounts[key] ?? 0;
                if (key !== "all" && count === 0 && category !== key) return null;
                const isActive = category === key;
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => setCategory(key)}
                    className={`inline-flex h-9 flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-sm font-semibold transition-all ${
                      isActive
                        ? "bg-brand text-white shadow-brand"
                        : "border border-gray-200 bg-white text-gray-600 hover:border-rose-200 hover:text-rose-700"
                    }`}
                  >
                    {categoryLabels[key]}
                    <span
                      className={`rounded-full px-1.5 text-[11px] tabular ${
                        isActive ? "bg-white/25 text-white" : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Feed */}
            {isLoading ? (
              <div className="space-y-2" aria-busy="true">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-[72px] animate-pulse rounded-2xl border border-gray-200/80 bg-white" />
                ))}
              </div>
            ) : error ? (
              <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-14 text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-400">
                  <History className="h-6 w-6" aria-hidden="true" />
                </div>
                <p className="text-base font-semibold text-gray-900">{t.activityLoadFailed}</p>
                <p className="mt-1 text-sm text-gray-500">{error}</p>
                <button
                  type="button"
                  onClick={() => void loadFirstPage()}
                  className="mt-5 inline-flex h-10 items-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white shadow-brand hover:bg-brand-strong"
                >
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  {t.tryAgain}
                </button>
              </div>
            ) : visible.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-14 text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-400">
                  <History className="h-6 w-6" aria-hidden="true" />
                </div>
                <p className="text-base font-semibold text-gray-900">
                  {hasFilters ? t.noActivityMatch : t.noActivityTitle}
                </p>
                <p className="mt-1 text-sm text-gray-500">
                  {hasFilters ? "" : t.noActivityHint}
                </p>
                {hasFilters && (
                  <button
                    type="button"
                    onClick={() => {
                      setCategory("all");
                      setPersonUid("all");
                      setSearch("");
                    }}
                    className="mt-4 text-sm font-semibold text-rose-600 hover:text-rose-700"
                  >
                    {t.clearFilters}
                  </button>
                )}
              </div>
            ) : (
              <>
                <p className="text-xs text-gray-500 tabular">
                  {visible.length} {t.actionsLabel} · {activePeople} {t.peopleLabel}
                </p>

                <div className="space-y-5">
                  {groups.map((group) => (
                    <section key={group.key} aria-label={group.label}>
                      <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-gray-400">
                        {group.label}
                      </h2>
                      <ul className="divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-sm">
                        {group.items.map((entry) => {
                          const info = infoOf(entry);
                          const Icon = (info ?? FALLBACK_ACTION).icon;
                          const tone = (info ?? FALLBACK_ACTION).tone;
                          const actorName = entry.actorName || entry.actorEmail || "—";
                          const target = targetOf(entry);
                          const facts = factsOf(entry);
                          const role = entry.actorRole ?? "";
                          return (
                            <li key={entry.id} className="flex gap-3 px-4 py-3.5 hover:bg-gray-50/60">
                              <span
                                className={`mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl ${TONE_CLASSES[tone]}`}
                                aria-hidden="true"
                              >
                                <Icon className="h-[18px] w-[18px]" />
                              </span>

                              <div className="min-w-0 flex-1">
                                <p className="text-sm leading-5 text-gray-700">
                                  <span className="font-semibold text-gray-900">{actorName}</span>{" "}
                                  {info ? info.text[language] : humanize(entry.action)}
                                  {target && (
                                    <>
                                      {" "}
                                      <span className="rounded-md bg-gray-100 px-1.5 py-0.5 font-medium text-gray-900">
                                        {target}
                                      </span>
                                    </>
                                  )}
                                </p>

                                {facts.length > 0 && (
                                  <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-gray-500 tabular">
                                    {facts.map((fact, index) => (
                                      <span key={`${fact}-${index}`} className="flex items-center gap-1.5">
                                        {index > 0 && <span className="text-gray-300" aria-hidden="true">·</span>}
                                        {fact.includes("→") ? (
                                          <span className="inline-flex items-center gap-1">
                                            {fact.split("→")[0].trim()}
                                            <ArrowRight className="h-3 w-3 text-gray-400" aria-hidden="true" />
                                            <span className="font-medium text-gray-700">{fact.split("→")[1].trim()}</span>
                                          </span>
                                        ) : (
                                          fact
                                        )}
                                      </span>
                                    ))}
                                  </p>
                                )}

                                {entry.reason && (
                                  <p className="mt-1.5 border-l-2 border-rose-200 pl-2 text-xs italic text-gray-500">
                                    “{entry.reason}”
                                  </p>
                                )}
                              </div>

                              <div className="flex flex-shrink-0 flex-col items-end gap-1">
                                <span className="text-xs font-medium text-gray-500 tabular">
                                  {entry.at
                                    ? new Date(entry.at).toLocaleTimeString("en-US", {
                                        hour: "numeric",
                                        minute: "2-digit",
                                      })
                                    : ""}
                                </span>
                                {role && (
                                  <span
                                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                      role === "owner"
                                        ? "bg-rose-50 text-rose-700"
                                        : role === "manager"
                                          ? "bg-pink-50 text-pink-700"
                                          : "bg-gray-100 text-gray-600"
                                    }`}
                                  >
                                    {roleLabels[role] ?? humanize(role)}
                                  </span>
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </section>
                  ))}
                </div>
              </>
            )}

            {!isLoading && !error && nextCursor && (
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={() => void loadMore()}
                  disabled={isLoadingMore}
                  className="inline-flex h-10 items-center gap-2 rounded-xl border border-gray-200 bg-white px-5 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-60"
                >
                  {isLoadingMore && <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />}
                  {t.loadMore}
                </button>
              </div>
            )}

            <p className="pb-2 text-center text-[11px] text-gray-400">{t.activityCoverageNote}</p>
          </div>
        </main>
      </div>
    </div>
  );
}

export default function ActivityPage() {
  return (
    <ProtectedRoute requiredRole="owner">
      <ActivityContent />
    </ProtectedRoute>
  );
}
