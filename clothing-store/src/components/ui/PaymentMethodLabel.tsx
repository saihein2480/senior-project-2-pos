import React from "react";
import { CreditCard, Smartphone, Truck, type LucideIcon } from "lucide-react";

/**
 * Payment method icon + label, matching the style used on
 * /owner/sales/transactions (plain gray-900 lucide icon, text to the right).
 *
 * cash -> CreditCard, scan / wallet -> Smartphone, cod -> Truck.
 */
export function paymentMethodIcon(method: string | null | undefined): LucideIcon {
  switch ((method || "").toLowerCase()) {
    case "scan":
    case "wallet":
      return Smartphone;
    case "cod":
      return Truck;
    case "cash":
    default:
      return CreditCard;
  }
}

export function PaymentMethodLabel({
  method,
  label,
  className = "",
}: {
  /** Raw payment method value, e.g. "cash", "scan", "cod". */
  method: string | null | undefined;
  /** Text shown next to the icon. */
  label: React.ReactNode;
  className?: string;
}) {
  if (!method) {
    return <span className={`text-sm text-gray-900 ${className}`}>{label || "-"}</span>;
  }

  const Icon = paymentMethodIcon(method);
  return (
    <span className={`inline-flex items-center whitespace-nowrap ${className}`}>
      <Icon className="h-4 w-4 shrink-0 text-gray-900" aria-hidden="true" />
      <span className="ml-2 text-sm text-gray-900">{label}</span>
    </span>
  );
}
