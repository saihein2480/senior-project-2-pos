import {
  doc,
  getDoc,
  updateDoc,
  arrayUnion,
  increment,
  runTransaction,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db, isFirebaseConfigured } from "@/lib/firebase";
import { LoyaltyCoupon, LoyaltyPointsHistory } from "@/types/customer";
import {
  SettingsService,
  LoyaltySettings,
  CouponPackage,
  resolveCouponPackages,
} from "./settingsService";

/**
 * Pick the reward tier a purchase just unlocked.
 *
 * A package is "crossed" when the balance passes another whole multiple of its
 * cost. When several are crossed at once we award the most valuable one, so
 * bigger milestones give better rewards. `times` covers the rare case where a
 * single purchase awards enough points to cross the same tier more than once.
 */
export function selectEarnedCouponPackage(
  packages: CouponPackage[],
  oldPoints: number,
  newPoints: number,
): { pkg: CouponPackage; times: number } | null {
  let best: { pkg: CouponPackage; times: number } | null = null;

  for (const pkg of packages) {
    const cost = Number(pkg.pointsRequired);
    if (!Number.isFinite(cost) || cost <= 0) continue;

    const times =
      Math.floor(newPoints / cost) - Math.floor(oldPoints / cost);
    if (times <= 0) continue;

    if (!best || cost > Number(best.pkg.pointsRequired)) {
      best = { pkg, times };
    }
  }

  return best;
}

/**
 * Points already promised to coupons the customer is holding.
 *
 * A coupon's cost is only deducted when it is used, so an unused coupon has a
 * claim on the balance. Counting that claim stops more coupon value being handed
 * out than the customer has points to pay for.
 */
export function getReservedPoints(coupons: LoyaltyCoupon[]): number {
  const now = Date.now();

  return coupons
    .filter((coupon) => {
      if (coupon.status !== "active") return false;

      // An expired coupon can never be used, so it holds no claim on points.
      // Accepts both Firestore Timestamps and already-converted dates.
      const raw = coupon.expiresAt as unknown;
      const expiresAt =
        raw && typeof (raw as { toDate?: () => Date }).toDate === "function"
          ? (raw as { toDate: () => Date }).toDate()
          : new Date(raw as string | number | Date);

      // Unparseable dates stay reserved rather than freeing points wrongly.
      return Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() > now;
    })
    .reduce((sum, coupon) => sum + Number(coupon.pointsCost || 0), 0);
}

/** A reward tier plus whether it can be redeemed right now. */
export interface CouponPackageAvailability extends CouponPackage {
  affordable: boolean;
  pointsShort: number;
}

/** Every configured tier, annotated against the customer's spendable points. */
export function getPackageAvailability(
  packages: CouponPackage[],
  availablePoints: number,
): CouponPackageAvailability[] {
  return packages.map((pkg) => {
    const cost = Number(pkg.pointsRequired);
    return {
      ...pkg,
      affordable: availablePoints >= cost,
      pointsShort: Math.max(0, cost - availablePoints),
    };
  });
}

/**
 * Points still needed before the customer earns their next coupon, across all
 * configured tiers (whichever arrives soonest).
 */
export function getPointsUntilNextCoupon(
  packages: CouponPackage[],
  currentPoints: number,
): number {
  let soonest: number | null = null;

  for (const pkg of packages) {
    const cost = Number(pkg.pointsRequired);
    if (!Number.isFinite(cost) || cost <= 0) continue;

    const remaining = cost - (currentPoints % cost);
    if (soonest === null || remaining < soonest) {
      soonest = remaining;
    }
  }

  return soonest ?? 0;
}

const CUSTOMERS_COLLECTION = "customers";

export interface AwardPointsParams {
  customerId: string;
  transactionId: string;
  transactionAmount: number;
  source: 'pos' | 'online';
  description?: string;
}

export interface RedeemCouponParams {
  customerId: string;
  couponId: string;
  transactionId: string;
}

