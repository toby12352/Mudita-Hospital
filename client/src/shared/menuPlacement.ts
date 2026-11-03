/** Prefer opening a menu below its anchor; flip above and cap height to the visible gap. */

export type MenuPlacement = {
  side: "below" | "above";
  maxHeightPx: number;
};

const MENU_GAP_PX = 4;
/** Matches the historical `.typeahead-menu` cap of 16rem at a 16px root. */
const DEFAULT_PREFERRED_MAX_PX = 256;
const MIN_MENU_PX = 48;

function clippingRect(el: HTMLElement): DOMRect {
  let node: HTMLElement | null = el.parentElement;
  while (node) {
    const { overflowY } = getComputedStyle(node);
    if (overflowY === "auto" || overflowY === "scroll" || overflowY === "hidden") {
      return node.getBoundingClientRect();
    }
    node = node.parentElement;
  }
  return new DOMRect(0, 0, window.innerWidth, window.innerHeight);
}

export function placeMenuAgainstAnchor(
  anchor: HTMLElement,
  preferredMaxPx: number = DEFAULT_PREFERRED_MAX_PX,
): MenuPlacement {
  const anchorRect = anchor.getBoundingClientRect();
  const clip = clippingRect(anchor);
  const spaceBelow = Math.max(0, clip.bottom - anchorRect.bottom - MENU_GAP_PX);
  const spaceAbove = Math.max(0, anchorRect.top - clip.top - MENU_GAP_PX);
  const side: "below" | "above" =
    spaceBelow >= preferredMaxPx || spaceBelow >= spaceAbove ? "below" : "above";
  const available = side === "below" ? spaceBelow : spaceAbove;
  const maxHeightPx = Math.max(MIN_MENU_PX, Math.min(preferredMaxPx, available));
  return { side, maxHeightPx };
}

/** Keep an option inside the menu's own scrollport; do not scroll the page. */
export function revealOptionInMenu(menu: HTMLElement, option: HTMLElement) {
  const pane = menu.getBoundingClientRect();
  const row = option.getBoundingClientRect();
  if (row.top < pane.top) {
    menu.scrollTop += row.top - pane.top;
  } else if (row.bottom > pane.bottom) {
    menu.scrollTop += row.bottom - pane.bottom;
  }
}

export function applyMenuPlacement(anchor: HTMLElement, menu: HTMLElement, preferredMaxPx?: number) {
  const { side, maxHeightPx } = placeMenuAgainstAnchor(anchor, preferredMaxPx);
  menu.dataset.side = side;
  menu.style.setProperty("--typeahead-menu-max-height", `${maxHeightPx}px`);
}
