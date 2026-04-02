"use client";

import { useEffect, useMemo, useState } from "react";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { Sidebar } from "@/components/ui/Sidebar";
import { TopNavBar } from "@/components/ui/TopNavBar";
import { StockService } from "@/services/stockService";
import {
  onlinePromotionService,
  OnlinePromotion,
  PromotionDiscountType,
  PromotionScope,
} from "@/services/onlinePromotionService";

type StockLite = {
  id: string;
  groupName: string;
  colorVariants?: Array<{ id?: string; color?: string }>;
};

function OnlinePromotionsContent() {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [products, setProducts] = useState<StockLite[]>([]);
  const [promotions, setPromotions] = useState<OnlinePromotion[]>([]);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [scope, setScope] = useState<PromotionScope>("group");
  const [productId, setProductId] = useState("");
  const [variantId, setVariantId] = useState("");
  const [discountType, setDiscountType] =
    useState<PromotionDiscountType>("percentage");
  const [discountValue, setDiscountValue] = useState<number>(0);
  const [maxDiscountTHB, setMaxDiscountTHB] = useState<number>(0);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === productId),
    [products, productId],
  );

  const variants = useMemo(
    () => selectedProduct?.colorVariants || [],
    [selectedProduct],
  );

  const loadData = async () => {
    setLoading(true);
    try {
      const [stockRows, promotionRows] = await Promise.all([
        StockService.getAllStocks(),
        onlinePromotionService.getPromotions(),
      ]);

      setProducts(
        stockRows.map((row) => ({
          id: row.id,
          groupName: row.groupName,
          colorVariants: row.colorVariants,
        })),
      );
      setPromotions(promotionRows);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

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
  };

  const createPromotion = async () => {
    if (!name.trim() || !productId || discountValue <= 0) {
      window.alert("Please fill required fields.");
      return;
    }

    if (scope === "variant" && !variantId) {
      window.alert("Please select a variant for variant promotion.");
      return;
    }

    setSaving(true);
    try {
      const targetProduct = products.find((p) => p.id === productId);
      const targetVariant = targetProduct?.colorVariants?.find(
        (v) => v.id === variantId,
      );

      await onlinePromotionService.createPromotion({
        name: name.trim(),
        description: description.trim(),
        scope,
        productId,
        productName: targetProduct?.groupName || "",
        variantId: scope === "variant" ? variantId : "",
        variantName:
          scope === "variant"
            ? targetVariant?.color || targetVariant?.id || ""
            : "",
        discountType,
        discountValue,
        maxDiscountTHB,
        startDate,
        endDate,
        isActive: true,
      });

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
    if (!window.confirm("Delete this promotion?")) return;

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
              <h1 className="text-2xl font-semibold text-gray-900">
                Online Promotions
              </h1>
              <p className="mt-1 text-sm text-gray-600">
                Create targeted discounts for product groups or variants.
              </p>
            </div>

            <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <h2 className="text-base font-semibold text-gray-900 mb-4">
                Create Promotion
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Promotion name"
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400"
                />

                <select
                  title="PromotionScope"
                  value={scope}
                  onChange={(e) => {
                    const next = e.target.value as PromotionScope;
                    setScope(next);
                    if (next !== "variant") setVariantId("");
                  }}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                >
                  <option value="group">Group Promotion</option>
                  <option value="variant">Variant Promotion</option>
                </select>

                <select
                  title="PromotionProduct"
                  value={productId}
                  onChange={(e) => {
                    setProductId(e.target.value);
                    setVariantId("");
                  }}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                >
                  <option value="">Select product group</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.groupName}
                    </option>
                  ))}
                </select>

                {scope === "variant" ? (
                  <select
                    title="PromotionVariant"
                    value={variantId}
                    onChange={(e) => setVariantId(e.target.value)}
                    className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                  >
                    <option value="">Select variant</option>
                    {variants.map((v) => (
                      <option key={v.id || v.color} value={v.id || ""}>
                        {v.color || v.id}
                      </option>
                    ))}
                  </select>
                ) : null}

                <select
                  title="PromotionDiscountType"
                  value={discountType}
                  onChange={(e) =>
                    setDiscountType(e.target.value as PromotionDiscountType)
                  }
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                >
                  <option value="percentage">Percentage</option>
                  <option value="fixed">Fixed THB</option>
                </select>

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
                      ? "Discount THB per item"
                      : "Discount %"
                  }
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400"
                />

                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={maxDiscountTHB || ""}
                  onChange={(e) =>
                    setMaxDiscountTHB(Number(e.target.value || 0))
                  }
                  placeholder="Max discount THB (optional)"
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400"
                />

                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                />

                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                />
              </div>

              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Description (optional)"
                className="mt-3 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400"
                rows={2}
              />

              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  onClick={createPromotion}
                  disabled={saving}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Create Promotion"}
                </button>
              </div>
            </section>

            <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <h2 className="text-base font-semibold text-gray-900 mb-4">
                Existing Promotions
              </h2>

              {loading ? (
                <div className="text-sm text-gray-500">
                  Loading promotions...
                </div>
              ) : promotions.length === 0 ? (
                <div className="text-sm text-gray-500">No promotions yet.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 text-left text-gray-600 border-b border-gray-200">
                      <tr>
                        <th className="px-3 py-2 font-medium">Name</th>
                        <th className="px-3 py-2 font-medium">Scope</th>
                        <th className="px-3 py-2 font-medium">Target</th>
                        <th className="px-3 py-2 font-medium">Discount</th>
                        <th className="px-3 py-2 font-medium">Status</th>
                        <th className="px-3 py-2 font-medium text-right">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {promotions.map((row) => (
                        <tr key={row.id} className="border-t border-gray-100">
                          <td className="px-3 py-2 text-gray-900">
                            {row.name}
                          </td>
                          <td className="px-3 py-2 text-gray-700">
                            {row.scope === "group" ? "Group" : "Variant"}
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
                          <td className="px-3 py-2">
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                                row.isActive
                                  ? "bg-green-100 text-green-700"
                                  : "bg-gray-100 text-gray-700"
                              }`}
                            >
                              {row.isActive ? "Active" : "Inactive"}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <button
                              type="button"
                              onClick={() => void togglePromotion(row)}
                              className="mr-2 rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                            >
                              {row.isActive ? "Disable" : "Enable"}
                            </button>
                            <button
                              type="button"
                              onClick={() => void deletePromotion(row.id)}
                              className="rounded border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
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
