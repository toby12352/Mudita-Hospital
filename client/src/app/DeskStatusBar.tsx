/** Classic desk footer: shortcut hints, date, Day (user), copyright. */

export type DeskShortcut = { key: string; label: string };

const AUTHOR = "Tun Aung Thaung";

export function DeskStatusBar({
  shortcuts,
  username,
  t,
}: {
  shortcuts: DeskShortcut[];
  username: string;
  t: (k: string) => string;
}) {
  const dateLabel = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const year = new Date().getFullYear();
  const copyright = t("deskCopyright")
    .replace("{year}", String(year))
    .replace("{name}", AUTHOR);

  return (
    <footer className="desk-status-bar" role="contentinfo">
      <div className="desk-status-shortcuts">
        {shortcuts.map((s) => (
          <span key={`${s.key}-${s.label}`} className="desk-status-hint">
            <kbd>{s.key}</kbd>
            <span>{s.label}</span>
          </span>
        ))}
      </div>
      <span className="desk-status-date">{dateLabel}</span>
      <span className="desk-status-user">
        {t("deskShiftDay")} ({username})
      </span>
      <span className="desk-status-copyright">{copyright}</span>
    </footer>
  );
}

export function shortcutsForView(
  view: string,
  intent: { opdScreen?: string; labScreen?: string; otMode?: string; pharmacyScreen?: string },
  t: (k: string) => string,
): DeskShortcut[] {
  const billKeys: DeskShortcut[] = [
    { key: "F2", label: t("newBill") },
    { key: "F5", label: t("saveDraft") },
    { key: "F6", label: t("print") },
    { key: "F7", label: t("markPaid") },
    { key: "F8", label: t("delete") },
    { key: "F9", label: t("history") },
    { key: "F10", label: t("cancel") },
    { key: "^F8", label: t("vDelete") },
  ];

  if (view === "pharmacy_transfer") {
    return [
      { key: "F2", label: t("newTransfer") },
      { key: "F5", label: t("saveDraft") },
      { key: "F7", label: t("transferAction") },
      { key: "F8", label: t("delete") },
      { key: "F9", label: t("history") },
      { key: "F10", label: t("cancel") },
      { key: "^F8", label: t("vDelete") },
    ];
  }

  if (view === "pharmacy_return") {
    return [
      { key: "F2", label: t("newReturn") },
      { key: "F5", label: t("saveDraft") },
      { key: "F6", label: t("print") },
      { key: "F7", label: t("markReturned") },
      { key: "F8", label: t("delete") },
      { key: "F9", label: t("history") },
      { key: "F10", label: t("cancel") },
      { key: "^F8", label: t("vDelete") },
    ];
  }

  if (view === "pharmacy_purchase") {
    return [
      { key: "F2", label: t("newPurchase") },
      { key: "F5", label: t("saveDraft") },
      { key: "F6", label: t("print") },
      { key: "F7", label: t("markPurchased") },
      { key: "F8", label: t("delete") },
      { key: "F9", label: t("history") },
      { key: "F10", label: t("cancel") },
      { key: "^F8", label: t("vDelete") },
    ];
  }

  if (view === "ipd_bill") {
    return [
      { key: "F2", label: t("newBill") },
      { key: "F5", label: t("saveDraft") },
      { key: "F6", label: t("print") },
      { key: "F8", label: t("delete") },
      { key: "F9", label: t("history") },
      { key: "F10", label: t("cancel") },
      { key: "^F8", label: t("vDelete") },
    ];
  }

  if (
    view === "ipd_expense" ||
    view === "pharmacy_expense" ||
    (view === "opd" && intent.opdScreen === "expense") ||
    (view === "ot" && intent.otMode === "expense")
  ) {
    return billKeys;
  }

  if (
    view === "pharmacy_billing" ||
    (view === "opd" && (intent.opdScreen ?? "bill") === "bill") ||
    (view === "lab" && (intent.labScreen ?? "bill") === "bill")
  ) {
    return billKeys;
  }
  if (view === "ot" && (intent.otMode ?? "case") === "case") {
    return billKeys;
  }
  if (view === "pharmacy") {
    return [
      { key: "F5", label: t("newBadge") },
      { key: "F8", label: t("delete") },
      { key: "F9", label: t("filter") },
    ];
  }
  return [];
}
