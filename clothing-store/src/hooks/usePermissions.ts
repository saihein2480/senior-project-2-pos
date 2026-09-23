import { useAuth } from "@/contexts/AuthContext";
import { useViewModeOptional } from "@/contexts/ViewModeContext";
import {
  getRolePermissions,
  FeaturePermissions,
} from "@/config/rolePermissions";
import { UserRole } from "@/types/auth";

export interface UsePermissionsResult extends FeaturePermissions {
  /** The role these permissions were resolved from (the previewed role for an owner). */
  role: UserRole | null;
  /** The role on the account, regardless of any preview. */
  actualRole: UserRole | null;
  /** True while an owner is previewing Manager or Staff. */
  isPreviewingRole: boolean;
}

/**
 * The permissions for the current user, resolved from
 * src/config/rolePermissions.ts (the documented matrix).
 *
 * Gate UI on these flags rather than on `user.role`, so the documentation stays
 * the only place roles are decided:
 *
 *   const permissions = usePermissions();
 *   {permissions.canDeleteProducts && <DeleteButton />}
 *
 * When an owner uses "View as role" in the top bar, these flags follow the
 * previewed role. That makes the preview honest: the owner sees and can do
 * exactly what a Manager or Staff member could, and switches back whenever they
 * like. For every other role the preview cannot apply, so permissions always
 * come from their real role.
 */
export function usePermissions(): UsePermissionsResult {
  const { user } = useAuth();
  const viewMode = useViewModeOptional();

  const actualRole = user?.role ?? null;
  // Outside a ViewModeProvider there is no preview, so use the real role.
  const role = viewMode ? viewMode.effectiveRole : actualRole;

  // An unknown or missing role resolves to the all-false permission set.
  const permissions = getRolePermissions(role ?? "customer");

  return {
    ...permissions,
    role,
    actualRole,
    isPreviewingRole: viewMode?.isViewingAsOtherRole ?? false,
  };
}
