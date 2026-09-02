export interface LoyaltyCoupon {
  id: string;
  code: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  issuedAt: Date;
  expiresAt: Date;
  usedAt?: Date;
  usedInTransaction?: string; // Transaction ID where coupon was used
  status: 'active' | 'used' | 'expired';
  /** Points spent to earn this coupon; deducted from the balance when used. */
  pointsCost?: number;
  /** Reward package that issued this coupon. */
  packageId?: string;
  /** Package label captured at issue time, so renames don't rewrite history. */
  packageName?: string;
  /** True while the customer has reserved this coupon for a pending checkout. */
  inUse?: boolean;
}

export interface LoyaltyPointsHistory {
  id: string;
  pointsEarned: number;
  transactionId: string;
  transactionAmount: number;
  earnedAt: Date;
  source: 'pos' | 'online'; // Where the points were earned
  description?: string;
}

export interface Customer {
  uid: string;
  email: string;
  displayName?: string;
  createdAt: Date;
  updatedAt: Date;
  totalPurchases?: number;
  totalSpent?: number;
  lastPurchaseDate?: string;
  customerType?: 'retailer' | 'wholesaler' | 'distributor' | 'individual' | 'other';
  receivables?: number;
  phone?: string;
  address?: string;
  secondaryPhone?: string;
  township?: string;
  city?: string;
  customerImage?: string;
  isOnline?: boolean; // true for online customers from e-commerce site
  customerSource?: 'pos' | 'online'; // Source of the customer
  // Loyalty Program Fields
  isMember?: boolean; // Whether customer has joined the membership program
  memberSince?: Date; // When the customer joined membership
  memberId?: string; // Unique member ID (shortened version of uid)
  loyaltyPoints?: number; // Current available points
  totalPointsEarned?: number; // Lifetime points earned
  pointsHistory?: LoyaltyPointsHistory[]; // History of points earned
  coupons?: LoyaltyCoupon[]; // Available and used coupons
  activeCouponsCount?: number; // Quick count of active coupons
}

export interface CustomerFilters {
  customerType?: 'retailer' | 'wholesaler' | 'distributor' | 'individual' | 'other';
  search?: string;
  customerSource?: 'pos' | 'online' | 'all'; // Filter by customer source
}

export interface CustomerStats {
  totalCustomers: number;
  retailerCustomers: number;
  wholesalerCustomers: number;
  totalReceivables: number;
  onlineCustomers: number;
  posCustomers: number;
}

export interface CustomerResponse {
  success: boolean;
  data?: Customer;
  error?: string;
  message?: string;
}

export interface CustomerListResponse {
  success: boolean;
  data?: Customer[];
  error?: string;
  total?: number;
  page?: number;
  limit?: number;
}

export interface CustomerStatsResponse {
  success: boolean;
  data?: CustomerStats;
  error?: string;
}

export interface CreateCustomerRequest {
  email: string;
  displayName: string;
  customerType?: 'retailer' | 'wholesaler' | 'distributor' | 'individual' | 'other';
  phone?: string;
  address?: string;
  secondaryPhone?: string;
  township?: string;
  city?: string;
  customerImage?: string;
}

export interface UpdateCustomerRequest {
  displayName?: string;
  customerType?: 'retailer' | 'wholesaler' | 'distributor' | 'individual' | 'other';
  phone?: string;
  address?: string;
  receivables?: number;
  secondaryPhone?: string;
  township?: string;
  city?: string;
  customerImage?: string;
}