import { StockService } from "./stockService";
import { StockItem, CreateStockRequest } from "@/types/stock";
import { ClothingInventoryItem } from "@/types/schemas";

export class InventoryService {
  /**
   * Get all clothing inventory items
   * Transforms StockItem[] to ClothingInventoryItem[]
   */
  static async getAllClothingInventory(): Promise<ClothingInventoryItem[]> {
    try {
      const stocks = await StockService.getAllStocks();
      return this.transformStocksToClothingInventory(stocks);
    } catch (error) {
      console.error("Error fetching clothing inventory:", error);
      throw new Error("Failed to fetch clothing inventory");
    }
  }

  /**
   * Add a new clothing inventory item
   * Transforms ClothingInventoryItem to CreateStockRequest and creates stock
   */
  static async addClothingInventoryItem(
    item: Partial<ClothingInventoryItem>,
    userId: string,
  ): Promise<ClothingInventoryItem> {
    try {
      // Transform ClothingInventoryItem to CreateStockRequest
      const stockRequest: CreateStockRequest = {
        groupName: item.name || "",
        unitPrice: item.price || 0,
        originalPrice: item.price || 0,
        releaseDate: new Date().toISOString(),
        shop: "default", // You might want to make this configurable
        isColorless: !item.colorVariants || item.colorVariants.length === 0,
        groupImage: item.image,
        wholesaleTiers:
          item.wholesaleTiers?.map((tier) => ({
            minQuantity: tier.minQuantity,
            price: tier.price,
          })) || [],
        colorVariants:
          item.colorVariants?.map((variant) => ({
            color: variant.color,
            colorCode: variant.colorCode,
            barcode: item.barcode || this.generateBarcode(),
            sizeQuantities: variant.sizeQuantities || [],
            image: variant.image,
          })) || [],
      };

      const createdStock = await StockService.createStock(stockRequest, userId);
      const transformedItems = this.transformStocksToClothingInventory([
        createdStock,
      ]);
      return transformedItems[0];
    } catch (error) {
      console.error("Error adding clothing inventory item:", error);
      throw new Error("Failed to add clothing inventory item");
    }
  }

  /**
   * Update a clothing inventory item
   */
  static async updateClothingInventoryItem(
    id: string,
    updates: Partial<ClothingInventoryItem>,
  ): Promise<ClothingInventoryItem> {
    try {
      // Transform updates to stock format
      const stockUpdates: Partial<CreateStockRequest> = {};

      if (updates.name) stockUpdates.groupName = updates.name;
      if (updates.price) {
        stockUpdates.unitPrice = updates.price;
        stockUpdates.originalPrice = updates.price;
      }
      if (updates.image) stockUpdates.groupImage = updates.image;
      if (updates.colorVariants) {
        stockUpdates.colorVariants = updates.colorVariants.map((variant) => ({
          ...variant,
          barcode: variant.id, // Use variant id as barcode if not provided
        }));
      }
      if (updates.wholesaleTiers) {
        stockUpdates.wholesaleTiers = updates.wholesaleTiers;
      }

      await StockService.updateStock(id, stockUpdates as Partial<StockItem>);

      // Fetch and return updated item
      const stocks = await StockService.getAllStocks();
      const updatedStock = stocks.find((stock) => stock.id === id);
      if (!updatedStock) {
        throw new Error("Updated item not found");
      }

      const transformedItems = this.transformStocksToClothingInventory([
        updatedStock,
      ]);
      return transformedItems[0];
    } catch (error) {
      console.error("Error updating clothing inventory item:", error);
      throw new Error("Failed to update clothing inventory item");
    }
  }

  /**
   * Delete a clothing inventory item
   */
  static async deleteClothingInventoryItem(id: string): Promise<void> {
    try {
      await StockService.deleteStock(id);
    } catch (error) {
      console.error("Error deleting clothing inventory item:", error);
      throw new Error("Failed to delete clothing inventory item");
    }
  }

  /**
   * Get a single clothing inventory item by ID
   */
  static async getClothingInventoryItem(
    id: string,
  ): Promise<ClothingInventoryItem | null> {
    try {
      const stock = await StockService.getStockById(id);
      if (!stock) return null;

      const transformedItems = this.transformStocksToClothingInventory([stock]);
      return transformedItems[0];
    } catch (error) {
      console.error("Error fetching clothing inventory item:", error);
      throw new Error("Failed to fetch clothing inventory item");
    }
  }

  /**
   * Transform StockItem[] to ClothingInventoryItem[]
   */
  private static transformStocksToClothingInventory(
    stocks: StockItem[],
  ): ClothingInventoryItem[] {
    return stocks.map((stock) => {
      // Calculate total stock from all color variants
      const totalStock =
        stock.colorVariants?.reduce((total, variant) => {
          return (
            total +
            variant.sizeQuantities.reduce((variantTotal, sizeQty) => {
              return variantTotal + sizeQty.quantity;
            }, 0)
          );
        }, 0) || 0;

      // Extract unique colors
      const colors = stock.colorVariants?.map((variant) => variant.color) || [];

      // Determine category based on group name (you might want to make this more sophisticated)
      const category = this.determineCategory(stock.groupName);

      // Check if item is new (created within last 30 days)
      const isNew = this.isNewItem(stock.createdAt);

      // Get primary barcode (from first color variant)
      const barcode =
        stock.colorVariants?.[0]?.barcode || this.generateBarcode();

      return {
        id: stock.id,
        name: stock.groupName,
        price: stock.unitPrice,
        stock: totalStock,
        colors,
        image:
          stock.groupImage ||
          `https://via.placeholder.com/200x250/E5E7EB/6B7280?text=${encodeURIComponent(stock.groupName)}`,
        category,
        shop: stock.shop || "Main Branch", // Include shop information
        isNew,
        barcode,
        wholesaleTiers: stock.wholesaleTiers || [],
        colorVariants:
          stock.colorVariants?.map((variant) => ({
            id: variant.id,
            color: variant.color,
            colorCode: variant.colorCode,
            barcode: variant.barcode,
            image: variant.image,
            sizeQuantities: variant.sizeQuantities,
          })) || [],
      };
    });
  }

  /**
   * Determine category based on item name
   */
  private static determineCategory(name: string): string {
    const lowerName = name.toLowerCase();

    if (lowerName.includes("jean") || lowerName.includes("denim"))
      return "Jeans";
    if (lowerName.includes("shirt") || lowerName.includes("tee"))
      return "Shirts";
    if (lowerName.includes("dress")) return "Dresses";
    if (lowerName.includes("jacket") || lowerName.includes("coat"))
      return "Outerwear";
    if (lowerName.includes("shoe") || lowerName.includes("boot"))
      return "Shoes";
    if (
      lowerName.includes("bag") ||
      lowerName.includes("belt") ||
      lowerName.includes("hat")
    )
      return "Accessories";

    return "General";
  }

  /**
   * Check if item is new (created within last 30 days)
   */
  private static isNewItem(createdAt: string): boolean {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const itemDate = new Date(createdAt);
    return itemDate > thirtyDaysAgo;
  }

  /**
   * Generate a random barcode
   */
  private static generateBarcode(): string {
    // Generate a 12-digit barcode
    return Math.floor(Math.random() * 1000000000000)
      .toString()
      .padStart(12, "0");
  }
}
