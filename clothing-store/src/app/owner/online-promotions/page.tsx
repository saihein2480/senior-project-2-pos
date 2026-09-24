"use client";

import { useEffect, useMemo, useState } from "react";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { usePermissions } from "@/hooks/usePermissions";
import { Sidebar } from "@/components/ui/Sidebar";
import { TopNavBar } from "@/components/ui/TopNavBar";
import { StockService } from "@/services/stockService";
import { ShopService } from "@/services/shopService";
import { useSettings } from "@/contexts/SettingsContext";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  onlinePromotionService,
  OnlinePromotion,
  PromotionDiscountType,
  PromotionScope,
} from "@/services/onlinePromotionService";
import {
  CustomerNotificationService,
  summariseBroadcast,
} from "@/services/customerNotificationService";

type StockLite = {
  id: string;
  groupName: string;
  /**
   * Shop document id of the branch this stock belongs to.
   *
   * A product group stocked in several branches is several stock documents, one
   * per branch, so this is what scopes the product dropdown to a branch.
   */
  shop: string;
  /** Used as the artwork on the customer announcement. */
  groupImage?: string;
  colorVariants?: Array<{ id?: string; color?: string; image?: string }>;
};

type ShopLite = { id: string; name: string };

/** Format a stored ISO/`yyyy-mm-dd` date for the table, or "-" when absent. */
function formatDate(value?: string): string {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString();
}

