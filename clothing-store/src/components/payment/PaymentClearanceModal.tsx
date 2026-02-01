"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  X,
  User,
  CreditCard,
  Smartphone,
  Wallet,
  QrCode,
  Eye,
  Truck,
} from "lucide-react";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useSettings } from "@/contexts/SettingsContext";
import { SelectedCustomer } from "@/types/cart";
import { CartItem } from "@/types/cart";
import { transactionService } from "@/services/transactionService";
import { SettingsService } from "@/services/settingsService";
import { detectColorName } from "@/lib/colorUtils";

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
  currency: string;
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
  currency,
}: PaymentClearanceModalProps) {
  const { formatPrice, selectedCurrency, currencyRate, defaultCurrency } =
    useCurrency();
  const [selectedPaymentMethod, setSelectedPaymentMethod] =
    useState<PaymentMethod>("cash");
  const [amountPaid, setAmountPaid] = useState<number>(0);
  const [calculatorDisplay, setCalculatorDisplay] = useState<string>("0");
  const [isCalculatorMode, setIsCalculatorMode] = useState<boolean>(false);
  const [showDetailModal, setShowDetailModal] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const amountInputRef = useRef<HTMLInputElement | null>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setAmountPaid(0);
      setCalculatorDisplay("0");
      setIsCalculatorMode(false);
      setSelectedPaymentMethod("cash");
      setIsProcessing(false);
      // Focus the amount input after modal opens
      setTimeout(() => {
        try {
          if (amountInputRef.current) {
            amountInputRef.current.focus();
            const len = (amountInputRef.current.value || "").length;
            amountInputRef.current.setSelectionRange(len, len);
          }
        } catch (e) {
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
      setIsCalculatorMode(false);
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
      setIsCalculatorMode(true);
      const newDisplay =
        calculatorDisplay === "0" ? value : calculatorDisplay + value;
      setCalculatorDisplay(newDisplay);
      setAmountPaid(parseFloat(newDisplay) || 0);
    }
  };

  const isProbablyId = (s?: string) => !!s && /(^cv|[-_].+-)/.test(s);
  const getDisplayColor = (item: CartItem) => {
    const hex = (item.colorCode as string) || "#000000";
    if (item.selectedColor && !isProbablyId(item.selectedColor)) {
      return item.selectedColor;
    }
    try {
      return detectColorName(hex) || hex;
    } catch (e) {
      return hex;
    }
  };

  const handleQuickAmount = (amount: number) => {
    const newAmount = amountPaid + amount;
    setAmountPaid(newAmount);
    setCalculatorDisplay(newAmount.toString());
    setIsCalculatorMode(false);
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
      const paymentData = {
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
        transactionId,
      };

      console.log("Payment completed:", { transactionId, total });
      console.log("Attempting to record transaction with data:", paymentData);

      // Get selling currency data using proper conversion
      // Calculate the actual exchange rate for display
      let currentExchangeRate: number;
      let sellingTotal: number;

      if (selectedCurrency === defaultCurrency) {
        // Same currency, no conversion needed
        currentExchangeRate = 1;
        sellingTotal = total;
      } else {
        // Different currency, use SettingsService for proper conversion
        sellingTotal = SettingsService.convertPrice(
          total,
          defaultCurrency,
          selectedCurrency,
          currencyRate,
          defaultCurrency,
        );

        // Calculate the effective exchange rate for display
        currentExchangeRate = sellingTotal / total;
      }

      // Determine transaction status based on payment method
      const transactionStatus =
        selectedPaymentMethod === "cod" ? "pending" : "completed";

      // Get current branch from settings
      const settings = await SettingsService.getBusinessSettings();
      const currentBranch = settings?.currentBranch || "Main Branch";

      // Record transaction in database
      const recordedTransactionId = await transactionService.recordTransaction({
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
        status: transactionStatus,
        branchName: currentBranch,
        sellingCurrency: selectedCurrency,
        exchangeRate: currentExchangeRate,
        sellingTotal: sellingTotal,
      });

      console.log(
        "Transaction recorded successfully with ID:",
        recordedTransactionId,
      );

      onPaymentComplete({
        method: selectedPaymentMethod,
        amountPaid: selectedPaymentMethod === "cash" ? amountPaid : total,
        change: selectedPaymentMethod === "cash" ? change : 0,
        discount,
      });
      setIsProcessing(false);
    } catch (error) {
      setIsProcessing(false);
      console.error("Error recording transaction:", error);
      console.error("Error details:", {
        message: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
        transactionData: {
          customer,
          items: items?.length || 0,
          subtotal,
          tax,
          discount,
          total,
          paymentMethod: selectedPaymentMethod,
        },
      });
      alert(
        `Error processing payment: ${
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white/95 backdrop-blur-md rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden border border-white/20">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b-2 border-gray-300/50 bg-white/50 backdrop-blur-sm flex-shrink-0">
          <div className="flex items-center space-x-3">
            <h2 className="text-xl font-bold text-gray-900">
              Payment Clearance
            </h2>
            {selectedCurrency !== defaultCurrency && (
              <button
                title="View detailed currency information"
                onClick={() => setShowDetailModal(true)}
                className="text-blue-600 hover:text-blue-800 transition-colors p-1 rounded-full hover:bg-blue-100"
              >
                <Eye className="h-5 w-5" />
              </button>
            )}
          </div>
          <button
            title="Close"
            onClick={onClose}
            className="text-gray-600 hover:text-gray-800 transition-colors p-1 rounded-full hover:bg-gray-200"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden min-h-0">
          {/* Left Side - Customer Info & Payment Summary */}
          <div className="w-3/5 p-4 border-r border-gray-200 overflow-y-auto">
            {/* Customer Information */}
            <div className="flex items-center space-x-3 mb-3">
              <div className="h-8 w-8 rounded-full bg-blue-500 flex items-center justify-center">
                {customer?.customerImage ? (
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
                  setIsCalculatorMode(true);
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