export class LoyaltyService {
  /**
   * Check if loyalty program is enabled
   */
  static async isLoyaltyEnabled(): Promise<boolean> {
    try {
      const settings = await SettingsService.getBusinessSettings();
      return settings?.loyaltySettings?.enabled ?? false;
    } catch (error) {
      console.error("Error checking loyalty status:", error);
      return false;
    }
  }

  /**
   * Get loyalty settings
   */
  static async getLoyaltySettings(): Promise<LoyaltySettings | null> {
    try {
      const settings = await SettingsService.getBusinessSettings();
      return settings?.loyaltySettings || null;
    } catch (error) {
      console.error("Error fetching loyalty settings:", error);
      return null;
    }
  }

  /**
   * Generate a unique coupon code
   */
  private static generateCouponCode(): string {
    const prefix = "LOYAL";
    const randomPart = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `${prefix}${randomPart}`;
  }

  /**
   * Create a new loyalty coupon from a reward package.
   *
   * The package's cost and identity are copied onto the coupon so that using it
   * later deducts exactly what it cost, even if the owner edits the package
   * afterwards.
   */
  private static createCoupon(pkg: CouponPackage): LoyaltyCoupon {
    const now = new Date();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + Number(pkg.validityDays || 30));

    return {
      id: `coupon_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      code: this.generateCouponCode(),
      discountType: pkg.discountType,
      discountValue: Number(pkg.discountValue),
      pointsCost: Number(pkg.pointsRequired),
      packageId: pkg.id,
      packageName: pkg.name,
      issuedAt: now,
      expiresAt: expiresAt,
      status: 'active',
    };
  }

  /**
   * Check if transaction amount qualifies for points
   */
  static doesQualifyForPoints(
    transactionAmount: number,
    loyaltySettings: LoyaltySettings
  ): boolean {
    return transactionAmount >= loyaltySettings.minimumSpendAmount;
  }

  /**
   * Award loyalty points to a customer for a purchase
   */
  static async awardPoints(params: AwardPointsParams): Promise<{
    success: boolean;
    pointsAwarded: number;
    newTotalPoints: number;
    couponsGenerated: LoyaltyCoupon[];
    message?: string;
    error?: string;
  }> {
    if (!db || !isFirebaseConfigured) {
      return {
        success: false,
        pointsAwarded: 0,
        newTotalPoints: 0,
        couponsGenerated: [],
        error: "Firebase is not configured",
      };
    }

    try {
      // Check if loyalty is enabled
      const loyaltySettings = await this.getLoyaltySettings();
      if (!loyaltySettings || !loyaltySettings.enabled) {
        return {
          success: false,
          pointsAwarded: 0,
          newTotalPoints: 0,
          couponsGenerated: [],
          message: "Loyalty program is not enabled",
        };
      }

      // Check if transaction qualifies for points
      if (!this.doesQualifyForPoints(params.transactionAmount, loyaltySettings)) {
        return {
          success: false,
          pointsAwarded: 0,
          newTotalPoints: 0,
          couponsGenerated: [],
          message: `Transaction amount must be at least ${loyaltySettings.minimumSpendAmount} to earn points`,
        };
      }

      const customerRef = doc(db, CUSTOMERS_COLLECTION, params.customerId);
      const customerDoc = await getDoc(customerRef);

      if (!customerDoc.exists()) {
        return {
          success: false,
          pointsAwarded: 0,
          newTotalPoints: 0,
          couponsGenerated: [],
          error: "Customer not found",
        };
      }

      const customerData = customerDoc.data();
      const currentPoints = customerData.loyaltyPoints || 0;
      const pointsToAward = loyaltySettings.pointsPerPurchase;

      // Create points history entry
      const pointsHistory: LoyaltyPointsHistory = {
        id: `points_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        pointsEarned: pointsToAward,
        transactionId: params.transactionId,
        transactionAmount: params.transactionAmount,
        earnedAt: new Date(),
        source: params.source,
        description: params.description || `Earned ${pointsToAward} point(s) from purchase`,
      };

      // Calculate new total points
      const newTotalPoints = currentPoints + pointsToAward;

