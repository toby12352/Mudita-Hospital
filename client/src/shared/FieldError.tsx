import { useId } from "react";

/** Inline validation / API field error using existing `.form-error` styling. */
export function FieldError({
  id,
  children,
}: {
  id?: string;
  children: string | null | undefined;
}) {
  const autoId = useId();
  const text = children?.trim() ?? "";
  if (!text) return null;
  return (
    <p id={id ?? autoId} className="form-error" role="alert">
      {text}
    </p>
  );
}

/**
 * Scroll the element into the nearest scrollable ancestor (`block: "nearest"`),
 * then focus an input/select/textarea when the target is (or contains) one.
 */
export function revealField(el: HTMLElement | null | undefined): void {
  if (!el) return;
  el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  if (
    el instanceof HTMLInputElement ||
    el instanceof HTMLSelectElement ||
    el instanceof HTMLTextAreaElement
  ) {
    el.focus({ preventScroll: true });
    return;
  }
  const focusable = el.querySelector<HTMLElement>("input:not([disabled]), select:not([disabled]), textarea:not([disabled])");
  focusable?.focus({ preventScroll: true });
}
