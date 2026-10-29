/** Stop the mouse wheel from changing focused `input[type=number]` values. */

function isNumberInput(el: EventTarget | null): el is HTMLInputElement {
  return el instanceof HTMLInputElement && el.type === "number";
}

function scrollableAncestor(el: Element): Element | null {
  let node: Element | null = el.parentElement;
  while (node) {
    const style = getComputedStyle(node);
    const overflowY = style.overflowY;
    if (
      (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") &&
      node.scrollHeight > node.clientHeight
    ) {
      return node;
    }
    node = node.parentElement;
  }
  return document.scrollingElement;
}

function onWheel(e: WheelEvent): void {
  if (e.ctrlKey || e.metaKey) return;
  const target = e.target;
  if (!(target instanceof Element)) return;
  const active = document.activeElement;
  if (!isNumberInput(active)) return;
  if (!active.contains(target) && target !== active) return;

  e.preventDefault();

  const scroller = scrollableAncestor(active);
  if (!scroller) return;
  scroller.scrollTop += e.deltaY;
}

let installed = false;

/** Install once at app boot. Safe to call repeatedly. */
export function installNumberInputWheelGuard(): void {
  if (installed) return;
  installed = true;
  document.addEventListener("wheel", onWheel, { capture: true, passive: false });
}
