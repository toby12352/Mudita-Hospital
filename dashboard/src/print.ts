import { reportUnauthorizedIfNeeded } from "./api";
import { userMessage } from "./errors";
import { t } from "./i18n";

/** In-app print preview — avoids window.open (blocked in Tauri WebView2). */

export type BillDetailScope = "income" | "expense" | "all";
export type PrintReportLang = "en" | "my";

export type BillDetailFilter = {
  placeholder: string;
  income: string;
  expenses: string;
  all: string;
  prompt: string;
  load: (scope: BillDetailScope) => Promise<string>;
};

export type ReportLangControl = {
  initial: PrintReportLang;
  englishLabel: string;
  myanmarLabel: string;
  langGroupLabel: string;
  onChange: (lang: PrintReportLang) => Promise<string>;
};

export type ExcelDownloadControl = {
  label: string;
  download: (lang: PrintReportLang) => Promise<void>;
};

export type PrintPreviewOptions = {
  title?: string;
  receipt?: boolean;
  billDetail?: BillDetailFilter;
  reportLang?: ReportLangControl;
  excel?: ExcelDownloadControl;
};

let activeOverlay: HTMLElement | null = null;
let opener: HTMLElement | null = null;
/** Set before an await so the preview returns to the control that started the fetch. */
let pendingOpener: HTMLElement | null = null;

function focusableIn(root: ParentNode): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])',
    ),
  );
}

function closePrintPreview(): void {
  if (!activeOverlay) return;
  activeOverlay.remove();
  activeOverlay = null;
  document.removeEventListener("keydown", onPreviewKey, true);
  const prev = opener;
  opener = null;
  if (prev && document.contains(prev)) prev.focus();
}

function onPreviewKey(e: KeyboardEvent): void {
  const root = activeOverlay;
  if (!root) return;
  if (e.key === "Escape") {
    e.preventDefault();
    e.stopPropagation();
    closePrintPreview();
    return;
  }
  if (e.key !== "Tab") return;
  const focusable = focusableIn(root);
  if (focusable.length === 0) return;
  const active = document.activeElement;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const inside = active instanceof Node && root.contains(active);
  if (e.shiftKey) {
    if (!inside || active === first) {
      e.preventDefault();
      last.focus();
    }
  } else if (!inside || active === last) {
    e.preventDefault();
    first.focus();
  }
}

/**
 * Show HTML in a modal iframe; user prints via iframe.contentWindow.print().
 * No popup window — works in the installed Tauri client.
 * Keys fired inside the iframe document do not reach this listener.
 */