      // Coupons are no longer auto-issued. The customer chooses which reward
      // package to redeem from their membership page, so a purchase only adds
      // points. Auto-issuing would reserve those points against a tier the
      // customer never picked, leaving nothing to redeem with.
      const couponsToGenerate: LoyaltyCoupon[] = [];

      // Update customer document
      const updateData: any = {
        loyaltyPoints: increment(pointsToAward),
        totalPointsEarned: increment(pointsToAward),
        pointsHistory: arrayUnion({
          ...pointsHistory,
          earnedAt: Timestamp.fromDate(pointsHistory.earnedAt),
        }),
        updatedAt: serverTimestamp(),
      };

      // Add coupons if any were generated
      if (couponsToGenerate.length > 0) {
        updateData.coupons = arrayUnion(
          ...couponsToGenerate.map((coupon) => ({
            ...coupon,
            issuedAt: Timestamp.fromDate(coupon.issuedAt),
            expiresAt: Timestamp.fromDate(coupon.expiresAt),
            usedAt: coupon.usedAt ? Timestamp.fromDate(coupon.usedAt) : null,
          }))
        );
        updateData.activeCouponsCount = increment(couponsToGenerate.length);
      }

      await updateDoc(customerRef, updateData);

      return {
        success: true,
        pointsAwarded: pointsToAward,
        newTotalPoints,
        couponsGenerated: couponsToGenerate,
        message: `Successfully awarded ${pointsToAward} point(s)${couponsToGenerate.length > 0 ? ` and ${couponsToGenerate.length} coupon(s)` : ''}`,
      };
    } catch (error) {
      console.error("Error awarding loyalty points:", error);
      return {
        success: false,
        pointsAwarded: 0,
        newTotalPoints: 0,
        couponsGenerated: [],
        error: error instanceof Error ? error.message : "Failed to award loyalty points",
      };
    }
  }

  /**
   * Get customer's active coupons
   */
  static async getActiveCoupons(customerId: string): Promise<LoyaltyCoupon[]> {
    if (!db || !isFirebaseConfigured) {
      throw new Error("Firebase is not configured");
    }

    try {
      const customerRef = doc(db, CUSTOMERS_COLLECTION, customerId);
      const customerDoc = await getDoc(customerRef);

      if (!customerDoc.exists()) {
        return [];
      }

      const customerData = customerDoc.data();
      const coupons = customerData.coupons || [];
      const now = new Date();

      // Filter for active coupons that haven't expired
      return coupons
        .map((coupon: any) => ({
          ...coupon,
          issuedAt: coupon.issuedAt?.toDate() || coupon.issuedAt,
          expiresAt: coupon.expiresAt?.toDate() || coupon.expiresAt,
          usedAt: coupon.usedAt?.toDate() || coupon.usedAt,
        }))
        .filter((coupon: LoyaltyCoupon) => {
          return coupon.status === 'active' && new Date(coupon.expiresAt) > now;
        });
    } catch (error) {
      console.error("Error fetching active coupons:", error);
      return [];
    }
  }

  /**
   * Redeem a loyalty coupon
   */
  static async redeemCoupon(params: RedeemCouponParams): Promise<{
    success: boolean;
    coupon?: LoyaltyCoupon;
    error?: string;
  }> {
    if (!db || !isFirebaseConfigured) {
      return {
        success: false,
        error: "Firebase is not configured",
      };
    }

    const database = db;

    try {
      const customerRef = doc(database, CUSTOMERS_COLLECTION, params.customerId);

      // One transaction so the coupon flip and the points deduction cannot be
      // split, and a concurrent points award cannot clobber the balance.
      const redeemed = await runTransaction(database, async (tx) => {
        const customerDoc = await tx.get(customerRef);

        if (!customerDoc.exists()) {
          throw new Error("Customer not found");
        }

        const customerData = customerDoc.data();
        const coupons = [...(customerData.coupons || [])];

        const couponIndex = coupons.findIndex(
          (c: any) => c.id === params.couponId,
        );
        if (couponIndex === -1) {
          throw new Error("Coupon not found");
        }

        const coupon = coupons[couponIndex];

        // Idempotency guard: never charge the points twice.
        if (coupon.status === "used") {
          throw new Error("Coupon has already been used");
        }

        const expiresAt = coupon.expiresAt?.toDate
          ? coupon.expiresAt.toDate()
          : new Date(coupon.expiresAt);
        if (expiresAt < new Date()) {
          throw new Error("Coupon has expired");
        }

        coupons[couponIndex] = {
          ...coupon,
          status: "used",
          usedAt: Timestamp.now(),
          usedInTransaction: params.transactionId,
          inUse: false,
        };

        // Using a coupon spends the points its package cost. Coupons issued
        // before pointsCost was recorded deduct nothing rather than a guess.
        const pointsCost =
          typeof coupon.pointsCost === "number" ? coupon.pointsCost : 0;
        const currentPoints = Number(customerData.loyaltyPoints || 0);
        const newPoints = Math.max(0, currentPoints - pointsCost);

        tx.update(customerRef, {
          coupons,
          activeCouponsCount: coupons.filter(
            (c: any) => c.status === "active",
          ).length,
          loyaltyPoints: newPoints,
          updatedAt: serverTimestamp(),
        });

        return { coupon, pointsCost, newPoints };
      });

      console.log(
        `Coupon redeemed: deducted ${redeemed.pointsCost} point(s). New balance: ${redeemed.newPoints}`,
      );

      return {
        success: true,
        coupon: {
          ...redeemed.coupon,
          status: 'used',
          usedAt: new Date(),
          usedInTransaction: params.transactionId,
        },
      };
    } catch (error) {
      console.error("Error redeeming coupon:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to redeem coupon",
      };
    }
  }

  /**
   * Get customer's loyalty points summary
   */
  static async getLoyaltySummary(customerId: string): Promise<{
    success: boolean;
    data?: {
      currentPoints: number;
      totalPointsEarned: number;
      activeCoupons: LoyaltyCoupon[];
      pointsHistory: LoyaltyPointsHistory[];
      pointsUntilNextCoupon: number;
      couponPackages: CouponPackageAvailability[];
      /** Points already claimed by unused coupons. */
      reservedPoints: number;
      /** Points free to redeem another package with. */
      availablePoints: number;
    };
    error?: string;
  }> {
    if (!db || !isFirebaseConfigured) {
      return {
        success: false,
        error: "Firebase is not configured",
      };
    }

    try {
      const customerRef = doc(db, CUSTOMERS_COLLECTION, customerId);
      const customerDoc = await getDoc(customerRef);

      if (!customerDoc.exists()) {
        return {
          success: false,
          error: "Customer not found",
        };
      }

      const loyaltySettings = await this.getLoyaltySettings();
      const customerData = customerDoc.data();
      const currentPoints = customerData.loyaltyPoints || 0;
      const totalPointsEarned = customerData.totalPointsEarned || 0;
      const pointsHistory = (customerData.pointsHistory || []).map((ph: any) => ({
        ...ph,
        earnedAt: ph.earnedAt?.toDate() || ph.earnedAt,
      }));

      const activeCoupons = await this.getActiveCoupons(customerId);

      // Points until the soonest coupon across all reward tiers
      const couponPackages = resolveCouponPackages(loyaltySettings);
      const pointsUntilNextCoupon = getPointsUntilNextCoupon(
        couponPackages,
        currentPoints,
      );

      // Unused coupons still owe their points, so only the remainder can fund a
      // new redemption.
      const reservedPoints = getReservedPoints(activeCoupons);
      const availablePoints = Math.max(0, currentPoints - reservedPoints);

      return {
        success: true,
        data: {
          currentPoints,
          totalPointsEarned,
          activeCoupons,
          pointsHistory: pointsHistory.sort((a: any, b: any) => 
            new Date(b.earnedAt).getTime() - new Date(a.earnedAt).getTime()
          ),
          pointsUntilNextCoupon,
          couponPackages: getPackageAvailability(couponPackages, availablePoints),
          reservedPoints,
          availablePoints,
        },
      };
    } catch (error) {
      console.error("Error fetching loyalty summary:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to fetch loyalty summary",
      };
    }
  }

  /**
   * Expire old coupons (can be run periodically)
   */
  static async expireOldCoupons(customerId: string): Promise<void> {
    if (!db || !isFirebaseConfigured) {
      throw new Error("Firebase is not configured");
    }

    try {
      const customerRef = doc(db, CUSTOMERS_COLLECTION, customerId);
      const customerDoc = await getDoc(customerRef);

      if (!customerDoc.exists()) {
        return;
      }

      const customerData = customerDoc.data();
      const coupons = customerData.coupons || [];
      const now = new Date();

      let expiredCount = 0;
      const updatedCoupons = coupons.map((coupon: any) => {
        const expiresAt = coupon.expiresAt?.toDate ? coupon.expiresAt.toDate() : new Date(coupon.expiresAt);
        if (coupon.status === 'active' && expiresAt < now) {
          expiredCount++;
          return { ...coupon, status: 'expired' };
        }
        return coupon;
      });

      if (expiredCount > 0) {
        await updateDoc(customerRef, {
          coupons: updatedCoupons,
          activeCouponsCount: increment(-expiredCount),
          updatedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      console.error("Error expiring coupons:", error);
    }
  }

  /**
   * Redeem a reward package on a customer's behalf, issuing them a coupon.
   *
   * Points are not taken here: they are deducted when the coupon is actually
   * used. To keep that honest, redemption is only allowed while the customer has
   * enough *unreserved* points to cover this tier on top of any coupons they are
   * already holding.
   */
  static async redeemPackage(params: {
    customerId: string;
    packageId: string;
  }): Promise<{
    success: boolean;
    coupon?: LoyaltyCoupon;
    error?: string;
  }> {
    if (!db || !isFirebaseConfigured) {
      return { success: false, error: "Firebase is not configured" };
    }

    const database = db;

    try {
      const loyaltySettings = await this.getLoyaltySettings();
      if (!loyaltySettings || !loyaltySettings.enabled) {
        return { success: false, error: "Loyalty program is not enabled" };
      }

      const pkg = resolveCouponPackages(loyaltySettings).find(
        (candidate) => candidate.id === params.packageId,
      );

      if (!pkg) {
        return { success: false, error: "Reward package not found" };
      }

      const customerRef = doc(
        database,
        CUSTOMERS_COLLECTION,
        params.customerId,
      );
      const coupon = this.createCoupon(pkg);

      // Read and write together so two quick redemptions cannot both pass the
      // affordability check.
      await runTransaction(database, async (tx) => {
        const snap = await tx.get(customerRef);
        if (!snap.exists()) {
          throw new Error("Customer not found");
        }

        const data = snap.data() || {};
        const coupons = (data.coupons || []) as LoyaltyCoupon[];
        const currentPoints = Number(data.loyaltyPoints || 0);
        const reserved = getReservedPoints(coupons);
        const available = currentPoints - reserved;
        const cost = Number(pkg.pointsRequired);

        if (available < cost) {
          throw new Error(
            `Not enough points. This reward needs ${cost} and the customer has ${Math.max(0, available)} available` +
              (reserved > 0
                ? ` (${reserved} reserved by coupons they already hold).`
                : "."),
          );
        }

        tx.update(customerRef, {
          coupons: [
            ...coupons,
            {
              ...coupon,
              issuedAt: Timestamp.fromDate(coupon.issuedAt),
              expiresAt: Timestamp.fromDate(coupon.expiresAt),
              usedAt: null,
            },
          ],
          activeCouponsCount:
            coupons.filter((c) => c.status === "active").length + 1,
          updatedAt: serverTimestamp(),
        });
      });

      return { success: true, coupon };
    } catch (error) {
      console.error("Error redeeming reward package:", error);
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to redeem reward",
      };
    }
  }

  /**
   * Calculate discount amount from a coupon
   */
  static calculateCouponDiscount(
    coupon: LoyaltyCoupon,
    subtotal: number
  ): number {
    if (coupon.discountType === 'percentage') {
      return Math.round((subtotal * coupon.discountValue) / 100);
    } else {
      // Fixed discount
      return Math.min(coupon.discountValue, subtotal);
    }
  }
}
