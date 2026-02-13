"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { X, User, CreditCard, Wallet, QrCode, Eye, Truck } from "lucide-react";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useAuth } from "@/contexts/AuthContext";
import { SelectedCustomer } from "@/types/cart";
import { CartItem } from "@/types/cart";
import { transactionService } from "@/services/transactionService";
import { SettingsService } from "@/services/settingsService";
import { detectColorName } from "@/lib/colorUtils";

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
  total: number;
}

type PaymentMethod = "cash" | "scan" | "wallet" | "cod";

export function PaymentClearanceModal({
  isOpen,
  onClose,
  onPaymentComplete,
  customer,
  items,
  subtotal,
  discount,
  tax,
  total,
}: PaymentClearanceModalProps) {
  const router = useRouter();
  const { formatPrice, selectedCurrency, currencyRate, defaultCurrency } =
    useCurrency();
  const { user } = useAuth();
  const [selectedPaymentMethod, setSelectedPaymentMethod] =
    useState<PaymentMethod>("cash");
  const [amountPaid, setAmountPaid] = useState<number>(0);
  const [calculatorDisplay, setCalculatorDisplay] = useState<string>("0");
  const [showDetailModal, setShowDetailModal] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [showReceipt, setShowReceipt] = useState<boolean>(false);
  const [receiptData, setReceiptData] = useState<{
    transactionId: string;
    customer: SelectedCustomer | null;
    items: CartItem[];
    subtotal: number;
    tax: number;
    discount: number;
    total: number;
    amountPaid: number;
    change: number;
    paymentMethod: PaymentMethod;
    timestamp: string;
    branchName: string;
    businessName: string;
    invoiceFooterMessage: string;
    showBusinessLogo: boolean;
    businessLogo: string;
    sellingCurrency: string;
    exchangeRate: number;
    sellingTotal: number;
    cashierRole: string;
  } | null>(null);
  const [receiptSize, setReceiptSize] = useState<ReceiptPaperSize>("80mm");
  const amountInputRef = useRef<HTMLInputElement | null>(null);

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

  // Calculate change in selling currency
  const totalInSellingCurrency =
    selectedCurrency === defaultCurrency
      ? total
      : SettingsService.convertPrice(
          total,
          defaultCurrency,
          selectedCurrency,
          currencyRate,
          defaultCurrency,
        );
  const change = amountPaid - totalInSellingCurrency;

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
    const newAmount = amountPaid + amount;
    setAmountPaid(newAmount);
    setCalculatorDisplay(newAmount.toString());
  };

  const handlePayNow = async () => {
    if (
      selectedPaymentMethod === "cash" &&
      amountPaid < totalInSellingCurrency
    ) {
      alert("Insufficient payment amount");
      return;
    }

    if (isProcessing) {
      return; // Prevent duplicate submissions
    }

    setIsProcessing(true);

    try {
      // Generate sequential transaction ID (TXN-0000000000001 format)
      const transactionId = await transactionService.generateTransactionId();

      // Get selling currency data using proper conversion
      let currentExchangeRate: number;
      let sellingTotal: number;

      if (selectedCurrency === defaultCurrency) {
        currentExchangeRate = 1;
        sellingTotal = total;
      } else {
        sellingTotal = SettingsService.convertPrice(
          total,
          defaultCurrency,
          selectedCurrency,
          currencyRate,
          defaultCurrency,
        );
        currentExchangeRate = sellingTotal / total;
      }

      // Get current branch from settings
      const settings = await SettingsService.getBusinessSettings();
      const currentBranch = settings?.currentBranch || "Main Branch";

      // Prepare receipt data and show receipt preview (NO database write yet)
      setReceiptData({
        transactionId,
        customer,
        items,
        subtotal,
        tax,
        discount,
        total,
        amountPaid: selectedPaymentMethod === "cash" ? amountPaid : total,
        change: selectedPaymentMethod === "cash" ? change : 0,
        paymentMethod: selectedPaymentMethod,
        timestamp: new Date().toISOString(),
        branchName: currentBranch,
        businessName: settings?.businessName || "Shop",
        invoiceFooterMessage: settings?.invoiceFooterMessage || "",
        showBusinessLogo: settings?.showBusinessLogoOnInvoice ?? true,
        businessLogo: settings?.businessLogo || "",
        sellingCurrency: selectedCurrency,
        exchangeRate: currentExchangeRate,
        sellingTotal: sellingTotal,
        cashierRole: user?.role
          ? user.role.charAt(0).toUpperCase() + user.role.slice(1)
          : "Staff",
      });
      setShowReceipt(true);
      setIsProcessing(false);
    } catch (error) {
      setIsProcessing(false);
      console.error("Error preparing receipt:", error);
      alert(
        `Error preparing receipt: ${
          error instanceof Error ? error.message : "Unknown error"
        }. Please try again.`,
      );
    }
  };

  // Function to confirm and record the payment (called by Print/Skip buttons)
  const handleConfirmPayment = async () => {
    if (!receiptData || isProcessing) return;

    setIsProcessing(true);

    try {
      // Determine transaction status based on payment method
      const transactionStatus =
        selectedPaymentMethod === "cod" ? "pending" : "completed";

      // Record transaction in database
      const recordedTransactionId = await transactionService.recordTransaction({
        transactionId: receiptData.transactionId,
        customer,
        items,
        subtotal,
        tax,
        discount,
        total,
        amountPaid: selectedPaymentMethod === "cash" ? amountPaid : total,
        change: selectedPaymentMethod === "cash" ? change : 0,
        paymentMethod: selectedPaymentMethod,
        timestamp: new Date().toISOString(),
        status: transactionStatus,
        branchName: receiptData.branchName,
        sellingCurrency: selectedCurrency,
        exchangeRate: receiptData.exchangeRate,
        sellingTotal: receiptData.sellingTotal,
      });

      console.log(
        "Transaction recorded successfully with ID:",
        recordedTransactionId,
      );

      // Complete payment (clear cart, etc.)
      onPaymentComplete({
        method: selectedPaymentMethod,
        amountPaid: receiptData.amountPaid,
        change: receiptData.change,
        discount: receiptData.discount,
      });

      setIsProcessing(false);
    } catch (error) {
      setIsProcessing(false);
      console.error("Error recording transaction:", error);
      alert(
        `Error recording transaction: ${
          error instanceof Error ? error.message : "Unknown error"
        }. Please try again.`,
      );
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

  const handlePrintReceipt = async () => {
    if (!receiptData) return;

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      alert("Please allow popups to print the receipt");
      return;
    }

    // Dynamic sizing based on paper size
    const getPrintSizes = (size: ReceiptPaperSize) => {
      switch (size) {
        case "44mm":
          return {
            width: "44mm",
            fontSize: "9px",
            titleSize: "13px",
            detailSize: "8px",
          };
        case "57mm":
        case "58mm":
          return {
            width: size,
            fontSize: "10px",
            titleSize: "14px",
            detailSize: "9px",
          };
        case "69mm":
          return {
            width: "69mm",
            fontSize: "11px",
            titleSize: "15px",
            detailSize: "10px",
          };
        case "76mm":
        case "78mm":
          return {
            width: size,
            fontSize: "11px",
            titleSize: "15px",
            detailSize: "10px",
          };
        case "80mm":
        case "82.5mm":
          return {
            width: size,
            fontSize: "12px",
            titleSize: "16px",
            detailSize: "11px",
          };
        case "112mm":
        case "114mm":
          return {
            width: size,
            fontSize: "14px",
            titleSize: "18px",
            detailSize: "12px",
          };
        case "210mm":
          return {
            width: "210mm",
            fontSize: "16px",
            titleSize: "20px",
            detailSize: "14px",
          };
        default:
          return {
            width: "80mm",
            fontSize: "12px",
            titleSize: "16px",
            detailSize: "11px",
          };
      }
    };

    const { width, fontSize, titleSize, detailSize } =
      getPrintSizes(receiptSize);

    const receiptHTML = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Receipt - ${receiptData.transactionId}</title>
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
              font-family: 'Courier New', monospace;
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
            .totals {
              margin-top: 10px;
            }
            .total-line {
              display: flex;
              justify-content: space-between;
              margin: 4px 0;
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
            <div class="title">${receiptData.businessName || "RECEIPT"}</div>
            <div class="branch">${receiptData.branchName || "Main Branch"}</div>
            <div class="datetime">${new Date(receiptData.timestamp).toLocaleString()}</div>
            <div style="margin-top: 4px;">Trans: ${receiptData.transactionId}</div>
          </div>

          ${
            receiptData.customer
              ? `
          <div class="info-row">
            <span>Customer:</span>
            <span>${receiptData.customer.displayName || receiptData.customer.email}</span>
          </div>
          `
              : ""
          }

          <div class="info-row">
            <span>Cashier:</span>
            <span>${receiptData.cashierRole || "Staff"}</span>
          </div>

          <div class="items">
            ${receiptData.items
              .map(
                (item) => `
              <div class="item">
                <div class="item-name">${item.groupName} ${item.selectedColor ? detectColorName(item.selectedColor) || item.selectedColor : ""} - ${item.selectedSize || ""}</div>
                <div class="item-line">
                  <span>${item.quantity} x ${formatPrice(item.unitPrice)}</span>
                  <span>${formatPrice(item.unitPrice * item.quantity)}</span>
                </div>
              </div>
            `,
              )
              .join("")}
          </div>

          <div class="totals">
            <div class="total-line">
              <span>Subtotal:</span>
              <span>${formatPrice(receiptData.subtotal)}</span>
            </div>
            ${
              receiptData.discount > 0
                ? `
            <div class="total-line">
              <span>Discount:</span>
              <span>-${formatPrice(receiptData.discount)}</span>
            </div>
            `
                : ""
            }
            <div class="total-line">
              <span>Tax:</span>
              <span>${formatPrice(receiptData.tax)}</span>
            </div>
            <div class="total-line grand-total">
              <span>TOTAL:</span>
              <span>${formatPrice(receiptData.total)}</span>
            </div>
            ${
              receiptData.sellingCurrency !== defaultCurrency
                ? `
            <div class="total-line">
              <span>Paid (${receiptData.sellingCurrency}):</span>
              <span>${formatPrice(receiptData.sellingTotal)}</span>
            </div>
            `
                : ""
            }
            ${
              receiptData.paymentMethod === "cash"
                ? `
            <div class="total-line">
              <span>Paid:</span>
              <span>${formatPrice(receiptData.amountPaid)}</span>
            </div>
            <div class="total-line">
              <span>Change:</span>
              <span>${formatPrice(receiptData.change)}</span>
            </div>
            `
                : ""
            }
            <div class="total-line">
              <span>Payment:</span>
              <span>${receiptData.paymentMethod.toUpperCase()}</span>
            </div>
          </div>

          <div class="footer">
            <div class="thank-you">Thank You!</div>
            <div>Please come again</div>
            ${
              receiptData.invoiceFooterMessage
                ? `<div style="margin-top: 8px; font-size: ${detailSize}; text-align: center;">${receiptData.invoiceFooterMessage}</div>`
                : ""
            }
          </div>
        </body>
      </html>
    `;

    printWindow.document.write(receiptHTML);
    printWindow.document.close();
    printWindow.focus();

    // First confirm payment (record transaction)
    await handleConfirmPayment();

    // Then print
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
      // Navigate to home page
      router.push("/owner/home");
    }, 250);
  };

  if (!isOpen) return null;

  // Show receipt modal if receipt data is available
  if (showReceipt && receiptData) {
    return (
      <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-2 sm:p-3 md:p-4 lg:p-6">
        <div className="bg-white rounded-lg shadow-xl w-full h-full max-w-[95vw] sm:max-w-xl md:max-w-2xl lg:max-w-4xl xl:max-w-5xl 2xl:max-w-6xl max-h-[96vh] md:max-h-[94vh] lg:max-h-[92vh] flex flex-col">
          {/* Receipt Header */}
          <div className="flex items-center justify-between p-3 sm:p-4 lg:p-5 border-b border-gray-200 flex-shrink-0">
            <h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-gray-900">
              Payment Complete
            </h2>
            <button
              title="Cancel Payment"
              onClick={() => {
                // Cancel payment - just close without recording transaction
                setShowReceipt(false);
                setReceiptData(null);
                setIsProcessing(false);
              }}
              className="text-gray-600 hover:text-gray-800 transition-colors p-1 rounded-full hover:bg-gray-200"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          {/* Receipt Preview */}
          <div className="p-3 sm:p-4 lg:p-6 flex-1 flex flex-col overflow-hidden">
            {/* Thermal Receipt Preview */}
            <div className="bg-gray-100 border-2 border-gray-300 rounded-lg shadow-sm flex-1 overflow-y-auto p-2 sm:p-3 lg:p-4">
              <div
                className={`mx-auto bg-white ${getReceiptWidth(receiptSize)} p-3 sm:p-4 lg:p-5 xl:p-6 text-black`}
                style={{ fontFamily: '"Courier New", monospace' }}
              >
                {/* Header */}
                <div className="text-center border-b border-dashed border-black pb-2 mb-2">
                  <div
                    className={`font-bold text-black ${receiptSize === "58mm" ? "text-sm lg:text-base xl:text-lg" : "text-base lg:text-lg xl:text-xl"}`}
                  >
                    {receiptData.businessName || "RECEIPT"}
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
                    Trans: {receiptData.transactionId}
                  </div>
                </div>

                {/* Customer Info */}
                {receiptData.customer && (
                  <>
                    <div
                      className={`flex justify-between text-black ${receiptSize === "58mm" ? "text-[10px] lg:text-xs xl:text-sm" : "text-xs lg:text-sm xl:text-base"}`}
                    >
                      <span>Customer:</span>
                      <span>
                        {receiptData.customer.displayName ||
                          receiptData.customer.email}
                      </span>
                    </div>
                  </>
                )}

                <div
                  className={`flex justify-between text-black ${receiptSize === "58mm" ? "text-[10px] lg:text-xs xl:text-sm" : "text-xs lg:text-sm xl:text-base"} mb-2`}
                >
                  <span>Cashier:</span>
                  <span>{receiptData.cashierRole || "Staff"}</span>
                </div>

                {/* Items */}
                <div className="border-t border-b border-dashed border-black py-2 my-2">
                  {receiptData.items.map((item, index: number) => (
                    <div key={index} className="mb-2">
                      <div
                        className={`font-bold text-black ${receiptSize === "58mm" ? "text-[10px] lg:text-xs xl:text-sm" : "text-xs lg:text-sm xl:text-base"}`}
                      >
                        {item.groupName}{" "}
                        {item.selectedColor
                          ? detectColorName(item.selectedColor) ||
                            item.selectedColor
                          : ""}{" "}
                        - {item.selectedSize}
                      </div>
                      <div
                        className={`flex justify-between text-black ${receiptSize === "58mm" ? "text-[10px] lg:text-xs xl:text-sm" : "text-xs lg:text-sm xl:text-base"} mt-1`}
                      >
                        <span>
                          {item.quantity} x {formatPrice(item.unitPrice)}
                        </span>
                        <span>
                          {formatPrice(item.unitPrice * item.quantity)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Totals */}
                <div className="mt-2">
                  <div
                    className={`flex justify-between text-black ${receiptSize === "58mm" ? "text-[10px] lg:text-xs xl:text-sm" : "text-xs lg:text-sm xl:text-base"} mb-1`}
                  >
                    <span>Subtotal:</span>
                    <span>{formatPrice(receiptData.subtotal)}</span>
                  </div>
                  {receiptData.discount > 0 && (
                    <div
                      className={`flex justify-between text-black ${receiptSize === "58mm" ? "text-[10px] lg:text-xs xl:text-sm" : "text-xs lg:text-sm xl:text-base"} mb-1`}
                    >
                      <span>Discount:</span>
                      <span>-{formatPrice(receiptData.discount)}</span>
                    </div>
                  )}
                  <div
                    className={`flex justify-between text-black ${receiptSize === "58mm" ? "text-[10px] lg:text-xs xl:text-sm" : "text-xs lg:text-sm xl:text-base"} mb-1`}
                  >
                    <span>Tax:</span>
                    <span>{formatPrice(receiptData.tax)}</span>
                  </div>
                  <div
                    className={`flex justify-between font-bold text-black border-t border-b border-black py-2 my-2 ${receiptSize === "58mm" ? "text-xs lg:text-sm xl:text-base" : "text-sm lg:text-base xl:text-lg"}`}
                  >
                    <span>TOTAL:</span>
                    <span>{formatPrice(receiptData.total)}</span>
                  </div>
                  {receiptData.sellingCurrency !== defaultCurrency && (
                    <div
                      className={`flex justify-between text-black ${receiptSize === "58mm" ? "text-[10px] lg:text-xs xl:text-sm" : "text-xs lg:text-sm xl:text-base"} mb-1`}
                    >
                      <span>Paid ({receiptData.sellingCurrency}):</span>
                      <span>{formatPrice(receiptData.sellingTotal)}</span>
                    </div>
                  )}
                  {receiptData.paymentMethod === "cash" && (
                    <>
                      <div
                        className={`flex justify-between text-black ${receiptSize === "58mm" ? "text-[10px] lg:text-xs xl:text-sm" : "text-xs lg:text-sm xl:text-base"} mb-1`}
                      >
                        <span>Paid:</span>
                        <span>{formatPrice(receiptData.amountPaid)}</span>
                      </div>
                      <div
                        className={`flex justify-between text-black ${receiptSize === "58mm" ? "text-[10px] lg:text-xs xl:text-sm" : "text-xs lg:text-sm xl:text-base"} mb-1`}
                      >
                        <span>Change:</span>
                        <span>{formatPrice(receiptData.change)}</span>
                      </div>
                    </>
                  )}
                  <div
                    className={`flex justify-between text-black ${receiptSize === "58mm" ? "text-[10px] lg:text-xs xl:text-sm" : "text-xs lg:text-sm xl:text-base"}`}
                  >
                    <span>Payment:</span>
                    <span>{receiptData.paymentMethod.toUpperCase()}</span>
                  </div>
                </div>

                {/* Footer */}
                <div className="text-center border-t border-dashed border-black pt-2 mt-2">
                  <div
                    className={`font-bold text-black ${receiptSize === "58mm" ? "text-[10px] lg:text-xs xl:text-sm" : "text-xs lg:text-sm xl:text-base"}`}
                  >
                    Thank You!
                  </div>
                  <div
                    className={`text-black ${receiptSize === "58mm" ? "text-[10px] lg:text-xs xl:text-sm" : "text-xs lg:text-sm xl:text-base"}`}
                  >
                    Please come again
                  </div>
                  {receiptData.invoiceFooterMessage && (
                    <div
                      className={`text-black mt-2 ${receiptSize === "58mm" ? "text-[9px] lg:text-[10px] xl:text-xs" : "text-[10px] lg:text-xs xl:text-sm"}`}
                    >
                      {receiptData.invoiceFooterMessage}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2 sm:gap-3 lg:gap-4 pt-3 lg:pt-4 flex-shrink-0">
              <button
                onClick={handlePrintReceipt}
                className="flex-1 bg-blue-600 text-white px-3 sm:px-4 lg:px-6 py-2 sm:py-2.5 lg:py-3 rounded-lg hover:bg-blue-700 transition-colors text-sm lg:text-base font-medium shadow-sm"
              >
                <span className="text-white">Print Receipt</span>
              </button>
              <button
                onClick={async () => {
                  await handleConfirmPayment();
                  router.push("/owner/home");
                }}
                className="flex-1 bg-gray-600 text-white px-3 sm:px-4 lg:px-6 py-2 sm:py-2.5 lg:py-3 rounded-lg hover:bg-gray-700 transition-colors text-sm lg:text-base font-medium shadow-sm"
              >
                <span className="text-white">Skip Print</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-2 md:p-4">
      <div className="bg-white/95 backdrop-blur-md rounded-lg shadow-xl w-full max-w-5xl max-h-[95vh] md:max-h-[90vh] flex flex-col overflow-hidden border border-white/20">
        {/* Header */}
        <div className="flex items-center justify-between p-3 md:p-4 border-b-2 border-gray-300/50 bg-white/50 backdrop-blur-sm flex-shrink-0">
          <div className="flex items-center space-x-2 md:space-x-3">
            <h2 className="text-lg md:text-xl font-bold text-gray-900">
              Payment Clearance
            </h2>
            {selectedCurrency !== defaultCurrency && (
              <button
                title="View detailed currency information"
                onClick={() => setShowDetailModal(true)}
                className="text-blue-600 hover:text-blue-800 transition-colors p-1.5 md:p-2 rounded-full hover:bg-blue-100 touch-manipulation"
              >
                <Eye className="h-4 w-4 md:h-5 md:w-5" />
              </button>
            )}
          </div>
          <button
            title="Close"
            onClick={onClose}
            className="text-gray-600 hover:text-gray-800 transition-colors p-1.5 md:p-2 rounded-full hover:bg-gray-200 touch-manipulation"
          >
            <X className="h-5 w-5 md:h-6 md:w-6" />
          </button>
        </div>

        <div className="flex flex-col md:flex-row flex-1 overflow-hidden min-h-0">
          {/* Left Side - Customer Info & Payment Summary */}
          <div className="w-full md:w-3/5 p-3 md:p-4 md:border-r border-gray-200 overflow-y-auto">
            {/* Customer Information */}
            <div className="flex items-center space-x-2 md:space-x-3 mb-3">
              <div className="h-7 w-7 md:h-8 md:w-8 rounded-full bg-blue-500 flex items-center justify-center">
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
                  {customer?.displayName || "Default"}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-500">{getCurrentDateTime()}</p>
              </div>
            </div>

            {/* Items Summary */}
            <div className="mb-4">
              <h3 className="text-sm font-medium text-gray-700 mb-2">
                Items ({items.length})
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
                          {item.selectedSize && `Size ${item.selectedSize}`}
                        </p>
                      )}
                    </div>
                    <div className="text-right ml-2">
                      <p className="text-gray-800 font-medium">
                        Qty: {item.quantity}
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
            <div className="space-y-2 mb-4">
              <div className="flex justify-between items-center py-2 border-b border-gray-200">
                <span className="text-sm font-medium text-gray-700">Total</span>
                <span className="text-lg font-bold text-gray-900">
                  {formatPrice(total)}
                </span>
              </div>

              {selectedPaymentMethod === "cash" && (
                <div className="space-y-1 pt-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-600">Paid</span>
                    <span className="text-sm font-medium text-gray-900">
                      {formatPrice(amountPaid, selectedCurrency)}
                    </span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-600">Change</span>
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
              <h3 className="text-sm font-medium text-gray-700 mb-3">
                Payment Method
              </h3>

              <div className="grid grid-cols-2 gap-2">
                {/* Cash Payment */}
                <button
                  onClick={() => setSelectedPaymentMethod("cash")}
                  className={`p-3 rounded-lg border cursor-pointer transition-colors flex flex-col items-center space-y-1 ${
                    selectedPaymentMethod === "cash"
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-gray-200 hover:border-gray-300 text-gray-700"
                  }`}
                >
                  <CreditCard className="h-5 w-5" />
                  <span className="text-xs font-medium">Cash</span>
                </button>

                {/* Scan E-Payment */}
                <button
                  onClick={() => setSelectedPaymentMethod("scan")}
                  className={`p-3 rounded-lg border cursor-pointer transition-colors flex flex-col items-center space-y-1 ${
                    selectedPaymentMethod === "scan"
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-gray-200 hover:border-gray-300 text-gray-700"
                  }`}
                >
                  <QrCode className="h-5 w-5" />
                  <span className="text-xs font-medium">Scan</span>
                </button>

                {/* Customer Wallet */}
                <button
                  onClick={() => setSelectedPaymentMethod("wallet")}
                  className={`p-3 rounded-lg border cursor-pointer transition-colors flex flex-col items-center space-y-1 ${
                    selectedPaymentMethod === "wallet"
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-gray-200 hover:border-gray-300 text-gray-700"
                  }`}
                >
                  <Wallet className="h-5 w-5" />
                  <span className="text-xs font-medium">Wallet</span>
                </button>

                {/* COD (Cash On Delivery) */}
                <button
                  onClick={() => setSelectedPaymentMethod("cod")}
                  className={`p-3 rounded-lg border cursor-pointer transition-colors flex flex-col items-center space-y-1 ${
                    selectedPaymentMethod === "cod"
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-gray-200 hover:border-gray-300 text-gray-700"
                  }`}
                >
                  <Truck className="h-5 w-5" />
                  <span className="text-xs font-medium">COD</span>
                </button>
              </div>
            </div>
          </div>

          {/* Right Side - Calculator */}
          <div className="w-2/5 p-3 overflow-y-auto">
            {/* Amount Display */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-3">
              <input
                type="number"
                value={calculatorDisplay === "0" ? "" : calculatorDisplay}
                ref={amountInputRef}
                onChange={(e) => {
                  const value = e.target.value;
                  setCalculatorDisplay(value || "0");
                  setAmountPaid(parseFloat(value) || 0);
                }}
                placeholder="0"
                className="w-full text-xl font-bold text-gray-900 bg-transparent text-right border-none outline-none"
                min="0"
                step="0.01"
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
              Clear
            </button>

            {/* Pay Now Button */}
            <button
              onClick={handlePayNow}
              disabled={
                isProcessing ||
                (selectedPaymentMethod === "cash" &&
                  amountPaid < totalInSellingCurrency)
              }
              className={`w-full p-2 rounded font-medium text-white transition-colors ${
                isProcessing ||
                (selectedPaymentMethod === "cash" &&
                  amountPaid < totalInSellingCurrency)
                  ? "bg-gray-400 cursor-not-allowed"
                  : "bg-blue-600 hover:bg-blue-700"
              }`}
            >
              {isProcessing ? "Processing..." : "Pay Now"}
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
                Currency Details
              </h3>
              <button
                title="Close Modal"
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
                  Items
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
                          Qty: {item.quantity}
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
                    Total
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
                    Paid
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
                    Change
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
                  Currency Information
                </h4>
                <div className="space-y-1 text-xs text-gray-600">
                  <p>Selling Currency: {selectedCurrency}</p>
                  <p>Main Currency: {defaultCurrency}</p>
                  <p>Exchange Rate: {currencyRate}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
