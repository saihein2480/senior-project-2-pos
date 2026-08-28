import { useAuth } from "@/contexts/AuthContext";
import { getRolePermissions, FeaturePermissions } from "@/config/rolePermissions";
import { UserRole } from "@/types/auth";

/**
 * Custom hook to get permissions for the current user
 * 
 * Usage:
 * const permissions = usePermissions();
 * 
 * if (permissions.canEditProducts) {
 *   // Show edit button
 * }
 */
export function usePermissions(): FeaturePermissions & { role: UserRole | null } {
  const { user } = useAuth();
  
  const role = user?.role || null;
  const permissions = role ? getRolePermissions(role) : getRolePermissions("customer");
  
  return {
    ...permissions,
    role,
  };
}
