/**
 * Open the checkout (ShoppingCartModal) from anywhere on the page.
 *
 * The checkout keeps its discount entries in component state, so there must be
 * exactly one instance per page - the one owned by TopNavBar. Screens such as
 * the POS terminal's order panel ask that instance to open through this event
 * instead of mounting a second copy that would not share those discounts.
 */
export const OPEN_POS_CART_EVENT = "pos:open-cart";

export function openPosCart(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(OPEN_POS_CART_EVENT));
}