function OnlinePromotionsContent() {
  const permissions = usePermissions();
  const { currentBranch } = useSettings();
  const { t } = useLanguage();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [products, setProducts] = useState<StockLite[]>([]);
  const [promotions, setPromotions] = useState<OnlinePromotion[]>([]);
  const [shops, setShops] = useState<ShopLite[]>([]);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [scope, setScope] = useState<PromotionScope>("group");
  /** Shop document id. Chosen first: it scopes the product list below. */
  const [branchId, setBranchId] = useState("");
  const [productId, setProductId] = useState("");
  const [variantId, setVariantId] = useState("");
  const [discountType, setDiscountType] =
    useState<PromotionDiscountType>("percentage");
  const [discountValue, setDiscountValue] = useState<number>(0);
  const [maxDiscountTHB, setMaxDiscountTHB] = useState<number>(0);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  /**
   * Whether creating the promotion also emails and Telegram-messages every
   * opted-in customer. On by default — a promotion nobody hears about is not
   * much of a promotion — but the owner can mute it for a correction or a
   * quietly-staged offer.
   */
  const [notifyCustomers, setNotifyCustomers] = useState(true);
  const [announcing, setAnnouncing] = useState(false);

  /** Shop id -> name, so the table can label rows that only stored an id. */
  const shopLookup = useMemo(() => {
    const lookup = new Map<string, string>();
    shops.forEach((shop) => lookup.set(shop.id, shop.name));
    return lookup;
  }, [shops]);

  const selectedBranchName = useMemo(
    () => shopLookup.get(branchId) || "",
    [shopLookup, branchId],
  );

  /**
   * Products stocked in the selected branch.
   *
   * Stocks record their branch in `shop`, normally as a shop id. Older rows hold
   * the branch *name* instead, and some hold nothing at all and are treated as
   * belonging to "Main Branch" — the same tolerance the home and dashboard
   * filters apply, so those products don't silently vanish from the dropdown.
   */
  const branchProducts = useMemo(() => {
    if (!branchId) return [];

    return products.filter((product) => {
      if (product.shop === branchId) return true;
      if (selectedBranchName && product.shop === selectedBranchName) return true;
      return !product.shop && selectedBranchName === "Main Branch";
    });
  }, [products, branchId, selectedBranchName]);

  const selectedProduct = useMemo(
    () => branchProducts.find((p) => p.id === productId),
    [branchProducts, productId],
  );

  const variants = useMemo(
    () => selectedProduct?.colorVariants || [],
    [selectedProduct],
  );

  const loadData = async () => {
    setLoading(true);
    try {
      const [stockRows, promotionRows, shopRows] = await Promise.all([
        StockService.getAllStocks(),
        onlinePromotionService.getPromotions(),
        ShopService.getAllShops(),
      ]);

      setProducts(
        stockRows.map((row) => ({
          id: row.id,
          groupName: row.groupName,
          shop: row.shop || "",
          groupImage: row.groupImage,
          colorVariants: row.colorVariants,
        })),
      );
      setPromotions(promotionRows);
      setShops((shopRows || []).map((s) => ({ id: s.id, name: s.name })));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  /**
   * Default the branch to the one selected in the top bar.
   *
   * That selection is a branch *name*, so it is resolved to a shop id here. Only
   * applied while the field is untouched, so it never overrides a deliberate
   * choice mid-edit.
   */
  useEffect(() => {
    if (branchId || shops.length === 0 || !currentBranch) return;

    const match = shops.find((shop) => shop.name === currentBranch);
    if (match) setBranchId(match.id);
  }, [branchId, shops, currentBranch]);

  /** Changing branch invalidates the product and variant chosen under it. */
  const handleBranchSelect = (nextBranchId: string) => {
    setBranchId(nextBranchId);
    setProductId("");
    setVariantId("");
  };

  const resetForm = () => {
    setName("");
    setDescription("");
    setScope("group");
    setProductId("");
    setVariantId("");
    setDiscountType("percentage");
    setDiscountValue(0);
    setMaxDiscountTHB(0);
    setStartDate("");
    setEndDate("");
    // `branchId` is intentionally kept: an owner setting up several promotions
    // for one branch shouldn't have to reselect it every time.
  };

  const createPromotion = async () => {
    // Doc: "Create Promotions" - Owner + Manager only.
    if (!permissions.canCreatePromotions) {
      window.alert(t.noPermissionCreatePromotions);
      return;
    }

    if (!branchId) {
      window.alert(t.selectBranchRequired);
      return;
    }

    if (!name.trim() || !productId || discountValue <= 0) {
      window.alert(t.fillRequiredFields);
      return;
    }

    if (scope === "variant" && !variantId) {
      window.alert(t.selectVariantRequired);
      return;
    }

    // Nothing validated the range before, so a promotion could be saved with an
    // end date before its start date and would simply never be active.
    if (startDate && endDate && endDate < startDate) {
      window.alert(t.endDateBeforeStart);
      return;
    }

    setSaving(true);
    try {
      const targetProduct = branchProducts.find((p) => p.id === productId);
      const targetVariant = targetProduct?.colorVariants?.find(
        (v) => v.id === variantId,
      );

      const promotionName = name.trim();
      const promotionDescription = description.trim();
      const variantName =
        scope === "variant"
          ? targetVariant?.color || targetVariant?.id || ""
          : "";

      await onlinePromotionService.createPromotion({
        name: promotionName,
        description: promotionDescription,
        scope,
        shop: branchId,
        branchName: selectedBranchName,
        productId,
        productName: targetProduct?.groupName || "",
        variantId: scope === "variant" ? variantId : "",
        variantName,
        discountType,
        discountValue,
        maxDiscountTHB,
        startDate,
        endDate,
        isActive: true,
      });

      // The promotion is saved at this point. Announcing is a separate,
      // best-effort step: a mail or Telegram failure is reported but never
      // presented as a failure to create the promotion.
      if (notifyCustomers) {
        setAnnouncing(true);
        try {
          const outcome = await CustomerNotificationService.announcePromotion({
            name: promotionName,
            description: promotionDescription,
            discountType,
            discountValue,
            productName: targetProduct?.groupName || "",
            variantName,
            startDate,
            endDate,
            maxDiscountTHB,
            image: targetVariant?.image || targetProduct?.groupImage,
            productPath: productId ? `/product/${productId}` : undefined,
          });

          window.alert(
            outcome.ok && outcome.data
              ? `${t.promotionCreated} ${summariseBroadcast(outcome.data)}`
              : `${t.promotionCreatedNotNotified} ${
                  outcome.error || "unknown error"
                }`,
          );
        } finally {
          setAnnouncing(false);
        }
      }

      await loadData();
      resetForm();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to create promotion";
      window.alert(message);
    } finally {
      setSaving(false);
    }
  };

  const togglePromotion = async (row: OnlinePromotion) => {
    // Doc: "Edit Promotions" - Owner + Manager only.
    if (!permissions.canEditPromotions) {
      window.alert(t.noPermissionEditPromotions);
      return;
    }

    try {
      await onlinePromotionService.togglePromotion(row.id, !row.isActive);
      await loadData();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to update promotion";
      window.alert(message);
    }
  };

  const deletePromotion = async (id: string) => {
    // Doc: "Delete Promotions" - Owner + Manager only.
    if (!permissions.canDeletePromotions) {
      window.alert(t.noPermissionDeletePromotions);
      return;
    }

    if (!window.confirm(t.deletePromotionConfirm)) return;

    try {
      await onlinePromotionService.deletePromotion(id);
      await loadData();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to delete promotion";
      window.alert(message);
    }
  };

  return (
    <div className="flex h-screen bg-gray-50">
      <div className="hidden lg:block">
        <Sidebar
          activeItem="online-promotions"
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        />
      </div>

      <div className="lg:hidden">
        <Sidebar
          isMobileOpen={isMobileSidebarOpen}
          onCloseMobile={() => setIsMobileSidebarOpen(false)}
          activeItem="online-promotions"
        />
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        <TopNavBar onMenuToggle={() => setIsMobileSidebarOpen(true)} />

        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="max-w-screen-2xl mx-auto space-y-6">
            <div>
              <h1 className="text-2xl sm:text-3xl font-semibold text-gray-900 tracking-tight">
                Online Promotions
              </h1>
              <p className="text-sm text-gray-600 mt-1">
                Create targeted discounts for product groups or variants.
              </p>
            </div>

            <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <h2 className="text-base font-semibold text-gray-900 mb-4">
                {t.createPromotion}
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {/* Branch comes first: it decides which products can be promoted,
                    since a product group is stocked per branch. */}
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-gray-600">
                    {t.branch} <span className="text-rose-500">*</span>
                  </span>
                  <select
                    title={t.selectBranch}
                    value={branchId}
                    onChange={(e) => handleBranchSelect(e.target.value)}
                    className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                  >
                    <option value="">{t.selectBranch}</option>
                    {shops.map((shop) => (
                      <option key={shop.id} value={shop.id}>
                        {shop.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-gray-600">
                    {t.promotionNameLabel}{" "}
                    <span className="text-rose-500">*</span>
                  </span>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t.promotionNameLabel}
                    className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400"
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-gray-600">
                    {t.promotionScope}
                  </span>
                  <select
                    title={t.promotionScope}
                    value={scope}
                    onChange={(e) => {
                      const next = e.target.value as PromotionScope;
                      setScope(next);
                      if (next !== "variant") setVariantId("");
                    }}
                    className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                  >
                    <option value="group">{t.groupPromotion}</option>
                    <option value="variant">{t.variantPromotion}</option>
                  </select>
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-gray-600">
                    {t.productName} <span className="text-rose-500">*</span>
                  </span>
                  <select
                    title={t.selectProductGroup}
                    value={productId}
                    disabled={!branchId}
                    onChange={(e) => {
                      setProductId(e.target.value);
                      setVariantId("");
                    }}
                    className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
                  >
                    <option value="">
                      {!branchId
                        ? t.selectBranchFirst
                        : branchProducts.length === 0
                          ? t.noProductsInBranch
                          : t.selectProductGroup}
                    </option>
                    {branchProducts.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.groupName}
                      </option>
                    ))}
                  </select>
                </label>

                {scope === "variant" ? (
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-gray-600">
                      {t.variantLabel} <span className="text-rose-500">*</span>
                    </span>
                    <select
                      title={t.selectVariantOption}
                      value={variantId}
                      disabled={!productId}
                      onChange={(e) => setVariantId(e.target.value)}
                      className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
                    >
                      <option value="">
                        {!productId
                          ? t.selectProductGroup
                          : t.selectVariantOption}
                      </option>
                      {variants.map((v) => (
                        <option key={v.id || v.color} value={v.id || ""}>
                          {v.color || v.id}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}

                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-gray-600">
                    {t.discount}
                  </span>
                  <select
                    title={t.discount}
                    value={discountType}
                    onChange={(e) =>
                      setDiscountType(e.target.value as PromotionDiscountType)
                    }
                    className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                  >
                    <option value="percentage">{t.percentageDiscount}</option>
                    <option value="fixed">{t.fixedThbDiscount}</option>
                  </select>
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-gray-600">
                    {discountType === "fixed"
                      ? t.discountThbPlaceholder
                      : t.discountPercentPlaceholder}{" "}
                    <span className="text-rose-500">*</span>
                  </span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={discountValue || ""}
                    onChange={(e) =>
                      setDiscountValue(Number(e.target.value || 0))
                    }
                    placeholder={
                      discountType === "fixed"
                        ? t.discountThbPlaceholder
                        : t.discountPercentPlaceholder
                    }
                    className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400"
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-gray-600">
                    {t.maxDiscountPlaceholder}
                  </span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={maxDiscountTHB || ""}
                    onChange={(e) =>
                      setMaxDiscountTHB(Number(e.target.value || 0))
                    }
                    placeholder={t.maxDiscountPlaceholder}
                    className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400"
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-gray-600">
                    {t.startDate}
                  </span>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-gray-600">
                    {t.endDate}
                  </span>
                  <input
                    type="date"
                    value={endDate}
                    // Stops an invalid range being picked in the first place;
                    // createPromotion re-checks for typed-in dates.
                    min={startDate || undefined}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                  />
                </label>
              </div>

              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t.descriptionOptional}
                className="mt-3 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400"
                rows={2}
              />

              <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <label
                  htmlFor="notifyCustomers"
                  className="flex items-start gap-2 text-sm text-gray-700"
                >
                  <input
                    id="notifyCustomers"
                    type="checkbox"
                    checked={notifyCustomers}
                    onChange={(e) => setNotifyCustomers(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-rose-500 focus:ring-rose-400"
                  />
                  <span>
                    {t.announceToCustomers}
                    <span className="block text-xs text-gray-500">
                      {t.announceToCustomersHint}
                    </span>
                  </span>
                </label>

                <button
                  type="button"
                  onClick={createPromotion}
                  disabled={saving}
                  className="rounded-md bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 shrink-0"
                >
                  {announcing
                    ? t.announcingLabel
                    : saving
                      ? t.savingLabel
                      : t.createPromotion}
                </button>
              </div>
            </section>

            <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <h2 className="text-base font-semibold text-gray-900 mb-4">
                {t.existingPromotions}
              </h2>

              {loading ? (
                <div className="text-sm text-gray-500">
                  {t.loadingPromotions}
                </div>
              ) : promotions.length === 0 ? (
                <div className="text-sm text-gray-500">{t.noPromotionsYet}</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 text-left text-gray-600 border-b border-gray-200">
                      <tr>
                        <th className="px-3 py-2 font-medium">
                          {t.productName}
                        </th>
                        <th className="px-3 py-2 font-medium">{t.branch}</th>
                        <th className="px-3 py-2 font-medium">
                          {t.scopeColumn}
                        </th>
                        <th className="px-3 py-2 font-medium">
                          {t.targetColumn}
                        </th>
                        <th className="px-3 py-2 font-medium">{t.discount}</th>
                        <th className="px-3 py-2 font-medium">
                          {t.validityColumn}
                        </th>
                        <th className="px-3 py-2 font-medium">{t.status}</th>
                        <th className="px-3 py-2 font-medium text-right">
                          {t.actions}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {promotions.map((row) => {
                        // Promotions created before branch selection existed
                        // stored neither name nor id; fall back through both.
                        const branchLabel =
                          row.branchName ||
                          (row.shop ? shopLookup.get(row.shop) : "") ||
                          "-";

                        const hasStart = !!row.startDate;
                        const hasEnd = !!row.endDate;

                        return (
                          <tr key={row.id} className="border-t border-gray-100">
                            <td className="px-3 py-2 text-gray-900">
                              {row.name}
                            </td>
                            <td className="px-3 py-2 text-gray-700">
                              {branchLabel}
                            </td>
                            <td className="px-3 py-2 text-gray-700">
                              {row.scope === "group"
                                ? t.groupLabel
                                : t.variantLabel}
                            </td>
                            <td className="px-3 py-2 text-gray-700">
                              {row.productName || row.productId}
                              {row.scope === "variant" && row.variantName
                                ? ` / ${row.variantName}`
                                : ""}
                            </td>
                            <td className="px-3 py-2 text-gray-700">
                              {row.discountType === "fixed"
                                ? `THB ${Number(row.discountValue || 0).toFixed(2)}`
                                : `${Number(row.discountValue || 0)}%`}
                            </td>
                            <td className="px-3 py-2 text-gray-700 whitespace-nowrap">
                              {!hasStart && !hasEnd ? (
                                <span className="text-gray-500">
                                  {t.notScheduled}
                                </span>
                              ) : (
                                <>
                                  <span>{formatDate(row.startDate)}</span>
                                  <span className="mx-1 text-gray-400">→</span>
                                  <span>
                                    {hasEnd ? (
                                      formatDate(row.endDate)
                                    ) : (
                                      <span className="text-gray-500">
                                        {t.noExpiry}
                                      </span>
                                    )}
                                  </span>
                                </>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              <span
                                className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                                  row.isActive
                                    ? "bg-green-100 text-green-700"
                                    : "bg-gray-100 text-gray-700"
                                }`}
                              >
                                {row.isActive ? t.active : t.inactive}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => void togglePromotion(row)}
                                className="mr-2 rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                              >
                                {row.isActive
                                  ? t.disableAction
                                  : t.enableAction}
                              </button>
                              <button
                                type="button"
                                onClick={() => void deletePromotion(row.id)}
                                className="rounded border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                              >
                                {t.delete}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}

export default function OnlinePromotionsPage() {
  return (
    <ProtectedRoute requiredRole={["owner", "manager"]}>
      <OnlinePromotionsContent />
    </ProtectedRoute>
  );
}
