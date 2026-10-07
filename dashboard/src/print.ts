/** In-app print preview — avoids window.open (blocked in Tauri WebView2). */

export type PrintPreviewOptions = {
  title?: string;
  receipt?: boolean;
};

let activeOverlay: HTMLElement | null = null;

function closePrintPreview(): void {
  if (!activeOverlay) return;
  activeOverlay.remove();
  activeOverlay = null;
  document.removeEventListener("keydown", onEscape);
}

function onEscape(e: KeyboardEvent): void {
  if (e.key === "Escape") closePrintPreview();
}

/**
 * Show HTML in a modal iframe; user prints via iframe.contentWindow.print().
 * No popup window — works in the installed Tauri client.
 */
export function openPrintPreview(html: string, opts: PrintPreviewOptions = {}): void {
  closePrintPreview();

  const title = opts.title ?? "Print preview";
  const receipt = opts.receipt === true;

  const overlay = document.createElement("div");
  overlay.className = "print-preview-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", title);

  const card = document.createElement("div");
  card.className = receipt ? "print-preview-card print-preview-card--receipt" : "print-preview-card";

  const toolbar = document.createElement("div");
  toolbar.className = "print-preview-toolbar";

  const heading = document.createElement("h2");
  heading.className = "print-preview-title";
  heading.textContent = title;

  const actions = document.createElement("div");
  actions.className = "print-preview-actions";

  const printBtn = document.createElement("button");
  printBtn.type = "button";
  printBtn.className = "btn primary";
  printBtn.textContent = "Print";

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "btn ghost";
  closeBtn.textContent = "Close";

  const frameWrap = document.createElement("div");
  frameWrap.className = receipt
    ? "print-preview-frame-wrap print-preview-frame-wrap--receipt"
    : "print-preview-frame-wrap";

  const iframe = document.createElement("iframe");
  iframe.className = "print-preview-iframe";
  iframe.title = title;
  iframe.setAttribute("sandbox", "allow-modals allow-same-origin allow-scripts");

  actions.append(printBtn, closeBtn);
  toolbar.append(heading, actions);
  frameWrap.append(iframe);
  card.append(toolbar, frameWrap);
  overlay.append(card);
  document.body.append(overlay);
  activeOverlay = overlay;
  document.addEventListener("keydown", onEscape);

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closePrintPreview();
  });
  closeBtn.addEventListener("click", () => closePrintPreview());
  printBtn.addEventListener("click", () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch {
      /* user can retry */
    }
  });

  iframe.srcdoc = html;
}

/** Fetch authenticated print HTML then open preview. */
export async function fetchAndPreviewPrint(
  path: string,
  getBase: () => string,
  getToken: () => string | null,
  opts: PrintPreviewOptions = {},
): Promise<void> {
  const token = getToken();
  const res = await fetch(`${getBase()}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `print failed (${res.status})`);
  }
  const html = await res.text();
  openPrintPreview(html, opts);
}
