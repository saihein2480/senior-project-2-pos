"use client";

import { toast } from "react-hot-toast";
import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { X, User, CreditCard, Wallet, QrCode, Eye, Truck } from "lucide-react";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useSettings } from "@/contexts/SettingsContext";
import { SelectedCustomer } from "@/types/cart";
import { CartItem } from "@/types/cart";
import { transactionService } from "@/services/transactionService";
import type { DiscountBreakdown } from "@/services/transactionService";
import { SettingsService } from "@/services/settingsService";
import { detectColorName } from "@/lib/colorUtils";
import { isStockAdjustmentError } from "@/lib/stockMath";
import type { ReceiptBreakdown } from "@/types/receipt";
import {
  CURRENCY_DECIMALS,
  exceedsMoney,
  roundMoney,
  roundTo,
  safeDivide,
} from "@/lib/money";

type ReceiptPaperSize =
  | "44mm"
  | "57mm"
  | "58mm"
  | "69mm"
  | "76mm"
  | "78mm"
  | "80mm"
  | "82.5mm"
  | "112mm"
  | "114mm"
  | "210mm";

interface PaymentClearanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPaymentComplete: (paymentData: {
    method: PaymentMethod;
    amountPaid: number;
    change: number;
    discount: number;
  }) => void;
  customer: SelectedCustomer | null;
  items: CartItem[];
  subtotal: number;
  discount: number;
  tax: number;
  /**
   * Tax rate (percent, e.g. 7 for 7%) the cart applied to reach `tax`.
   * Recorded on the sale and printed on the receipt. Optional for older
   * callers only; without it the rate is estimated from tax / taxable base.
   */
  taxRate?: number;
  total: number;
  discountBreakdown?: DiscountBreakdown;
  /**
   * The un-collapsed money story from the cart: gross subtotal, every discount
   * component, the coupon, tax and the per-line detail. The receipt prints this
   * so the customer can check the total instead of trusting one "Discount" line.
   *
   * Optional only so the component degrades gracefully; the cart always sends it.
   */
  receiptBreakdown?: ReceiptBreakdown;
  /** Loyalty coupon applied at the till, recorded and consumed with the sale. */
  couponId?: string;
  couponCode?: string;
  couponDiscount?: number;
}

type PaymentMethod = "cash" | "scan" | "wallet" | "cod";

/** Trim floating point noise so a label reads "7%" instead of "7.000000001%". */
function formatRatePercent(percent: number): string {
  return String(Math.round(Number(percent || 0) * 100) / 100);
}

/**
 * Escape values interpolated into the print window's HTML.
 *
 * The receipt now carries free-text customer details (name, address), so they
 * must not be written into the document as markup.
 */
function escapeHtml(value: string): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * An image URL that may go into the receipt: http(s) or an inline data:image.
 * Anything else (javascript:, relative paths, other data: types) yields "" so
 * the image is simply left out.
 */
function safeImageSrc(url: string | undefined | null): string {
  const value = String(url ?? "").trim();
  return /^https?:\/\//i.test(value) || /^data:image\//i.test(value)
    ? value
    : "";
}

/** Shown where the receipt number goes until the sale is actually saved. */
const RECEIPT_NUMBER_PENDING = "Receipt no. assigned when payment is confirmed";

/**
 * Print an HTML document from a hidden iframe, so no popup (and no popup
 * blocker) is involved.
 *
 * The receipt goes in through `srcdoc`; printing starts on the frame's `load`
 * (which waits for the logo and footer image), or after `loadTimeoutMs` with
 * whatever has loaded if an image hangs. The frame is removed once the print
 * dialog closes (`afterprint`, with a fallback timer for browsers that do not
 * fire it). Rejects when the frame cannot be printed at all.
 */
function printHtmlInHiddenFrame(
  html: string,
  loadTimeoutMs = 8000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.tabIndex = -1;
    frame.title = "Receipt";
    frame.style.cssText =
      "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;";

    let printed = false;
    let removed = false;
    const remove = () => {
      if (removed) return;
      removed = true;
      frame.remove();
    };

    const print = () => {
      if (printed) return;
      printed = true;
      window.clearTimeout(loadTimer);
      const frameWindow = frame.contentWindow;
      if (!frameWindow) {
        remove();
        reject(new Error("The print frame could not be created."));
        return;
      }
      try {
        frameWindow.addEventListener("afterprint", () => window.setTimeout(remove, 0), {
          once: true,
        });
        frameWindow.focus();
        frameWindow.print();
        // Most browsers block in print() until the dialog closes; the others
        // fire afterprint. Either way the frame goes; this is the backstop.
        window.setTimeout(remove, 60_000);
        resolve();
      } catch (error) {
        remove();
        reject(error);
      }
    };

    const loadTimer = window.setTimeout(print, loadTimeoutMs);
    frame.addEventListener("load", () => {
      // Only the receipt document counts, not an initial empty about:blank.
      const isReceipt =
        frame.contentWindow?.location.href === "about:srcdoc" ||
        !!frame.contentDocument?.body?.firstElementChild;
      if (isReceipt) print();
    });
    frame.srcdoc = html;
    document.body.appendChild(frame);
  });
}

