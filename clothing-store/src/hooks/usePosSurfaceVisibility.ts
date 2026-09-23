import { useSettings } from "@/contexts/SettingsContext";
import { usePermissions } from "@/hooks/usePermissions";

/**
 * Should the walk-in POS surface be shown?
 *
 * "POS surface" means two things that only make sense together:
 *   - the Home entry in the side menu (the product grid you sell from)
 *   - the cart button in the top bar (where that grid checks out)
 *
 * An owner who runs the shop from the back office rather than the till can turn
 * both off with the single "Hide the walk-in POS" toggle in Settings. They are
 * deliberately one switch: a cart with no product grid, or a grid with no cart,
 * is a broken half-flow.
 *
 * Scope: the preference applies to the OWNER's interface only. Managers and
 * staff need the till to do their jobs, so it is ignored for them even though
 * the flag lives in the shared business settings document.
 *
 * Interaction with "View as role": this reads the EFFECTIVE role, so an owner
 * previewing Staff sees Home and the cart again - which is correct, because that
 * is what a staff member sees.
 *
 * Both consumers (Sidebar, TopNavBar) call this one hook so the two halves can
 * never drift apart.
 */
export function usePosSurfaceVisibility(): {
  /** True when the Home menu entry and the cart button should be hidden. */
  isPosSurfaceHidden: boolean;
  /** Convenience inverse, for readability at call sites. */
  isPosSurfaceVisible: boolean;
} {
  const { businessSettings } = useSettings();
  const { role } = usePermissions();

  const isPosSurfaceHidden =
    role === "owner" && businessSettings?.hidePosForOwner === true;

  return {
    isPosSurfaceHidden,
    isPosSurfaceVisible: !isPosSurfaceHidden,
  };
}
