/**
 * Order server actions (Admin SDK, server only). See the individual modules:
 *
 *   transactionActions.ts  refunds, cancellations, approvals, delivery,
 *                          payout confirmations, customer request handling
 *   onlineOrderActions.ts  online-orders page status / payment status
 *   archive.ts             owner "delete" = move to transactions_archive
 *   awardLoyalty.ts        loyalty points for a completed walk-in sale
 *
 * Every action runs in one Firestore transaction, is guarded by the state
 * machine in src/lib/orderState.ts and appends an auditLog entry. Loyalty
 * points (src/server/loyaltyAdmin.ts) and customer messages
 * (src/server/notificationOutbox.ts) are written in that same transaction.
 */

export { runTransactionAction } from "./transactionActions";
export { awardSaleLoyalty } from "./awardLoyalty";
export type { AwardLoyaltyReason, AwardLoyaltyResult } from "./awardLoyalty";
export {
  setOnlineOrderPaymentStatus,
  setOnlineOrderStatus,
  setOnlineOrderStatuses,
} from "./onlineOrderActions";
export { archiveTransaction, archiveTransactions, TRANSACTIONS_ARCHIVE } from "./archive";
export type {
  BulkResult,
  CustomerNotifyPayload,
  DeliveryStatusInput,
  InspectionResult,
  OnlineOrderActionInput,
  OnlineOrderActionResult,
  OrderStatusSnapshot,
  RefundMethod,
  TransactionActionInput,
  TransactionActionName,
  TransactionActionResult,
} from "./types";
export type { ArchiveResult } from "./archive";