export function openPrintPreview(html: string, opts: PrintPreviewOptions = {}): void {
  const nextOpener =
    pendingOpener ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
  pendingOpener = null;
  closePrintPreview();
  opener = nextOpener;

  const title = opts.title ?? "Print preview";
  const receipt = opts.receipt === true;
  const reportLang = opts.reportLang;
  const excel = opts.excel;
  let currentLang: PrintReportLang = reportLang?.initial ?? "en";
  let langLoading = false;

  const overlay = document.createElement("div");
  overlay.className = "print-preview-overlay print-preview-shell";
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

  let enBtn: HTMLButtonElement | null = null;
  let myBtn: HTMLButtonElement | null = null;
  if (reportLang) {
    const langGroup = document.createElement("div");
    langGroup.className = "print-preview-lang";
    langGroup.setAttribute("role", "group");
    langGroup.setAttribute("aria-label", reportLang.langGroupLabel);

    enBtn = document.createElement("button");
    enBtn.type = "button";
    enBtn.className = "btn ghost";
    enBtn.textContent = reportLang.englishLabel;

    myBtn = document.createElement("button");
    myBtn.type = "button";
    myBtn.className = "btn ghost";
    myBtn.textContent = reportLang.myanmarLabel;

    const syncLangButtons = () => {
      if (!enBtn || !myBtn) return;
      const enActive = currentLang === "en";
      enBtn.classList.toggle("active", enActive);
      myBtn.classList.toggle("active", !enActive);
      enBtn.setAttribute("aria-pressed", enActive ? "true" : "false");
      myBtn.setAttribute("aria-pressed", enActive ? "false" : "true");
      enBtn.disabled = langLoading;
      myBtn.disabled = langLoading;
    };

    const loadLang = (lang: PrintReportLang) => {
      if (langLoading || lang === currentLang) return;
      langLoading = true;
      syncLangButtons();
      void reportLang.onChange(lang).then(
        (next) => {
          currentLang = lang;
          langLoading = false;
          syncLangButtons();
          iframe.srcdoc = withPrintDocumentTitle(next);
        },
        (err: unknown) => {
          langLoading = false;
          syncLangButtons();
          const message = err instanceof Error ? err.message : "print failed";
          iframe.srcdoc = withPrintDocumentTitle(previewMessage(message));
        },
      );
    };

    enBtn.addEventListener("click", () => loadLang("en"));
    myBtn.addEventListener("click", () => loadLang("my"));
    syncLangButtons();
    langGroup.append(enBtn, myBtn);
    actions.append(langGroup);
  }

  const printBtn = document.createElement("button");
  printBtn.type = "button";
  printBtn.className = "btn primary";
  printBtn.textContent = t("print");

  let excelBtn: HTMLButtonElement | null = null;
  if (excel) {
    excelBtn = document.createElement("button");
    excelBtn.type = "button";
    excelBtn.className = "btn ghost";
    excelBtn.textContent = excel.label;
    excelBtn.addEventListener("click", () => {
      if (!excelBtn) return;
      excelBtn.disabled = true;
      void excel.download(currentLang).then(
        () => {
          if (excelBtn) excelBtn.disabled = false;
        },
        (err: unknown) => {
          if (excelBtn) excelBtn.disabled = false;
          const message = err instanceof Error ? err.message : "export failed";
          iframe.srcdoc = withPrintDocumentTitle(previewMessage(message));
        },
      );
    });
  }

  const billDetail = opts.billDetail;
  let loadedScope: BillDetailScope | "" = "";
  let loadingScope = false;
  const scopeSelect = billDetail ? document.createElement("select") : null;
  if (scopeSelect && billDetail) {
    scopeSelect.className = "print-preview-scope";
    scopeSelect.setAttribute("aria-label", billDetail.placeholder);
    const options: Array<[string, string]> = [
      ["", billDetail.placeholder],
      ["income", billDetail.income],
      ["expense", billDetail.expenses],
      ["all", billDetail.all],
    ];
    for (const [value, label] of options) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      scopeSelect.append(option);
    }
  }

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "btn ghost";
  closeBtn.textContent = t("close");

  const frameWrap = document.createElement("div");
  frameWrap.className = receipt
    ? "print-preview-frame-wrap print-preview-frame-wrap--receipt"
    : "print-preview-frame-wrap";

  const iframe = document.createElement("iframe");
  iframe.className = "print-preview-iframe";
  iframe.title = title;
  iframe.setAttribute("sandbox", "allow-modals allow-same-origin allow-scripts");

  if (scopeSelect) actions.append(scopeSelect);
  if (excelBtn) actions.append(excelBtn);
  actions.append(printBtn, closeBtn);
  toolbar.append(heading, actions);
  frameWrap.append(iframe);
  card.append(toolbar, frameWrap);
  overlay.append(card);
  document.body.append(overlay);
  activeOverlay = overlay;
  document.addEventListener("keydown", onPreviewKey, true);

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closePrintPreview();
  });
  closeBtn.addEventListener("click", () => closePrintPreview());
  if (scopeSelect && billDetail) {
    scopeSelect.addEventListener("change", () => {
      const value = scopeSelect.value;
      if (value !== "income" && value !== "expense" && value !== "all") {
        loadedScope = "";
        iframe.srcdoc = withPrintDocumentTitle(previewMessage(billDetail.prompt));
        return;
      }
      const scope: BillDetailScope = value;
      loadingScope = true;
      loadedScope = "";
      iframe.srcdoc = withPrintDocumentTitle(previewMessage(billDetail.prompt));
      void billDetail.load(scope).then(
        (next) => {
          if (scopeSelect.value !== scope) return;
          loadingScope = false;
          loadedScope = scope;
          iframe.srcdoc = withPrintDocumentTitle(next);
        },
        (err: unknown) => {
          if (scopeSelect.value !== scope) return;
          loadingScope = false;
          loadedScope = "";
          const message = err instanceof Error ? err.message : "print failed";
          iframe.srcdoc = withPrintDocumentTitle(previewMessage(message));
        },
      );
    });
  }

  printBtn.addEventListener("click", () => {
    if (billDetail && (loadingScope || !loadedScope)) {
      openScopeSelect(scopeSelect);
      return;
    }
    try {
      printIframe(iframe);
    } catch {
      /* user can retry */
    }
  });

  iframe.srcdoc = withPrintDocumentTitle(billDetail ? previewMessage(billDetail.prompt) : html);
  printBtn.focus({ focusVisible: true });
}

