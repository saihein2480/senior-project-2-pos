import { z } from "zod";

export const loginSchema = z.object({
  email: z
    .string()
    .min(1, "Email is required")
    .email("Please enter a valid email address"),
  password: z
    .string()
    .min(1, "Password is required")
    .min(6, "Password must be at least 6 characters"),
});

export const registerSchema = z
  .object({
    displayName: z
      .string()
      .min(1, "Display name is required")
      .min(2, "Display name must be at least 2 characters")
      .max(50, "Display name must be less than 50 characters"),
    email: z
      .string()
      .min(1, "Email is required")
      .email("Please enter a valid email address"),
    password: z
      .string()
      .min(1, "Password is required")
      .min(6, "Password must be at least 6 characters")
      .regex(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
        "Password must contain at least one uppercase letter, one lowercase letter, and one number",
      ),
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

export type LoginFormData = z.infer<typeof loginSchema>;
export type RegisterFormData = z.infer<typeof registerSchema>;

// Navigation types for sidebar menu
export interface MenuItem {
  id: string;
  label: string;
  icon: string;
  href?: string;
  children?: MenuItem[];
  isExpanded?: boolean;
  roles?: string[]; // Add roles property for role-based filtering
}

export interface NavigationProps {
  activeItem?: string;
  onItemClick?: (item: MenuItem) => void;
}

// Clothing inventory types
export interface WholesaleTier {
  id: string;
  minQuantity: number;
  price: number;
}

export interface ClothingInventoryItem {
  id: string;
  name: string;
  price: number;
  stock: number;
  colors: string[];
  image: string;
  category: string;
  shop: string; // branch/shop information
  isNew: boolean;
  barcode?: string;
  wholesaleTiers: WholesaleTier[];
  colorVariants: {
    id: string;
    color: string;
    colorCode: string;
    barcode: string;
    image?: string;
    sizeQuantities: { size: string; quantity: number }[];
  }[];
}
