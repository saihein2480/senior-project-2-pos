import {
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  limit,
  where,
  serverTimestamp,
  Timestamp,
  getDoc,
  deleteField,
} from "firebase/firestore";
import { db, isFirebaseConfigured } from "@/lib/firebase";
import {
  Shop,
  CreateShopRequest,
  UpdateShopRequest,
  ShopFilters,
  ShopStats,
} from "@/types/shop";

const COLLECTION_NAME = "shops";

// Helper function to generate unique IDs
const generateId = () =>
  Date.now().toString() + Math.random().toString(36).substr(2, 9);

export class ShopService {
  static async createShop(
    shopData: CreateShopRequest,
    userId: string
  ): Promise<Shop> {
    if (!db || !isFirebaseConfigured) {
      throw new Error("Firebase is not configured");
    }

    try {
      // Remove undefined fields from shopData
      const cleanShopData = Object.fromEntries(
        Object.entries({
          ...shopData,
          status: shopData.status || "active",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          createdBy: userId,
        }).filter(([_, v]) => v !== undefined)
      );

      const docRef = await addDoc(collection(db, COLLECTION_NAME), {
        ...cleanShopData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      return {
        id: docRef.id,
        ...cleanShopData,
      } as Shop;
    } catch (error) {
      console.error("Error creating shop:", error);
      throw new Error("Failed to create shop");
    }
  }

  static async getAllShops(): Promise<Shop[]> {
    if (!db || !isFirebaseConfigured) {
      console.warn("Firebase not configured, returning mock data");
      return this.getMockShops();
    }

    try {
      const q = query(
        collection(db, COLLECTION_NAME),
        orderBy("createdAt", "desc")
      );
      const querySnapshot = await getDocs(q);

      return querySnapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          createdAt:
            data.createdAt instanceof Timestamp
              ? data.createdAt.toDate().toISOString()
              : data.createdAt,
          updatedAt:
            data.updatedAt instanceof Timestamp
              ? data.updatedAt.toDate().toISOString()
              : data.updatedAt,
        } as Shop;
      });
    } catch (error) {
      console.error("Error fetching shops:", error);
      return this.getMockShops();
    }
  }

  static async getShopById(id: string): Promise<Shop | null> {
    if (!db || !isFirebaseConfigured) {
      const mockShops = this.getMockShops();
      return mockShops.find((shop) => shop.id === id) || null;
    }

    try {
      const docRef = doc(db, COLLECTION_NAME, id);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          ...data,
          createdAt:
            data.createdAt instanceof Timestamp
              ? data.createdAt.toDate().toISOString()
              : data.createdAt,
          updatedAt:
            data.updatedAt instanceof Timestamp
              ? data.updatedAt.toDate().toISOString()
              : data.updatedAt,
        } as Shop;
      }

      return null;
    } catch (error) {
      console.error("Error fetching shop by ID:", error);
      throw new Error("Failed to fetch shop");
    }
  }

  static async getShopsWithFilters(filters: ShopFilters): Promise<Shop[]> {
    if (!db || !isFirebaseConfigured) {
      let shops = this.getMockShops();

      // Apply filters to mock data
      if (filters.status) {
        shops = shops.filter((shop) => shop.status === filters.status);
      }
      if (filters.city) {
        shops = shops.filter((shop) =>
          shop.city.toLowerCase().includes(filters.city!.toLowerCase())
        );
      }
      if (filters.township) {
        shops = shops.filter((shop) =>
          shop.township.toLowerCase().includes(filters.township!.toLowerCase())
        );
      }
      if (filters.search) {
        const searchTerm = filters.search.toLowerCase();
        shops = shops.filter(
          (shop) =>
            shop.name.toLowerCase().includes(searchTerm) ||
            shop.address.toLowerCase().includes(searchTerm) ||
            shop.primaryPhone.includes(searchTerm) ||
            (shop.secondaryPhone && shop.secondaryPhone.includes(searchTerm))
        );
      }

      return shops;
    }

    try {
      let q = query(
        collection(db, COLLECTION_NAME),
        orderBy("createdAt", "desc")
      );

      // Apply filters
      if (filters.status) {
        q = query(q, where("status", "==", filters.status));
      }
      if (filters.city) {
        q = query(q, where("city", "==", filters.city));
      }
      if (filters.township) {
        q = query(q, where("township", "==", filters.township));
      }

      const querySnapshot = await getDocs(q);
      let shops = querySnapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          createdAt:
            data.createdAt instanceof Timestamp
              ? data.createdAt.toDate().toISOString()
              : data.createdAt,
          updatedAt:
            data.updatedAt instanceof Timestamp
              ? data.updatedAt.toDate().toISOString()
              : data.updatedAt,
        } as Shop;
      });

      // Apply search filter (client-side for complex text search)
      if (filters.search) {
        const searchTerm = filters.search.toLowerCase();
        shops = shops.filter(
          (shop) =>
            shop.name.toLowerCase().includes(searchTerm) ||
            shop.address.toLowerCase().includes(searchTerm) ||
            shop.primaryPhone.includes(searchTerm) ||
            (shop.secondaryPhone && shop.secondaryPhone.includes(searchTerm))
        );
      }

      return shops;
    } catch (error) {
      console.error("Error fetching shops with filters:", error);
      throw new Error("Failed to fetch shops");
    }
  }

  static async updateShop(
    id: string,
    updates: UpdateShopRequest
  ): Promise<void> {
    if (!db || !isFirebaseConfigured) {
      throw new Error("Firebase is not configured");
    }

    try {
      const docRef = doc(db, COLLECTION_NAME, id);

      // Firestore rejects `undefined` values. The API routes set optional
      // fields (secondaryPhone, openingHours) to undefined when the owner
      // clears them, so translate those into an explicit field delete.
      const payload = Object.fromEntries(
        Object.entries(updates).map(([key, value]) => [
          key,
          value === undefined ? deleteField() : value,
        ])
      );

      await updateDoc(docRef, {
        ...payload,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error("Error updating shop:", error);
      throw new Error("Failed to update shop");
    }
  }

  static async deleteShop(id: string): Promise<void> {
    if (!db || !isFirebaseConfigured) {
      throw new Error("Firebase is not configured");
    }

    try {
      const docRef = doc(db, COLLECTION_NAME, id);
      await deleteDoc(docRef);
    } catch (error) {
      console.error("Error deleting shop:", error);
      throw new Error("Failed to delete shop");
    }
  }

  static async getShopStats(): Promise<ShopStats> {
    const shops = await this.getAllShops();

    const activeShops = shops.filter((shop) => shop.status === "active").length;
    const inactiveShops = shops.filter(
      (shop) => shop.status === "inactive"
    ).length;
    const uniqueCities = new Set(shops.map((shop) => shop.city)).size;
    const uniqueTownships = new Set(shops.map((shop) => shop.township)).size;

    return {
      totalShops: shops.length,
      activeShops,
      inactiveShops,
      citiesCount: uniqueCities,
      townshipsCount: uniqueTownships,
    };
  }

  private static getMockShops(): Shop[] {
    return [
      {
        id: "1",
        name: "Wan Maie Shop",
        address: "ဆန်းဒီးဂို (၃) ၊ ၀၉၉၀ လမ်းမကြီး ၊ နံပါတ်ဘောင်းဆောင်းကုန်း၊",
        primaryPhone: "09451922223",
        secondaryPhone: "09758113774",
        township: "Tachileik",
        city: "Tachileik",
        status: "active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: "mock-user-id",
      },
      {
        id: "2",
        name: "Downtown Fashion Store",
        address: "No. 123, Main Street, Downtown Area",
        primaryPhone: "09123456789",
        secondaryPhone: "09987654321",
        township: "Dagon",
        city: "Yangon",
        status: "active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: "mock-user-id",
      },
      {
        id: "3",
        name: "North Branch",
        address: "No. 456, North Road, Industrial Zone",
        primaryPhone: "09111222333",
        township: "Hlaing",
        city: "Yangon",
        status: "inactive",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: "mock-user-id",
      },
    ];
  }
}