export function PaymentClearanceModal({
  isOpen,
  onClose,
  onPaymentComplete,
  customer,
  items,
  subtotal,
  discount,
  tax,
  taxRate,
  total: goodsTotal,
  discountBreakdown,
  receiptBreakdown,
  couponId,
  couponCode,
  couponDiscount,
}: PaymentClearanceModalProps) {
  const router = useRouter();
  const { formatPrice, selectedCurrency, currencyRate, defaultCurrency } =
    useCurrency();
  const { user } = useAuth();
  // The cashier's own working branch (not the business-wide default): the
  // sale is recorded against it, by shop id as well as name.
  const { branch: currentBranchRef, businessSettings } = useSettings();
  const { t } = useLanguage();
  const [selectedPaymentMethod, setSelectedPaymentMethod] =
    useState<PaymentMethod>("cash");

  /**
   * COD orders are delivered, so they carry the flat delivery fee from
   * Settings (business_settings/main.deliveryFee, THB, kept live by
   * SettingsContext). It is added after tax: not taxed, not discounted,
   * no loyalty points, never refunded on a return. Cash sales have none.
   */
  const configuredDeliveryFee = roundMoney(
    Math.max(0, Number(businessSettings?.deliveryFee) || 0),
    defaultCurrency,
  );
  const deliveryFee =
    selectedPaymentMethod === "cod" ? configuredDeliveryFee : 0;
  /** What the customer owes: the cart's total plus any delivery fee. */
  const total = roundMoney(goodsTotal + deliveryFee, defaultCurrency);
  const [amountPaid, setAmountPaid] = useState<number>(0);
  const [calculatorDisplay, setCalculatorDisplay] = useState<string>("0");
  const [showDetailModal, setShowDetailModal] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [showReceipt, setShowReceipt] = useState<boolean>(false);
  const [receiptData, setReceiptData] = useState<{
    /**
     * Receipt number. null while the preview is shown: the number is allocated
     * by recordSale together with the sale document, so a preview that is
     * cancelled never uses one up.
     */
    transactionId: string | null;
    /** Identifies this preview, so auto-print fires once per checkout. */
    previewKey: string;
    customer: SelectedCustomer | null;
    items: CartItem[];
    subtotal: number;
    tax: number;
    discount: number;
    /** COD delivery fee (THB), already included in `total`; 0 otherwise. */
    deliveryFee: number;
    total: number;
    amountPaid: number;
    change: number;
    paymentMethod: PaymentMethod;
    timestamp: string;
    branchName: string;
    /** shops/{id} of the branch, when it resolves to a shop. */
    shopId?: string;
    businessName: string;
    invoiceFooterMessage: string;
    invoiceFooterImage: string;
    showBusinessLogo: boolean;
    businessLogo: string;
    autoPrintReceipt: boolean;
    sellingCurrency: string;
    exchangeRate: number;
    sellingTotal: number;
    cashierRole: string;
    cashierName: string;
    /** Full discount/promotion breakdown, printed line by line. */
    breakdown: ReceiptBreakdown;
  } | null>(null);
  const [receiptSize, setReceiptSize] = useState<ReceiptPaperSize>("80mm");
  const amountInputRef = useRef<HTMLInputElement | null>(null);
  const autoPrintedPreviewRef = useRef<string | null>(null);
  const handlePrintReceiptRef = useRef<(() => Promise<void>) | null>(null);
  /** Synchronous guard: state updates are too late to stop a double click. */
  const confirmInFlightRef = useRef(false);
  /** Receipt number once this checkout's sale is saved; never record twice. */
  const savedTransactionIdRef = useRef<string | null>(null);

  // Get receipt width in pixels based on paper size
  const getReceiptWidth = (size: ReceiptPaperSize): string => {
    const widthMap: Record<ReceiptPaperSize, string> = {
      "44mm": "w-[165px] sm:w-[180px] lg:w-[210px] xl:w-[230px] 2xl:w-[250px]",
      "57mm": "w-[215px] sm:w-[230px] lg:w-[260px] xl:w-[285px] 2xl:w-[310px]",
      "58mm": "w-[220px] sm:w-[240px] lg:w-[270px] xl:w-[300px] 2xl:w-[330px]",
      "69mm": "w-[260px] sm:w-[280px] lg:w-[320px] xl:w-[355px] 2xl:w-[390px]",
      "76mm": "w-[287px] sm:w-[310px] lg:w-[355px] xl:w-[395px] 2xl:w-[435px]",
      "78mm": "w-[295px] sm:w-[318px] lg:w-[365px] xl:w-[405px] 2xl:w-[450px]",
      "80mm": "w-[300px] sm:w-[320px] lg:w-[370px] xl:w-[420px] 2xl:w-[470px]",
      "82.5mm":
        "w-[310px] sm:w-[335px] lg:w-[385px] xl:w-[435px] 2xl:w-[490px]",
      "112mm": "w-[422px] sm:w-[455px] lg:w-[525px] xl:w-[595px] 2xl:w-[665px]",
      "114mm": "w-[430px] sm:w-[465px] lg:w-[535px] xl:w-[605px] 2xl:w-[680px]",
      "210mm":
        "w-full max-w-[650px] lg:max-w-[750px] xl:max-w-[850px] 2xl:max-w-[950px]",
    };
    return widthMap[size] || widthMap["80mm"];
  };

  // Load default receipt paper size from settings
  useEffect(() => {
    const loadReceiptSettings = async () => {
      try {
        const settings = await SettingsService.getBusinessSettings();
        if (settings?.receiptPaperSize) {
          setReceiptSize(settings.receiptPaperSize);
        }
      } catch (error) {
        console.error("Error loading receipt settings:", error);
      }
    };
    loadReceiptSettings();
  }, []);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setAmountPaid(0);
      setCalculatorDisplay("0");
      setSelectedPaymentMethod("cash");
      setIsProcessing(false);
      setShowReceipt(false);
      setReceiptData(null);
      confirmInFlightRef.current = false;
      savedTransactionIdRef.current = null;
      // Focus the amount input after modal opens
      setTimeout(() => {
        try {
          if (amountInputRef.current) {
            amountInputRef.current.focus();
            const len = (amountInputRef.current.value || "").length;
            amountInputRef.current.setSelectionRange(len, len);
          }
        } catch {
          // ignore
        }
      }, 50);
    }
  }, [isOpen]);

  // Cash is counted in the selling currency, rounded to its minor unit (whole
  // kyat for MMK), and compared with the money helpers rather than raw floats.
  const totalInSellingCurrency =
    selectedCurrency === defaultCurrency
      ? roundMoney(total, selectedCurrency)
      : SettingsService.convertPrice(
          total,
          defaultCurrency,
          selectedCurrency,
          currencyRate,
          defaultCurrency,
        );
  const paidInSellingCurrency = roundMoney(amountPaid, selectedCurrency);
  const change = roundMoney(
    paidInSellingCurrency - totalInSellingCurrency,
    selectedCurrency,
  );
  /** Cash tendered falls short of the total by at least one minor unit. */
  const isCashShort =
    selectedPaymentMethod === "cash" &&
    exceedsMoney(totalInSellingCurrency, paidInSellingCurrency, selectedCurrency);

  /**
   * The rate the cart applied. Only when it was not passed is it estimated
   * from the amounts, which is inexact once tax has been rounded.
   */
  const appliedTaxRate = (() => {
    const passed = Number(taxRate);
    if (taxRate !== undefined && Number.isFinite(passed)) return passed;
    if (receiptBreakdown) return receiptBreakdown.taxRate;
    const taxableBase = roundMoney(subtotal - discount, defaultCurrency);
    return taxableBase > 0 && tax > 0
      ? roundTo(safeDivide(tax, taxableBase, 0) * 100, 2)
      : 0;
  })();

  /**
   * The cart computes the full breakdown and passes it down. This fallback only
   * exists so the receipt still balances if it ever arrives without one: the
   * whole saving is reported as a cart discount, because the till's collapsed
   * `discount` already has the coupon folded into it and counting the coupon
   * again here would double it.
   */
  const fallbackTaxableBase = roundMoney(subtotal - discount, defaultCurrency);
  const effectiveBreakdown: ReceiptBreakdown = receiptBreakdown
    ? { ...receiptBreakdown, taxRate: appliedTaxRate, deliveryFee, total }
    : {
        grossSubtotal: subtotal,
        wholesaleSavings: 0,
        groupPercentSavings: 0,
        groupFixedTotal: 0,
        variantPercentSavings: 0,
        variantFixedTotal: 0,
        cartDiscount: discount,
        cartDiscountPercent: 0,
        itemsTotal: subtotal,
        subtotalAfterDiscounts: fallbackTaxableBase,
        couponCode: undefined,
        couponDiscount: 0,
        taxableBase: fallbackTaxableBase,
        taxRate: appliedTaxRate,
        tax,
        deliveryFee,
        total,
        totalSavings: discount,
        lines: items.map((item) => {
          const lineTotal = roundMoney(
            item.unitPrice * item.quantity,
            defaultCurrency,
          );
          return {
            itemId: item.id,
            originalUnitPrice: item.unitPrice,
            finalUnitPrice: item.unitPrice,
            lineOriginalTotal: lineTotal,
            lineFinalTotal: lineTotal,
            lineSavings: 0,
            discountLabels: [],
          };
        }),
      };

  const handleCalculatorInput = (value: string) => {
    if (value === "Clear") {
      setCalculatorDisplay("0");
      setAmountPaid(0);
      return;
    }

    if (value === "⌫") {
      if (calculatorDisplay.length > 1) {
        const newDisplay = calculatorDisplay.slice(0, -1);
        setCalculatorDisplay(newDisplay);
        setAmountPaid(parseFloat(newDisplay) || 0);
      } else {
        setCalculatorDisplay("0");
        setAmountPaid(0);
      }
      return;
    }

    if (value === ".") {
      if (!calculatorDisplay.includes(".")) {
        const newDisplay = calculatorDisplay + ".";
        setCalculatorDisplay(newDisplay);
        setAmountPaid(parseFloat(newDisplay) || 0);
      }
      return;
    }

    // Handle numbers
    if (!isNaN(parseInt(value))) {
      const newDisplay =
        calculatorDisplay === "0" ? value : calculatorDisplay + value;
      setCalculatorDisplay(newDisplay);
      setAmountPaid(parseFloat(newDisplay) || 0);
    }
  };

  const isProbablyId = (s?: string) =>
    !!s &&
    (/(^cv|[-_].+-)/.test(s) || // Original ID patterns
      /^\d{13,}/.test(s) || // Long numeric IDs (timestamps)
      /^[a-f0-9]{16,}$/i.test(s) || // Long hex IDs
      /^\d+[a-z]{5,}$/i.test(s)); // Timestamp + random chars
  const getDisplayColor = (item: CartItem) => {
    const hex = (item.colorCode as string) || "#000000";
    if (item.selectedColor && !isProbablyId(item.selectedColor)) {
      return item.selectedColor;
    }
    try {
      return detectColorName(hex) || hex;
    } catch {
      return hex;
    }
  };

  const handleQuickAmount = (amount: number) => {
    const newAmount = roundMoney(amountPaid + amount, selectedCurrency);
    setAmountPaid(newAmount);
    setCalculatorDisplay(newAmount.toString());
  };

  const handlePayNow = async () => {
    if (isCashShort) {
      toast.error(t.insufficientPaymentAmount);
      return;
    }

    if (isProcessing) {
      return; // Prevent duplicate submissions
    }

    setIsProcessing(true);

    try {
      // No receipt number yet: recordSale allocates it together with the sale
      // document on confirmation, so cancelling this preview leaves no gap.

      // Selling-currency total and the rate behind it. The configured rate is
      // "1 default = rate selling"; when it is unset the conversion is 1:1, so
      // the ratio (or 1 for a zero total) is recorded instead of NaN/Infinity.
      let currentExchangeRate: number;
      const sellingTotal = totalInSellingCurrency;

      if (selectedCurrency === defaultCurrency) {
        currentExchangeRate = 1;
      } else {
        const configuredRate = Number(currencyRate);
        currentExchangeRate =
          Number.isFinite(configuredRate) && configuredRate > 0
            ? configuredRate
            : safeDivide(sellingTotal, total, 1);
      }

      // Business name, footer and logo come from the settings document; the
      // branch is the cashier's own selection. It used to be the business
      // default here, so a sale rung up at another branch was recorded
      // against the default one.
      const settings = await SettingsService.getBusinessSettings();
      const currentBranch = currentBranchRef.name || "Main Branch";
      const previewTimestamp = new Date().toISOString();

      // Prepare receipt data and show receipt preview (NO database write yet)
      setReceiptData({
        transactionId: null,
        previewKey: `${previewTimestamp}-${Math.random().toString(36).slice(2)}`,
        customer,
        items,
        subtotal,
        tax,
        discount,
        deliveryFee,
        total,
        amountPaid:
          selectedPaymentMethod === "cash" ? paidInSellingCurrency : total,
        change: selectedPaymentMethod === "cash" ? change : 0,
        paymentMethod: selectedPaymentMethod,
        timestamp: previewTimestamp,
        branchName: currentBranch,
        shopId: currentBranchRef.id || undefined,
        businessName: settings?.businessName || "Shop",
        invoiceFooterMessage: settings?.invoiceFooterMessage || "",
        invoiceFooterImage: settings?.invoiceFooterImage || "",
        showBusinessLogo: settings?.showBusinessLogoOnInvoice ?? true,
        businessLogo: settings?.businessLogo || "",
        autoPrintReceipt: settings?.autoPrintReceiptAfterCheckout ?? true,
        sellingCurrency: selectedCurrency,
        exchangeRate: currentExchangeRate,
        sellingTotal: sellingTotal,
        cashierRole: user?.role
          ? user.role.charAt(0).toUpperCase() + user.role.slice(1)
          : "Staff",
        cashierName:
          user?.displayName?.trim() || user?.email?.split("@")[0] || "",
        breakdown: effectiveBreakdown,
      });
      setShowReceipt(true);
      setIsProcessing(false);
    } catch (error) {
      setIsProcessing(false);
      console.error("Error preparing receipt:", error);
      toast.error(
        `${t.errorPreparingReceipt}: ${
          error instanceof Error ? error.message : t.unknownError
        }. ${t.pleaseTryAgain}`,
      );
    }
  };

  /**
   * Save the sale (called by the Print and Skip buttons, and by auto-print).
   *
   * recordSale allocates the receipt number and writes the sale document in
   * one Firestore transaction, so a number exists only for a saved sale.
   * Resolves to that receipt number, or null when nothing was saved (an error
   * toast has been shown); callers must not print or navigate on null.
   */
  const handleConfirmPayment = async (): Promise<string | null> => {
    if (savedTransactionIdRef.current) return savedTransactionIdRef.current;
    if (!receiptData || confirmInFlightRef.current) return null;

    confirmInFlightRef.current = true;
    setIsProcessing(true);

    try {
      // Determine transaction status based on payment method
      // Cash = completed immediately
      // COD and Scan = pending (requires confirmation)
      const transactionStatus =
        selectedPaymentMethod === "cash" ? "completed" : "pending";

      // Record the sale; the receipt number comes back with it.
      const sale = await transactionService.recordSale({
        customer,
        items,
        subtotal,
        tax,
        discount,
        // The figures the customer was shown on the preview (the fee is
        // fixed there, even if Settings change before confirmation).
        total: receiptData.total,
        ...(receiptData.deliveryFee > 0 ? { deliveryFee: receiptData.deliveryFee } : {}),
        amountPaid: receiptData.amountPaid,
        change: receiptData.change,
        paymentMethod: selectedPaymentMethod,
        timestamp: new Date().toISOString(),
        status: transactionStatus,
        branchName: receiptData.branchName,
        // Branch identity is the shop id; the name is kept for receipts and
        // older readers. Filters use matchesBranch (src/lib/branch.ts).
        ...(receiptData.shopId ? { shopId: receiptData.shopId } : {}),
        // Attribute the sale to the signed-in operator. Reports previously
        // showed whoever was *viewing* them as the seller, because nothing was
        // ever recorded here.
        ...(user
          ? {
              soldByUid: user.uid,
              soldByName:
                user.displayName?.trim() ||
                user.email?.split("@")[0] ||
                "Staff",
              soldByRole: user.role,
            }
          : {}),
        sellingCurrency: selectedCurrency,
        exchangeRate: receiptData.exchangeRate,
        sellingTotal: receiptData.sellingTotal,
        discountBreakdown,
        // Receipt-grade figures, recorded additively so a reprint or a report
        // can show the same itemised breakdown the customer was handed.
        // `subtotal` and `discount` above keep their existing meaning, so
        // nothing that already reads them changes behaviour.
        grossSubtotal: receiptData.breakdown.grossSubtotal,
        totalSavings: receiptData.breakdown.totalSavings,
        // The rate the cart applied, passed down explicitly.
        taxRate: receiptData.breakdown.taxRate,
        ...(couponId
          ? {
              couponId,
              couponCode,
              couponDiscount,
            }
          : {}),
      });

      savedTransactionIdRef.current = sale.transactionId;
      console.log(
        "Sale recorded:",
        sale.transactionId,
        `(document ${sale.id})`,
      );

      // The preview now shows the real receipt number.
      setReceiptData((prev) =>
        prev ? { ...prev, transactionId: sale.transactionId } : prev,
      );

      // Show appropriate success message
      if (transactionStatus === "pending") {
        toast.success(
          `${selectedPaymentMethod.toUpperCase()} ${t.orderCreatedPendingConfirmation}`,
        );
      }

      // Complete payment (clear cart, etc.)
      onPaymentComplete({
        method: selectedPaymentMethod,
        amountPaid: receiptData.amountPaid,
        change: receiptData.change,
        discount: receiptData.discount,
      });

      return sale.transactionId;
    } catch (error) {
      console.error("Error recording transaction:", error);
      if (isStockAdjustmentError(error)) {
        // The shelf can't cover the cart (or a line no longer matches its
        // variant). Nothing was saved; the cashier fixes the cart and retries.
        toast.error(`${error.message.replace(/\.$/, "")}. The sale was not saved.`, {
          duration: 7000,
        });
      } else {
        toast.error(
          `${t.errorRecordingTransaction}: ${
            error instanceof Error ? error.message : t.unknownError
          }. ${t.pleaseTryAgain}`,
        );
      }
      return null;
    } finally {
      confirmInFlightRef.current = false;
      setIsProcessing(false);
    }
  };

  const getCurrentDateTime = () => {
    const now = new Date();
    const options: Intl.DateTimeFormatOptions = {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    };
    return now.toLocaleDateString("en-US", options);
  };

  /** One line of the items section, already formatted for the selling currency. */
  type ReceiptItemRow = {
    name: string;
    /** "2 x ฿100.00" at the catalogue price. */
    quantityLine: string;
    /** Line total at the catalogue price, so the lines sum to the gross subtotal. */
    amount: string;
    /** Why it was discounted, e.g. "Group -10%". Empty when nothing applied. */
    discountLabels: string[];
    /** What this line saved, only when non-zero. */
    savedLine?: string;
    /** Line total actually charged, only shown when a discount applied. */
    netLine?: string;
  };

  /** One line of the totals section. */
  type ReceiptTotalRow = {
    label: string;
    value: string;
    /**
     * How to present it: a saving (shown negative), a running subtotal, the
     * grand total, the savings summary, or a plain payment fact.
     */
    tone: "discount" | "subtotal" | "grand" | "savings" | "plain";
  };

  /**
   * Build the printable item lines.
   *
   * Each line is quoted at the catalogue price and then shows its own discount
   * and what was actually charged. That way the line amounts sum to the gross
   * subtotal and the "you pay" amounts sum to the discounted subtotal, so the
   * customer can check the receipt at either level. The old receipt printed the
   * catalogue price as though it were the charged price, with no discount shown
   * on the line at all, so the items never reconciled with the total beneath them.
   */
  const buildItemRows = (
    data: NonNullable<typeof receiptData>,
  ): ReceiptItemRow[] => {
    const detailById = new Map(
      data.breakdown.lines.map((line) => [line.itemId, line]),
    );

    return data.items.map((item) => {
      const detail = detailById.get(item.id);
      const originalUnitPrice = detail?.originalUnitPrice ?? item.unitPrice;
      const lineOriginalTotal =
        detail?.lineOriginalTotal ?? originalUnitPrice * item.quantity;
      const savings = detail?.lineSavings ?? 0;
      const lineFinalTotal = detail?.lineFinalTotal ?? lineOriginalTotal;

      const colorName = item.selectedColor
        ? detectColorName(item.selectedColor) || item.selectedColor
        : "";
      const variant = [colorName, item.selectedSize].filter(Boolean).join(" - ");

      return {
        name: variant ? `${item.groupName} ${variant}` : item.groupName,
        quantityLine: `${item.quantity} x ${formatPrice(originalUnitPrice)}`,
        amount: formatPrice(lineOriginalTotal),
        discountLabels: detail?.discountLabels ?? [],
        savedLine: savings > 0 ? `-${formatPrice(savings)}` : undefined,
        netLine: savings > 0 ? formatPrice(lineFinalTotal) : undefined,
      };
    });
  };

  /**
   * Build the printable totals lines.
   *
   * The order mirrors how the price was actually reached: the catalogue subtotal,
   * each item-level discount, the subtotal those leave, then the order-level cart
   * discount and coupon, then tax and the total. Zero-value discounts and the
   * running subtotals they would explain are omitted, so a plain sale with no
   * promotion still prints a short receipt.
   */
  const buildTotalRows = (
    data: NonNullable<typeof receiptData>,
  ): ReceiptTotalRow[] => {
    const b = data.breakdown;
    const rows: ReceiptTotalRow[] = [];
    const sellingCurrency = data.sellingCurrency as "THB" | "MMK";

    const itemDiscountRows: Array<[string, number]> = [
      [t.wholesalePriceSaving, b.wholesaleSavings],
      [t.groupDiscountLabel, b.groupPercentSavings],
      [t.groupOffer, b.groupFixedTotal],
      [t.variantDiscountLabel, b.variantPercentSavings],
      [t.variantOffer, b.variantFixedTotal],
    ];

    const hasItemDiscount = itemDiscountRows.some(([, amount]) => amount > 0);

    rows.push({
      label: hasItemDiscount ? t.grossSubtotalLabel : t.subtotal,
      value: formatPrice(b.grossSubtotal),
      tone: "plain",
    });

    itemDiscountRows.forEach(([label, amount]) => {
      if (amount > 0) {
        rows.push({
          label,
          value: `-${formatPrice(amount)}`,
          tone: "discount",
        });
      }
    });

    if (hasItemDiscount) {
      rows.push({
        label: t.subtotalAfterItemDiscount,
        value: formatPrice(b.itemsTotal),
        tone: "subtotal",
      });
    }

    if (b.cartDiscount > 0) {
      rows.push({
        label:
          b.cartDiscountPercent > 0
            ? `${t.cartDiscountLabel} (${b.cartDiscountPercent}%)`
            : t.cartDiscountLabel,
        value: `-${formatPrice(b.cartDiscount)}`,
        tone: "discount",
      });

      // Only worth stating when there is also a coupon to take off it; otherwise
      // the next line is tax and the total already shows the result.
      if (b.couponDiscount > 0) {
        rows.push({
          label: t.subtotalAfterDiscount,
          value: formatPrice(b.subtotalAfterDiscounts),
          tone: "subtotal",
        });
      }
    }

    if (b.couponDiscount > 0) {
      rows.push({
        label: b.couponCode
          ? `${t.couponLabel} (${b.couponCode})`
          : t.couponLabel,
        value: `-${formatPrice(b.couponDiscount)}`,
        tone: "discount",
      });
    }

    rows.push({
      label: `${t.tax} (${formatRatePercent(b.taxRate)}%)`,
      value: formatPrice(b.tax),
      tone: "plain",
    });

    if (data.deliveryFee > 0) {
      rows.push({
        label: t.deliveryFeeLabel,
        value: formatPrice(data.deliveryFee),
        tone: "plain",
      });
    }

    rows.push({ label: t.total, value: formatPrice(b.total), tone: "grand" });

    if (b.totalSavings > 0) {
      rows.push({
        label: t.youSavedLabel,
        value: formatPrice(b.totalSavings),
        tone: "savings",
      });
    }

    // Amounts below are already in the selling currency, so they are formatted
    // with it explicitly rather than being converted a second time.
    if (data.sellingCurrency !== defaultCurrency) {
      rows.push({
        label: `${t.total} (${data.sellingCurrency})`,
        value: formatPrice(data.sellingTotal, sellingCurrency),
        tone: "plain",
      });
    }

    if (data.paymentMethod === "cash") {
      rows.push({
        label: t.paid,
        value: formatPrice(data.amountPaid, sellingCurrency),
        tone: "plain",
      });
      rows.push({
        label: t.change,
        value: formatPrice(data.change, sellingCurrency),
        tone: "plain",
      });
    }

    rows.push({
      label: t.paymentMethod,
      value: data.paymentMethod.toUpperCase(),
      tone: "plain",
    });

    return rows;
  };

  /**
   * Customer and cashier facts printed above the items. Only what exists is
   * printed, so a quick anonymous cash sale still gets a clean receipt.
   */
  const buildInfoRows = (
    data: NonNullable<typeof receiptData>,
  ): Array<[string, string]> => {
    const rows: Array<[string, string]> = [];
    const c = data.customer;

    if (c) {
      rows.push([t.customer, c.displayName || c.email || "-"]);
      if (c.phone) rows.push([t.phone, c.phone]);
      if (c.address) rows.push([t.address, c.address]);
      if (c.email && c.displayName) rows.push([t.account, c.email]);
    }

    rows.push([
      t.cashier,
      data.cashierName
        ? `${data.cashierName} (${data.cashierRole || "Staff"})`
        : data.cashierRole || "Staff",
    ]);

    return rows;
  };

  /**
   * The printable receipt for a saved sale. Every interpolated value is
   * escaped, and images are limited to http(s)/data:image URLs.
   */
  const buildReceiptHtml = (
    data: NonNullable<typeof receiptData>,
    transactionId: string,
  ): string => {
    const logoSrc = data.showBusinessLogo ? safeImageSrc(data.businessLogo) : "";
    const footerImageSrc = safeImageSrc(data.invoiceFooterImage);

    // Dynamic sizing based on paper size
    const getPrintSizes = (size: ReceiptPaperSize) => {
      switch (size) {
        case "44mm":
          return {
            width: "40mm",
            fontSize: "9px",
            titleSize: "13px",
            detailSize: "8px",
          };
        case "57mm":
          return {
            width: "44mm",
            fontSize: "9px",
            titleSize: "13px",
            detailSize: "8px",
          };
        case "58mm":
          return {
            width: "44mm",
            fontSize: "10px",
            titleSize: "14px",
            detailSize: "9px",
          };
        case "69mm":
          return {
            width: "60mm",
            fontSize: "11px",
            titleSize: "15px",
            detailSize: "10px",
          };
        case "76mm":
        case "78mm":
          return {
            width: "68mm",
            fontSize: "11px",
            titleSize: "15px",
            detailSize: "10px",
          };
        case "80mm":
        case "82.5mm":
          return {
            width: "72mm",
            fontSize: "12px",
            titleSize: "16px",
            detailSize: "11px",
          };
        case "112mm":
        case "114mm":
          return {
            width: "100mm",
            fontSize: "14px",
            titleSize: "18px",
            detailSize: "12px",
          };
        case "210mm":
          return {
            width: "190mm",
            fontSize: "16px",
            titleSize: "20px",
            detailSize: "14px",
          };
        default:
          return {
            width: "72mm",
            fontSize: "12px",
            titleSize: "16px",
            detailSize: "11px",
          };
      }
    };

    const { width, fontSize, titleSize, detailSize } =
      getPrintSizes(receiptSize);

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>${escapeHtml(t.receipt)} - ${escapeHtml(transactionId)}</title>
          <style>
            @media print {
              @page {
                size: ${width} auto;
                margin: 0;
              }
              body {
                margin: 0;
                padding: 0;
              }
            }
            body {
              font-family: 'Noto Sans Myanmar', 'Noto Sans Thai', 'Segoe UI', Arial, sans-serif;
              width: ${width};
              margin: 0 auto;
              padding: 8px;
              font-size: ${fontSize};
              line-height: 1.4;
            }
            .header {
              text-align: center;
              margin-bottom: 10px;
              border-bottom: 1px dashed #000;
              padding-bottom: 8px;
            }
            .logo {
              max-width: 120px;
              max-height: 60px;
              margin: 0 auto 6px;
              object-fit: contain;
              display: block;
            }
            .title {
              font-size: ${titleSize};
              font-weight: bold;
              margin-bottom: 4px;
            }
            .branch {
              font-size: ${fontSize};
              margin-bottom: 2px;
            }
            .datetime {
              font-size: ${fontSize};
              margin-top: 4px;
            }
            .info-row {
              display: flex;
              justify-content: space-between;
              margin: 2px 0;
            }
            .items {
              margin: 10px 0;
              border-top: 1px dashed #000;
              border-bottom: 1px dashed #000;
              padding: 8px 0;
            }
            .item {
              margin: 4px 0;
            }
            .item-name {
              font-weight: bold;
            }
            .item-details {
              font-size: ${detailSize};
              color: #333;
              margin-left: 4px;
            }
            .item-line {
              display: flex;
              justify-content: space-between;
              margin-top: 2px;
            }
            .item-note {
              font-size: ${detailSize};
              color: #333;
              margin-top: 1px;
            }
            .item-saving {
              display: flex;
              justify-content: space-between;
              font-size: ${detailSize};
              margin-top: 1px;
            }
            .totals {
              margin-top: 10px;
            }
            .total-line {
              display: flex;
              justify-content: space-between;
              margin: 4px 0;
              gap: 6px;
            }
            .total-line span:last-child {
              text-align: right;
              white-space: nowrap;
            }
            .discount-line {
              font-size: ${detailSize};
              padding-left: 6px;
            }
            .subtotal-line {
              font-weight: bold;
              border-top: 1px dotted #000;
              padding-top: 4px;
            }
            .savings-line {
              font-weight: bold;
              border-bottom: 1px dashed #000;
              padding-bottom: 4px;
              margin-bottom: 4px;
            }
            .grand-total {
              font-weight: bold;
              font-size: ${titleSize};
              border-top: 1px solid #000;
              border-bottom: 1px solid #000;
              padding: 6px 0;
              margin: 6px 0;
            }
            .footer {
              text-align: center;
              margin-top: 10px;
              border-top: 1px dashed #000;
              padding-top: 8px;
            }
            .thank-you {
              font-weight: bold;
              margin: 4px 0;
            }
          </style>
        </head>
        <body>
          <div class="header">
            ${
              logoSrc
                ? `<img class="logo" src="${escapeHtml(logoSrc)}" alt="${escapeHtml(t.businessLogo)}" />`
                : ""
            }
            <div class="title">${escapeHtml(data.businessName || t.receipt)}</div>
            <div class="branch">${escapeHtml(data.branchName || "Main Branch")}</div>
            <div class="datetime">${escapeHtml(new Date(data.timestamp).toLocaleString())}</div>
            <div style="margin-top: 4px;">${escapeHtml(t.transaction)}: ${escapeHtml(transactionId)}</div>
          </div>

          ${buildInfoRows(data)
            .map(
              ([label, value]) => `
          <div class="info-row">
            <span>${escapeHtml(label)}:</span>
            <span>${escapeHtml(value)}</span>
          </div>`,
            )
            .join("")}

          <div class="items">
            ${buildItemRows(data)
              .map(
                (row) => `
              <div class="item">
                <div class="item-name">${escapeHtml(row.name)}</div>
                <div class="item-line">
                  <span>${escapeHtml(row.quantityLine)}</span>
                  <span>${escapeHtml(row.amount)}</span>
                </div>
                ${row.discountLabels.length > 0 ? `<div class="item-note">${escapeHtml(row.discountLabels.join(" · "))}</div>` : ""}
                ${
                  row.savedLine
                    ? `<div class="item-saving"><span>${escapeHtml(t.discount)}</span><span>${escapeHtml(row.savedLine)}</span></div>`
                    : ""
                }
                ${
                  row.netLine
                    ? `<div class="item-line"><span>${escapeHtml(t.youPay)}</span><span>${escapeHtml(row.netLine)}</span></div>`
                    : ""
                }
              </div>
            `,
              )
              .join("")}
          </div>

          <div class="totals">
            ${buildTotalRows(data)
              .map((row) => {
                const toneClass =
                  row.tone === "grand"
                    ? "grand-total"
                    : row.tone === "discount"
                      ? "discount-line"
                      : row.tone === "subtotal"
                        ? "subtotal-line"
                        : row.tone === "savings"
                          ? "savings-line"
                          : "";

                return `
            <div class="total-line ${toneClass}">
              <span>${escapeHtml(row.label)}:</span>
              <span>${escapeHtml(row.value)}</span>
            </div>`;
              })
              .join("")}
          </div>

          <div class="footer">
            <div class="thank-you">${escapeHtml(t.thankYou)}</div>
            <div>${escapeHtml(t.visitAgain)}</div>
            ${
              data.invoiceFooterMessage
                ? `<div style="margin-top: 8px; font-size: ${detailSize}; text-align: center;">${escapeHtml(data.invoiceFooterMessage)}</div>`
                : ""
            }
            ${
              footerImageSrc
                ? `<div style="margin-top: 8px; text-align: center;"><img src="${escapeHtml(footerImageSrc)}" alt="${escapeHtml(t.invoiceFooter)}" style="max-width: 100%; max-height: 80px; object-fit: contain;" /></div>`
                : ""
            }
          </div>
        </body>
      </html>
    `;
  };

  /**
   * Save the sale, then print its receipt.
   *
   * Nothing is printed until recordSale has succeeded: the receipt carries
   * the number it returned. If saving fails nothing prints and we stay on
   * this screen so the cashier can retry. Printing goes through a hidden
   * iframe, so it needs no popup and works for auto-print too.
   *
   * Printing never records anything: handleConfirmPayment returns the saved
   * receipt number for any later call (savedTransactionIdRef) and ignores
   * calls while a save is in flight (confirmInFlightRef). A failed print
   * leaves the saved sale alone and says so.
   */
  const handlePrintReceipt = async () => {
    if (!receiptData || confirmInFlightRef.current) return;
    const data = receiptData;

    const transactionId = await handleConfirmPayment();
    if (!transactionId) return;

    try {
      await printHtmlInHiddenFrame(buildReceiptHtml(data, transactionId));
    } catch (error) {
      console.error("Receipt printing failed:", error);
      toast.error(
        `Sale ${transactionId} is saved, but the receipt could not be printed.`,
        { duration: 6000 },
      );
    }

    router.push("/owner/home");
  };
  handlePrintReceiptRef.current = handlePrintReceipt;

  useEffect(() => {
    // Auto-print exactly once per checkout when enabled. It goes through
    // handlePrintReceipt, so it saves first and prints only a saved sale.
    if (!showReceipt || !receiptData?.autoPrintReceipt) {
      return;
    }

    if (autoPrintedPreviewRef.current === receiptData.previewKey) {
      return;
    }

    autoPrintedPreviewRef.current = receiptData.previewKey;
    void handlePrintReceiptRef.current?.();
  }, [showReceipt, receiptData?.previewKey, receiptData?.autoPrintReceipt]);

  if (!isOpen) return null;

  // Show receipt modal if receipt data is available
  if (showReceipt && receiptData) {
    // The preview mirrors the printed receipt exactly by rendering the same
    // rows, so the two can't drift apart.
    const infoRows = buildInfoRows(receiptData);
    const itemRows = buildItemRows(receiptData);
    const totalRows = buildTotalRows(receiptData);

    const bodyText =
      receiptSize === "58mm"
        ? "text-[10px] lg:text-xs xl:text-sm"
        : "text-xs lg:text-sm xl:text-base";
    const noteText =
      receiptSize === "58mm"
        ? "text-[9px] lg:text-[10px] xl:text-xs"
        : "text-[10px] lg:text-xs xl:text-sm";
    const grandText =
      receiptSize === "58mm"
        ? "text-xs lg:text-sm xl:text-base"
        : "text-sm lg:text-base xl:text-lg";

    return (
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-2 sm:p-3 md:p-4 lg:p-6">
        <div className="bg-white rounded-2xl shadow-2xl w-full h-full max-w-[95vw] sm:max-w-xl md:max-w-2xl lg:max-w-4xl xl:max-w-5xl 2xl:max-w-6xl max-h-[96vh] md:max-h-[94vh] lg:max-h-[92vh] flex flex-col border border-gray-200">
          {/* Receipt Header */}
          <div className="flex items-center justify-between p-3 sm:p-4 lg:p-5 bg-brand flex-shrink-0 rounded-t-2xl">
            <h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-white">
              {t.paymentComplete}
            </h2>
            <button
              title={t.cancelPayment}
              onClick={() => {
                // Cancel payment - just close without recording transaction
                setShowReceipt(false);
                setReceiptData(null);
                setIsProcessing(false);
              }}
              className="text-white hover:bg-white/20 transition-colors p-2 rounded-full"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          {/* Receipt Preview */}
          <div className="p-3 sm:p-4 lg:p-6 flex-1 flex flex-col overflow-hidden bg-white/50">
            {/* Thermal Receipt Preview */}
            <div className="bg-rose-50/60 border border-gray-200 rounded-xl shadow-md flex-1 overflow-y-auto p-2 sm:p-3 lg:p-4">
              <div
                className={`mx-auto bg-white ${getReceiptWidth(receiptSize)} p-3 sm:p-4 lg:p-5 xl:p-6 text-black`}
                style={{
                  fontFamily:
                    '"Noto Sans Myanmar", "Noto Sans Thai", "Segoe UI", Arial, sans-serif',
                }}
              >
                {/* Header */}
                <div className="text-center border-b border-dashed border-black pb-2 mb-2">
                  {receiptData.showBusinessLogo &&
                    safeImageSrc(receiptData.businessLogo) && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={safeImageSrc(receiptData.businessLogo)}
                      alt={t.businessLogo}
                      className="mx-auto mb-2 max-h-14 object-contain"
                    />
                  )}
                  <div
                    className={`font-bold text-black ${receiptSize === "58mm" ? "text-sm lg:text-base xl:text-lg" : "text-base lg:text-lg xl:text-xl"}`}
                  >
                    {receiptData.businessName || t.receipt}
                  </div>
                  <div
                    className={`text-black ${receiptSize === "58mm" ? "text-xs lg:text-sm xl:text-base" : "text-sm lg:text-base xl:text-lg"} mt-1`}
                  >
                    {receiptData.branchName || "Main Branch"}
                  </div>
                  <div
                    className={`text-black ${receiptSize === "58mm" ? "text-[10px] lg:text-xs xl:text-sm" : "text-xs lg:text-sm xl:text-base"} mt-1`}
                  >
                    {new Date(receiptData.timestamp).toLocaleString()}
                  </div>
                  <div
                    className={`text-black ${receiptSize === "58mm" ? "text-[10px] lg:text-xs xl:text-sm" : "text-xs lg:text-sm xl:text-base"} mt-1`}
                  >
                    {t.transaction}:{" "}
                    {receiptData.transactionId ?? RECEIPT_NUMBER_PENDING}
                  </div>
                </div>

                {/* Customer / cashier info */}
                <div className="mb-2">
                  {infoRows.map(([label, value]) => (
                    <div
                      key={label}
                      className={`flex justify-between gap-2 text-black ${bodyText}`}
                    >
                      <span className="shrink-0">{label}:</span>
                      <span className="text-right break-words">{value}</span>
                    </div>
                  ))}
                </div>

                {/* Items */}
                <div className="border-t border-b border-dashed border-black py-2 my-2">
                  {itemRows.map((row, index: number) => (
                    <div key={index} className="mb-2">
                      <div className={`font-bold text-black ${bodyText}`}>
                        {row.name}
                      </div>
                      <div
                        className={`flex justify-between text-black ${bodyText} mt-1`}
                      >
                        <span>{row.quantityLine}</span>
                        <span>{row.amount}</span>
                      </div>
                      {row.discountLabels.length > 0 && (
                        <div className={`text-black ${noteText}`}>
                          {row.discountLabels.join(" · ")}
                        </div>
                      )}
                      {row.savedLine && (
                        <div
                          className={`flex justify-between text-black ${noteText}`}
                        >
                          <span>{t.discount}</span>
                          <span>{row.savedLine}</span>
                        </div>
                      )}
                      {row.netLine && (
                        <div
                          className={`flex justify-between text-black ${bodyText}`}
                        >
                          <span>{t.youPay}</span>
                          <span>{row.netLine}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Totals: gross subtotal, each discount, coupon, tax, total */}
                <div className="mt-2">
                  {totalRows.map((row, index) => {
                    const toneClass =
                      row.tone === "grand"
                        ? `font-bold border-t border-b border-black py-2 my-2 ${grandText}`
                        : row.tone === "discount"
                          ? `pl-1.5 ${noteText} mb-1`
                          : row.tone === "subtotal"
                            ? `font-bold border-t border-dotted border-black pt-1 mt-1 mb-1 ${bodyText}`
                            : row.tone === "savings"
                              ? `font-bold border-b border-dashed border-black pb-1 mb-2 ${bodyText}`
                              : `${bodyText} mb-1`;

                    return (
                      <div
                        key={`${row.label}-${index}`}
                        className={`flex justify-between gap-2 text-black ${toneClass}`}
                      >
                        <span>{row.label}:</span>
                        <span className="whitespace-nowrap">{row.value}</span>
                      </div>
                    );
                  })}
                </div>

                {/* Footer */}
                <div className="text-center border-t border-dashed border-black pt-2 mt-2">
                  <div
                    className={`font-bold text-black ${receiptSize === "58mm" ? "text-[10px] lg:text-xs xl:text-sm" : "text-xs lg:text-sm xl:text-base"}`}
                  >
                    {t.thankYou}
                  </div>
                  <div
                    className={`text-black ${receiptSize === "58mm" ? "text-[10px] lg:text-xs xl:text-sm" : "text-xs lg:text-sm xl:text-base"}`}
                  >
                    {t.visitAgain}
                  </div>
                  {receiptData.invoiceFooterMessage && (
                    <div
                      className={`text-black mt-2 ${receiptSize === "58mm" ? "text-[9px] lg:text-[10px] xl:text-xs" : "text-[10px] lg:text-xs xl:text-sm"}`}
                    >
                      {receiptData.invoiceFooterMessage}
                    </div>
                  )}
                  {safeImageSrc(receiptData.invoiceFooterImage) && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={safeImageSrc(receiptData.invoiceFooterImage)}
                      alt={t.invoiceFooter}
                      className="mx-auto mt-2 max-h-20 object-contain"
                    />
                  )}
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2 sm:gap-3 lg:gap-4 pt-3 lg:pt-4 flex-shrink-0">
              <button
                onClick={handlePrintReceipt}
                disabled={isProcessing}
                className="flex-1 bg-brand text-white px-3 sm:px-4 lg:px-6 py-2 sm:py-2.5 lg:py-3 rounded-xl hover:bg-brand-strong transition-all text-sm lg:text-base font-bold shadow-md hover:shadow-lg"
              >
                <span className="text-white">{t.printReceipt}</span>
              </button>
              <button
                onClick={async () => {
                  // Leave only once the sale is saved; on failure the toast
                  // explains and the cashier can retry from here.
                  const transactionId = await handleConfirmPayment();
                  if (transactionId) router.push("/owner/home");
                }}
                disabled={isProcessing}
                className="flex-1 bg-white text-gray-700 border border-gray-200 px-3 sm:px-4 lg:px-6 py-2 sm:py-2.5 lg:py-3 rounded-xl hover:bg-rose-50 transition-all text-sm lg:text-base font-bold shadow-sm hover:shadow-md"
              >
                <span>{t.skipPrint}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-2 md:p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[95vh] md:max-h-[90vh] flex flex-col overflow-hidden border border-gray-200">
        {/* Header */}
        <div className="flex items-center justify-between p-3 md:p-4 bg-brand flex-shrink-0 rounded-t-2xl">
          <div className="flex items-center space-x-2 md:space-x-3">
            <h2 className="text-lg md:text-xl font-bold text-white">
              {t.paymentClearance}
            </h2>
            {selectedCurrency !== defaultCurrency && (
              <button
                title={t.viewCurrencyDetails}
                onClick={() => setShowDetailModal(true)}
                className="text-white hover:bg-white/20 transition-colors p-1.5 md:p-2 rounded-full touch-manipulation"
              >
                <Eye className="h-4 w-4 md:h-5 md:w-5" />
              </button>
            )}
          </div>
          <button
            title={t.close}
            onClick={onClose}
            className="text-white hover:bg-white/20 transition-colors p-1.5 md:p-2 rounded-full touch-manipulation"
          >
            <X className="h-5 w-5 md:h-6 md:w-6" />
          </button>
        </div>

        <div className="flex flex-col md:flex-row flex-1 overflow-hidden min-h-0">
          {/* Left Side - Customer Info & Payment Summary */}
          <div className="w-full md:w-3/5 p-3 md:p-4 md:border-r-2 border-gray-200 overflow-y-auto bg-white/50">
            {/* Customer Information */}
            <div className="flex items-center space-x-2 md:space-x-3 mb-3 bg-white rounded-xl p-3 border border-gray-200 shadow-sm">
              <div className="h-7 w-7 md:h-8 md:w-8 rounded-full bg-brand flex items-center justify-center shadow-sm">
                {customer?.customerImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    className="h-8 w-8 rounded-full object-cover"
                    src={customer.customerImage}
                    alt={customer.displayName || customer.email}
                  />
                ) : customer ? (
                  <span className="text-white text-xs font-medium">
                    {customer.displayName?.charAt(0)?.toUpperCase() ||
                      customer.email?.charAt(0)?.toUpperCase() ||
                      "C"}
                  </span>
                ) : (
                  <User className="h-4 w-4 text-white" />
                )}
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">
                  {customer?.displayName || t.defaultCustomer}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-500">{getCurrentDateTime()}</p>
              </div>
            </div>

            {/* Items Summary */}
            <div className="mb-4 bg-white rounded-xl p-3 border border-gray-200 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
                <Truck className="h-4 w-4 text-rose-600" />
                {t.items} ({items.length})
              </h3>
              <div className="max-h-32 overflow-y-auto space-y-1">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="flex justify-between items-center py-1 text-xs"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-gray-800 truncate">{item.groupName}</p>
                      {(item.selectedColor || item.selectedSize) && (
                        <p className="text-gray-500 text-xs">
                          {item.selectedColor && `${getDisplayColor(item)}`}
                          {item.selectedColor && item.selectedSize && " • "}
                          {item.selectedSize &&
                            `${t.size} ${item.selectedSize}`}
                        </p>
                      )}
                    </div>
                    <div className="text-right ml-2">
                      <p className="text-gray-800 font-medium">
                        {t.quantity}: {item.quantity}
                      </p>
                      <p className="text-gray-600">
                        {formatPrice(item.unitPrice * item.quantity)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Payment Summary */}
            <div className="space-y-2 mb-4 bg-rose-50/60 rounded-xl p-3 border border-gray-200 shadow-md">
              {/* Subtotal */}
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-700 font-medium">{t.subtotal}</span>
                <span className="text-gray-900 font-semibold">
                  {formatPrice(subtotal)}
                </span>
              </div>

              {/* Discount Breakdown */}
              {discountBreakdown && (
                <>
                  {/* Wholesale Savings */}
                  {discountBreakdown.wholesaleSavings > 0 && (
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-amber-700 flex items-center gap-1">
                        <span className="px-1.5 py-0.5 bg-amber-100 rounded text-[10px] font-bold">{t.wholeSale}</span>
                        {t.savings}
                      </span>
                      <span className="text-red-600 font-semibold">
                        -{formatPrice(discountBreakdown.wholesaleSavings)}
                      </span>
                    </div>
                  )}

                  {/* Group Percent Discount */}
                  {discountBreakdown.groupPercentSavings > 0 && (
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-rose-700 flex items-center gap-1">
                        <span className="px-1.5 py-0.5 bg-rose-100 rounded text-[10px] font-bold">{t.groupLabel} %</span>
                        {t.discount}
                      </span>
                      <span className="text-red-600 font-semibold">
                        -{formatPrice(discountBreakdown.groupPercentSavings)}
                      </span>
                    </div>
                  )}

                  {/* Group Fixed Discount */}
                  {discountBreakdown.groupFixedTotal > 0 && (
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-rose-700 flex items-center gap-1">
                        <span className="px-1.5 py-0.5 bg-rose-100 rounded text-[10px] font-bold">{t.groupLabel}</span>
                        {t.fixedLabel}
                      </span>
                      <span className="text-red-600 font-semibold">
                        -{formatPrice(discountBreakdown.groupFixedTotal)}
                      </span>
                    </div>
                  )}

                  {/* Variant Percent Discount */}
                  {discountBreakdown.variantPercentSavings > 0 && (
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-purple-700 flex items-center gap-1">
                        <span className="px-1.5 py-0.5 bg-purple-100 rounded text-[10px] font-bold">{t.variantLabel} %</span>
                        {t.discount}
                      </span>
                      <span className="text-red-600 font-semibold">
                        -{formatPrice(discountBreakdown.variantPercentSavings)}
                      </span>
                    </div>
                  )}

                  {/* Variant Fixed Discount */}
                  {discountBreakdown.variantFixedTotal > 0 && (
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-purple-700 flex items-center gap-1">
                        <span className="px-1.5 py-0.5 bg-purple-100 rounded text-[10px] font-bold">{t.variantLabel}</span>
                        {t.fixedLabel}
                      </span>
                      <span className="text-red-600 font-semibold">
                        -{formatPrice(discountBreakdown.variantFixedTotal)}
                      </span>
                    </div>
                  )}

                  {/* Cart Discount */}
                  {discountBreakdown.cartDiscount > 0 && (
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-green-700 flex items-center gap-1">
                        <span className="px-1.5 py-0.5 bg-green-100 rounded text-[10px] font-bold">
                          {t.cartLabel} {discountBreakdown.cartDiscountPercent > 0 ? `${discountBreakdown.cartDiscountPercent}%` : ''}
                        </span>
                        {t.discount}
                      </span>
                      <span className="text-red-600 font-semibold">
                        -{formatPrice(discountBreakdown.cartDiscount)}
                      </span>
                    </div>
                  )}
                </>
              )}

              {/* Coupon Discount */}
              {couponDiscount && couponDiscount > 0 && (
                <div className="flex justify-between items-center text-xs">
                  <span className="text-purple-700 flex items-center gap-1">
                    <span className="px-1.5 py-0.5 bg-purple-100 rounded text-[10px] font-bold">
                      {couponCode || t.couponLabel}
                    </span>
                    {t.loyalty}
                  </span>
                  <span className="text-red-600 font-semibold">
                    -{formatPrice(couponDiscount)}
                  </span>
                </div>
              )}

              {/* Tax */}
              {tax > 0 && (
                <div className="flex justify-between items-center text-xs pt-1 border-t border-rose-100">
                  <span className="text-gray-700 font-medium">{t.tax}</span>
                  <span className="text-gray-900 font-semibold">
                    +{formatPrice(tax)}
                  </span>
                </div>
              )}

              {/* Delivery fee (COD only, from Settings) */}
              {selectedPaymentMethod === "cod" && (
                <div className="flex justify-between items-center text-xs pt-1 border-t border-rose-100">
                  <span className="text-gray-700 font-medium flex items-center gap-1">
                    <Truck className="h-3 w-3" aria-hidden="true" />
                    {t.deliveryFeeLabel}
                  </span>
                  <span className="text-gray-900 font-semibold">
                    {deliveryFee > 0 ? `+${formatPrice(deliveryFee)}` : t.freeDeliveryLabel}
                  </span>
                </div>
              )}

              {/* Total */}
              <div className="flex justify-between items-center py-2 border-t border-gray-200">
                <span className="text-sm font-bold text-gray-900">
                  {t.total}
                </span>
                <span className="text-lg font-black text-rose-600">
                  {formatPrice(total)}
                </span>
              </div>

              {selectedPaymentMethod === "cash" && (
                <div className="space-y-1 pt-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-600">{t.paid}</span>
                    <span className="text-sm font-medium text-gray-900">
                      {formatPrice(amountPaid, selectedCurrency)}
                    </span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-600">{t.change}</span>
                    <span
                      className={`text-sm font-medium ${
                        change >= 0 ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {formatPrice(change, selectedCurrency)}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Payment Methods */}
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
                <Wallet className="h-4 w-4 text-rose-600" />
                {t.paymentMethod}
              </h3>

              <div className="grid grid-cols-2 gap-2">
                {/* Cash Payment */}
                <button
                  onClick={() => setSelectedPaymentMethod("cash")}
                  className={`p-3 rounded-xl border-2 cursor-pointer transition-all flex flex-col items-center space-y-1 shadow-sm hover:shadow-md ${
                    selectedPaymentMethod === "cash"
                      ? "border-rose-500 bg-rose-50/60 text-rose-700"
                      : "border-gray-200 hover:border-rose-200 text-gray-700 bg-white"
                  }`}
                >
                  <CreditCard className="h-5 w-5" />
                  <span className="text-xs font-bold">{t.cash}</span>
                </button>

                {/* COD (Cash On Delivery) */}
                <button
                  onClick={() => setSelectedPaymentMethod("cod")}
                  className={`p-3 rounded-xl border-2 cursor-pointer transition-all flex flex-col items-center space-y-1 shadow-sm hover:shadow-md ${
                    selectedPaymentMethod === "cod"
                      ? "border-rose-500 bg-rose-50/60 text-rose-700"
                      : "border-gray-200 hover:border-rose-200 text-gray-700 bg-white"
                  }`}
                >
                  <Truck className="h-5 w-5" />
                  <span className="text-xs font-bold">{t.cod}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Right Side - Calculator */}
          <div className="w-2/5 p-3 overflow-y-auto bg-white/50">
            {/* Amount Display */}
            <div className="bg-rose-50/60 border border-gray-200 rounded-xl p-3 mb-3 shadow-sm">
              <input
                type="number"
                value={calculatorDisplay === "0" ? "" : calculatorDisplay}
                ref={amountInputRef}
                onChange={(e) => {
                  const value = e.target.value;
                  setCalculatorDisplay(value);
                  setAmountPaid(value === "" ? 0 : parseFloat(value));
                }}
                placeholder="0"
                className="w-full text-xl font-bold text-gray-900 bg-transparent text-right border-none outline-none"
                min="0"
                step={
                  CURRENCY_DECIMALS[selectedCurrency] === 0 ? "1" : "0.01"
                }
              />
            </div>

            {/* Quick Amount Buttons */}
            <div className="grid grid-cols-4 gap-1 mb-3">
              {[100, 500, 1000, 5000].map((amount) => (
                <button
                  key={amount}
                  onClick={() => handleQuickAmount(amount)}
                  className="p-1 bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded text-center font-medium text-gray-900 transition-colors text-xs"
                >
                  {amount}
                </button>
              ))}
            </div>

            {/* Calculator */}
            <div className="grid grid-cols-3 gap-1 mb-3">
              {/* Row 1 */}
              {["1", "2", "3"].map((num) => (
                <button
                  key={num}
                  onClick={() => handleCalculatorInput(num)}
                  className="p-2 bg-white hover:bg-gray-100 border border-gray-300 rounded text-sm font-medium text-gray-900 transition-colors"
                >
                  {num}
                </button>
              ))}

              {/* Row 2 */}
              {["4", "5", "6"].map((num) => (
                <button
                  key={num}
                  onClick={() => handleCalculatorInput(num)}
                  className="p-2 bg-white hover:bg-gray-100 border border-gray-300 rounded text-sm font-medium text-gray-900 transition-colors"
                >
                  {num}
                </button>
              ))}

              {/* Row 3 */}
              {["7", "8", "9"].map((num) => (
                <button
                  key={num}
                  onClick={() => handleCalculatorInput(num)}
                  className="p-2 bg-white hover:bg-gray-100 border border-gray-300 rounded text-sm font-medium text-gray-900 transition-colors"
                >
                  {num}
                </button>
              ))}

              {/* Row 4 */}
              <button
                onClick={() => handleCalculatorInput(".")}
                className="p-2 bg-white hover:bg-gray-100 border border-gray-300 rounded text-sm font-medium text-gray-900 transition-colors"
              >
                .
              </button>
              <button
                onClick={() => handleCalculatorInput("0")}
                className="p-2 bg-white hover:bg-gray-100 border border-gray-300 rounded text-sm font-medium text-gray-900 transition-colors"
              >
                0
              </button>
              <button
                onClick={() => handleCalculatorInput("⌫")}
                className="p-2 bg-white hover:bg-gray-100 border border-gray-300 rounded text-sm font-medium text-gray-900 transition-colors"
              >
                ⌫
              </button>
            </div>

            {/* Clear Button */}
            <button
              onClick={() => handleCalculatorInput("Clear")}
              className="w-full p-2 bg-gray-200 hover:bg-gray-300 border border-gray-300 rounded font-medium text-gray-900 mb-3 transition-colors"
            >
              {t.clear}
            </button>

            {/* Pay Now Button */}
            <button
              onClick={handlePayNow}
              disabled={isProcessing || isCashShort}
              className={`w-full p-3 rounded-xl font-black text-white transition-all shadow-md hover:shadow-lg ${
                isProcessing || isCashShort
                  ? "bg-gray-400 cursor-not-allowed"
                  : "bg-brand hover:bg-brand-strong"
              }`}
            >
              {isProcessing ? t.processing : t.payNow}
            </button>
          </div>
        </div>
      </div>

      {/* Detailed Currency Information Modal */}
      {showDetailModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-60 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[80vh] overflow-y-auto">
            {/* Detail Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">
                {t.currencyDetails}
              </h3>
              <button
                title={t.close}
                onClick={() => setShowDetailModal(false)}
                className="text-gray-600 hover:text-gray-800 transition-colors p-1 rounded-full hover:bg-gray-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Detail Modal Content */}
            <div className="p-4 space-y-4">
              {/* Items with dual currency */}
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">
                  {t.items}
                </h4>
                <div className="space-y-2">
                  {items.map((item, index) => (
                    <div
                      key={index}
                      className="flex justify-between items-start p-2 bg-gray-50 rounded"
                    >
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">
                          {item.groupName}
                        </p>
                        <p className="text-xs text-gray-600">
                          {getDisplayColor(item)}{" "}
                          {item.selectedColor || item.selectedSize ? "•" : ""}{" "}
                          {item.selectedSize} {item.selectedSize ? "•" : ""}{" "}
                          {t.quantity}: {item.quantity}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium text-gray-900">
                          {formatPrice(item.unitPrice * item.quantity)}
                        </p>
                        <p className="text-xs text-gray-500">
                          {formatPrice(
                            item.unitPrice * item.quantity,
                            defaultCurrency,
                          )}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Total with dual currency */}
              <div className="border-t border-gray-200 pt-3">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium text-gray-700">
                    {t.total}
                  </span>
                  <div className="text-right">
                    <p className="text-sm font-medium text-gray-900">
                      {formatPrice(totalInSellingCurrency, selectedCurrency)}
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatPrice(total, defaultCurrency)}
                    </p>
                  </div>
                </div>

                {/* Paid with dual currency */}
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium text-gray-700">
                    {t.paid}
                  </span>
                  <div className="text-right">
                    <p className="text-sm font-medium text-gray-900">
                      {formatPrice(amountPaid, selectedCurrency)}
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatPrice(
                        SettingsService.convertPrice(
                          amountPaid,
                          selectedCurrency,
                          defaultCurrency,
                          currencyRate,
                          defaultCurrency,
                        ),
                        defaultCurrency,
                      )}
                    </p>
                  </div>
                </div>

                {/* Change with dual currency */}
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-gray-700">
                    {t.change}
                  </span>
                  <div className="text-right">
                    <p
                      className={`text-sm font-medium ${
                        change >= 0 ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {formatPrice(change, selectedCurrency)}
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatPrice(
                        SettingsService.convertPrice(
                          change,
                          selectedCurrency,
                          defaultCurrency,
                          currencyRate,
                          defaultCurrency,
                        ),
                        defaultCurrency,
                      )}
                    </p>
                  </div>
                </div>
              </div>

              {/* Currency Information */}
              <div className="border-t border-gray-200 pt-3">
                <h4 className="text-sm font-medium text-gray-700 mb-2">
                  {t.currencyInformation}
                </h4>
                <div className="space-y-1 text-xs text-gray-600">
                  <p>
                    {t.sellingCurrency}: {selectedCurrency}
                  </p>
                  <p>
                    {t.mainCurrency} {defaultCurrency}
                  </p>
                  <p>
                    {t.exchangeRate}: {currencyRate}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
