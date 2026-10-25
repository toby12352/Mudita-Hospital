import { invoke } from "@tauri-apps/api/core";
import { userMessage } from "@/shared/errors";
import { t } from "@/shared/i18n";
import { getDefaultPrinter, isTauriRuntime } from "@/shared/printerPrefs";

/** In-app print preview — avoids window.open (blocked in Tauri WebView2). */

export type PrintPreviewOptions = {
  title?: string;
  /** Short note under the title (e.g. bill already marked paid). */
  note?: string;
  /** Narrow thermal receipt chrome (~80mm). Default true for bills. */
  receipt?: boolean;
  /** Called after the preview Print button runs contentWindow.print(). */
  onPrinted?: () => void | Promise<void>;
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

function printButtonLabel(printer: string): string {
  if (printer) {
    return t("printOnPrinter").replace("{printer}", printer);
  }
  return t("print");
}

async function printHtmlSilent(html: string, printerName: string): Promise<void> {
  await invoke("print_html", { html, printer_name: printerName });
}

/**
 * Show HTML in a modal iframe; user prints via silent Tauri print (installed app)
 * or iframe.contentWindow.print() in browser Vite.
 * No popup window — works in the installed Tauri client.
 */
export function openPrintPreview(html: string, opts: PrintPreviewOptions = {}): void {
  closePrintPreview();

  const title = opts.title ?? "Print preview";
  const receipt = opts.receipt !== false;
  const printer = getDefaultPrinter();
  const tauri = isTauriRuntime();

  const overlay = document.createElement("div");
  overlay.className = "print-preview-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", title);

  const card = document.createElement("div");
  card.className = receipt ? "print-preview-card print-preview-card--receipt" : "print-preview-card";

  const toolbar = document.createElement("div");
  toolbar.className = "print-preview-toolbar";

  const headingWrap = document.createElement("div");
  headingWrap.className = "print-preview-heading";

  const heading = document.createElement("h2");
  heading.className = "print-preview-title";
  heading.textContent = title;
  headingWrap.append(heading);

  if (opts.note) {
    const note = document.createElement("p");
    note.className = "print-preview-note";
    note.textContent = opts.note;
    headingWrap.append(note);
  }

  const status = document.createElement("p");
  status.className = "print-preview-note print-preview-status";
  status.hidden = true;
  headingWrap.append(status);

  if (tauri && !printer) {
    status.hidden = false;
    status.textContent = t("printNoDefaultPrinter");
  }

  const actions = document.createElement("div");
  actions.className = "print-preview-actions";

  const printBtn = document.createElement("button");
  printBtn.type = "button";
  printBtn.className = "btn primary";
  printBtn.textContent = printButtonLabel(printer);
  if (tauri && !printer) {
    printBtn.disabled = true;
  }

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "btn ghost";
  closeBtn.textContent = t("close");

  const frameWrap = document.createElement("div");
  frameWrap.className = receipt ? "print-preview-frame-wrap print-preview-frame-wrap--receipt" : "print-preview-frame-wrap";

  const iframe = document.createElement("iframe");
  iframe.className = "print-preview-iframe";
  iframe.title = title;
  iframe.setAttribute("sandbox", "allow-modals allow-same-origin allow-scripts");

  actions.append(printBtn, closeBtn);
  toolbar.append(headingWrap, actions);
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

  let printing = false;
  printBtn.addEventListener("click", () => {
    if (printing) return;

    const runOnPrinted = () => {
      const cb = opts.onPrinted;
      if (cb) void Promise.resolve(cb()).catch(() => {});
    };

    if (!tauri) {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch {
        /* user can retry */
      }
      runOnPrinted();
      return;
    }

    const target = getDefaultPrinter();
    if (!target) {
      status.hidden = false;
      status.textContent = t("printNoDefaultPrinter");
      return;
    }

    printing = true;
    printBtn.disabled = true;
    printBtn.textContent = t("printing");
    status.hidden = true;

    void printHtmlSilent(html, target)
      .then(() => {
        runOnPrinted();
        status.hidden = false;
        status.textContent = t("printSent");
      })
      .catch((err: unknown) => {
        status.hidden = false;
        let message = t("printFailed");
        if (typeof err === "string" && err.trim()) message = err;
        else if (err instanceof Error && err.message) message = err.message;
        else if (err && typeof err === "object" && "message" in err) {
          const m = (err as { message: unknown }).message;
          if (typeof m === "string" && m.trim()) message = m;
        }
        status.textContent = message;
      })
      .finally(() => {
        printing = false;
        printBtn.disabled = false;
        printBtn.textContent = printButtonLabel(getDefaultPrinter());
      });
  });

  // srcdoc keeps auth-fetched HTML in-process without a second navigation.
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
    throw new Error(userMessage(text || `print failed (${res.status})`, res.status));
  }
  const html = await res.text();
  openPrintPreview(html, opts);
}