const PRINT_DOCUMENT_TITLE = "Software by TAT";

/** Browser print chrome uses <title>; keep Mudita Dashboard out of the footer. */
function withPrintDocumentTitle(html: string): string {
  if (/<title\b[^>]*>[\s\S]*?<\/title>/i.test(html)) {
    return html.replace(/<title\b[^>]*>[\s\S]*?<\/title>/i, `<title>${PRINT_DOCUMENT_TITLE}</title>`);
  }
  return html.replace(/<head\b([^>]*)>/i, `<head$1><title>${PRINT_DOCUMENT_TITLE}</title>`);
}

function printIframe(iframe: HTMLIFrameElement): void {
  const win = iframe.contentWindow;
  const doc = iframe.contentDocument;
  if (!win) return;
  const prevParentTitle = document.title;
  const prevFrameTitle = doc?.title ?? "";
  document.title = PRINT_DOCUMENT_TITLE;
  if (doc) doc.title = PRINT_DOCUMENT_TITLE;
  const restore = () => {
    document.title = prevParentTitle;
    if (doc) doc.title = prevFrameTitle;
    win.removeEventListener("afterprint", restore);
  };
  win.addEventListener("afterprint", restore);
  win.focus();
  win.print();
}

function previewMessage(message: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${PRINT_DOCUMENT_TITLE}</title></head><body style="font-family:Arial,sans-serif;padding:24px;color:#333"><p>${escapePreviewText(message)}</p></body></html>`;
}

function escapePreviewText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function openScopeSelect(select: HTMLSelectElement | null): void {
  if (!select) return;
  const picker = select as HTMLSelectElement & { showPicker?: () => void };
  if (typeof picker.showPicker === "function") {
    try {
      picker.showPicker();
      return;
    } catch {
      /* fall through when the browser blocks the picker */
    }
  }
  select.focus();
}

function printFailureRaw(text: string, status: number, fallback: string): string {
  const trimmed = text.trim();
  if (trimmed) {
    try {
      const body = JSON.parse(trimmed) as { error?: unknown };
      if (typeof body.error === "string" && body.error.trim()) return body.error;
    } catch {
      /* keep the body */
    }
    return trimmed;
  }
  return `${fallback} (${status})`;
}

/** Fetch authenticated print HTML. */
export async function fetchPrintHTML(
  path: string,
  getBase: () => string,
  getToken: () => string | null,
): Promise<string> {
  const token = getToken();
  const res = await fetch(`${getBase()}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const text = await res.text();
    const raw = printFailureRaw(text, res.status, "print failed");
    reportUnauthorizedIfNeeded(res.status, raw);
    throw new Error(userMessage(raw, res.status));
  }
  return res.text();
}

/** Fetch authenticated CSV and trigger a browser download (Excel-friendly UTF-8 BOM). */
export async function downloadPrintCSV(
  path: string,
  getBase: () => string,
  getToken: () => string | null,
): Promise<void> {
  const token = getToken();
  const res = await fetch(`${getBase()}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const text = await res.text();
    const raw = printFailureRaw(text, res.status, "export failed");
    reportUnauthorizedIfNeeded(res.status, raw);
    throw new Error(userMessage(raw, res.status));
  }
  const blob = await res.blob();
  const cd = res.headers.get("Content-Disposition") || "";
  const match = /filename="([^"]+)"/.exec(cd);
  const filename = match?.[1] ?? "mudita-report.csv";
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Fetch authenticated print HTML then open preview. */
export async function fetchAndPreviewPrint(
  path: string,
  getBase: () => string,
  getToken: () => string | null,
  opts: PrintPreviewOptions = {},
): Promise<void> {
  pendingOpener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  try {
    const html = await fetchPrintHTML(path, getBase, getToken);
    openPrintPreview(html, opts);
  } finally {
    pendingOpener = null;
  }
}
