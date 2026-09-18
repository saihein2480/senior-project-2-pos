import {
  collection,
  onSnapshot,
  query,
  orderBy,
  limit,
  Unsubscribe,
  doc,
  DocumentSnapshot,
} from 'firebase/firestore';
import { db, isFirebaseConfigured } from '@/lib/firebase';
import { StockItem } from '@/types/stock';

export type InventoryUpdateCallback = (stocks: StockItem[]) => void;
export type SingleStockUpdateCallback = (stock: StockItem | null) => void;

export class InventoryRealtimeService {
  private static listeners: Map<string, Unsubscribe> = new Map();

  /**
   * Subscribe to real-time updates for all stocks
   */
  static subscribeToAllStocks(callback: InventoryUpdateCallback, limitCount?: number): Unsubscribe | null {
    if (!db || !isFirebaseConfigured) {
      console.warn('Firebase not configured, real-time updates disabled');
      return null;
    }

    try {
      // Add limit to query if provided (default: no limit for backward compatibility)
      const constraints: any[] = [
        orderBy('createdAt', 'desc')
      ];
      
      if (limitCount) {
        constraints.push(limit(limitCount));
      }

      const q = query(
        collection(db, 'stocks'),
        ...constraints
      );

      const unsubscribe = onSnapshot(
        q,
        (querySnapshot) => {
          const stocks: StockItem[] = [];
          
          querySnapshot.forEach((doc) => {
            const data = doc.data();
            stocks.push({
              id: doc.id,
              ...data,
              createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
              updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt,
            } as StockItem);
          });

          callback(stocks);
        },
        (error) => {
          console.error('Error in real-time stock updates:', error);
        }
      );

      // Store the unsubscribe function
      const listenerId = 'all-stocks';
      this.listeners.set(listenerId, unsubscribe);

      return unsubscribe;
    } catch (error) {
      console.error('Error setting up real-time stock listener:', error);
      return null;
    }
  }

  /**
   * Subscribe to real-time updates for a specific stock item
   */
  static subscribeToStock(stockId: string, callback: SingleStockUpdateCallback): Unsubscribe | null {
    if (!db || !isFirebaseConfigured) {
      console.warn('Firebase not configured, real-time updates disabled');
      return null;
    }

    try {
      const stockRef = doc(db, 'stocks', stockId);

      const unsubscribe = onSnapshot(
        stockRef,
        (docSnapshot: DocumentSnapshot) => {
          if (docSnapshot.exists()) {
            const data = docSnapshot.data();
            const stock: StockItem = {
              id: docSnapshot.id,
              ...data,
              createdAt: data?.createdAt?.toDate?.()?.toISOString() || data?.createdAt,
              updatedAt: data?.updatedAt?.toDate?.()?.toISOString() || data?.updatedAt,
            } as StockItem;
            callback(stock);
          } else {
            callback(null);
          }
        },
        (error) => {
          console.error(`Error in real-time updates for stock ${stockId}:`, error);
        }
      );

      // Store the unsubscribe function
      const listenerId = `stock-${stockId}`;
      this.listeners.set(listenerId, unsubscribe);

      return unsubscribe;
    } catch (error) {
      console.error(`Error setting up real-time listener for stock ${stockId}:`, error);
      return null;
    }
  }

  /**
   * Subscribe to recent stocks with real-time updates
   */
  static subscribeToRecentStocks(
    limitCount: number = 10,
    callback: InventoryUpdateCallback
  ): Unsubscribe | null {
    if (!db || !isFirebaseConfigured) {
      console.warn('Firebase not configured, real-time updates disabled');
      return null;
    }

    try {
      const q = query(
        collection(db, 'stocks'),
        orderBy('createdAt', 'desc')
      );

      const unsubscribe = onSnapshot(
        q,
        (querySnapshot) => {
          const stocks: StockItem[] = [];
          let count = 0;
          
          querySnapshot.forEach((doc) => {
            if (count < limitCount) {
              const data = doc.data();
              stocks.push({
                id: doc.id,
                ...data,
                createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
                updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt,
              } as StockItem);
              count++;
            }
          });

          callback(stocks);
        },
        (error) => {
          console.error('Error in real-time recent stock updates:', error);
        }
      );

      // Store the unsubscribe function
      const listenerId = `recent-stocks-${limitCount}`;
      this.listeners.set(listenerId, unsubscribe);

      return unsubscribe;
    } catch (error) {
      console.error('Error setting up real-time recent stocks listener:', error);
      return null;
    }
  }

  /**
   * Unsubscribe from a specific listener
   */
  static unsubscribe(listenerId: string): void {
    const unsubscribe = this.listeners.get(listenerId);
    if (unsubscribe) {
      unsubscribe();
      this.listeners.delete(listenerId);
    }
  }

  /**
   * Unsubscribe from all listeners
   */
  static unsubscribeAll(): void {
    this.listeners.forEach((unsubscribe) => {
      unsubscribe();
    });
    this.listeners.clear();
  }

  /**
   * Get the number of active listeners
   */
  static getActiveListenerCount(): number {
    return this.listeners.size;
  }

  /**
   * Check if a specific listener is active
   */
  static isListenerActive(listenerId: string): boolean {
    return this.listeners.has(listenerId);
  }
}