import { FormEvent, useEffect, useRef, useState } from "react";
import {
  bulkUpdateDoctors,
  bulkUpdateItems,
  bulkUpdateServices,
  downloadExportCSV,
  importCSV,
  listMasterDoctors,
  listMasterItems,
  listMasterServices,
  type CsvImportResult,
  type MasterDoctor,
  type MasterItem,
  type MasterService,
} from "../bulkApi";
import { importLineMessage } from "../errors";
import { formatMMK } from "../lib/format";

type Props = {
  t: (k: string) => string;
};

type Tab = "items" | "services" | "doctors";

function focusableIn(root: ParentNode): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  );
}

export function MasterDataPage({ t }: Props) {
  const [tab, setTab] = useState<Tab>("items");
  const [q, setQ] = useState("");
  const [items, setItems] = useState<MasterItem[]>([]);
  const [services, setServices] = useState<MasterService[]>([]);
  const [doctors, setDoctors] = useState<MasterDoctor[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [epoch, setEpoch] = useState(0);

  const [bulkOpen, setBulkOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  // Item bulk fields
  const [sell, setSell] = useState("");
  const [buy, setBuy] = useState("");
  const [reorder, setReorder] = useState("");
  // Service
  const [svcPrice, setSvcPrice] = useState("");
  // Doctor
  const [consult, setConsult] = useState("");
  const [otFee, setOtFee] = useState("");

  const [importText, setImportText] = useState("");
  const [importResult, setImportResult] = useState<CsvImportResult | null>(null);
  const [importReason, setImportReason] = useState("");
  const [importConfirm, setImportConfirm] = useState("");

  const tabRef = useRef(tab);
  tabRef.current = tab;
  const bulkDialogRef = useRef<HTMLDivElement>(null);
  const bulkFirstRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        if (tab === "items") {
          const rows = await listMasterItems(q.trim());
          if (!cancelled) setItems(rows);
        } else if (tab === "services") {
          const rows = await listMasterServices(q.trim());
          if (!cancelled) setServices(rows);
        } else {
          const rows = await listMasterDoctors(q.trim());
          if (!cancelled) setDoctors(rows);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : t("error"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, epoch, t]);

  useEffect(() => {
    setSelected(new Set());
    setBulkOpen(false);
    setImportResult(null);
    setOkMsg(null);
  }, [tab]);

  useEffect(() => {
    if (!bulkOpen) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => {
      const field = bulkFirstRef.current;
      if (field) field.focus();
      else bulkDialogRef.current?.focus();
    });

    function onKey(e: KeyboardEvent) {
      if (document.querySelector(".print-preview-overlay")) return;
      const root = bulkDialogRef.current;
      if (!root) return;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setBulkOpen(false);
        return;
      }
      if (e.key !== "Tab") return;
      const focusable = focusableIn(root);
      if (focusable.length === 0) return;
      const active = document.activeElement;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const inside = active instanceof Node && root.contains(active) && active !== root;
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
    document.addEventListener("keydown", onKey, true);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKey, true);
      const prev = opener;
      const active = document.activeElement;
      const dialog = bulkDialogRef.current;
      const stillInside = dialog != null && active instanceof Node && dialog.contains(active);
      const nothingFocused =
        active == null || active === document.body || active === document.documentElement;
      if (!(stillInside || nothingFocused) || !prev || !document.contains(prev)) return;
      if (prev instanceof HTMLButtonElement && prev.disabled) {
        document.getElementById(`master-tab-${tabRef.current}`)?.focus();
        return;
      }
      prev.focus();
    };
  }, [bulkOpen]);

  const rowsCount = tab === "items" ? items.length : tab === "services" ? services.length : doctors.length;
  const allIds =
    tab === "items" ? items.map((r) => r.id) : tab === "services" ? services.map((r) => r.id) : doctors.map((r) => r.id);

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === allIds.length) setSelected(new Set());
    else setSelected(new Set(allIds));
  }

  async function onExport() {
    setError(null);
    try {
      await downloadExportCSV(tab);
      setOkMsg(t("exportDone"));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("error"));
    }
  }

  async function onBulk(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setOkMsg(null);
    if (confirmText.trim() !== "UPDATE") {
      setError(t("confirmUpdateHint"));
      return;
    }
    if (!reason.trim()) {
      setError(t("reasonRequired"));
      return;
    }
    const ids = [...selected];
    if (ids.length === 0) {
      setError(t("selectRows"));
      return;
    }
    setBusy(true);
    try {
      if (tab === "items") {
        const body: Parameters<typeof bulkUpdateItems>[0] = { reason: reason.trim(), ids };
        if (buy.trim() !== "") body.buy_price_mmk = Number(buy);
        if (sell.trim() !== "") body.sell_price_mmk = Number(sell);
        if (reorder.trim() !== "") body.reorder_level = Number(reorder);
        if (
          body.buy_price_mmk === undefined &&
          body.sell_price_mmk === undefined &&
          body.reorder_level === undefined
        ) {
          throw new Error(t("setAtLeastOne"));
        }
        const res = await bulkUpdateItems(body);
        setOkMsg(`${t("updated")} ${res.updated}`);
      } else if (tab === "services") {
        if (svcPrice.trim() === "") throw new Error(t("setAtLeastOne"));
        const res = await bulkUpdateServices({
          reason: reason.trim(),
          ids,
          price_mmk: Number(svcPrice),
        });
        setOkMsg(`${t("updated")} ${res.updated}`);
      } else {
        const body: Parameters<typeof bulkUpdateDoctors>[0] = { reason: reason.trim(), ids };
        if (consult.trim() !== "") body.consultation_mmk = Number(consult);
        if (otFee.trim() !== "") body.ot_mmk = Number(otFee);
        if (body.consultation_mmk === undefined && body.ot_mmk === undefined) {
          throw new Error(t("setAtLeastOne"));
        }
        const res = await bulkUpdateDoctors(body);
        setOkMsg(`${t("updated")} ${res.updated}`);
      }
      setBulkOpen(false);
      setConfirmText("");
      setReason("");
      setSelected(new Set());
      setEpoch((n) => n + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("error"));
    } finally {
      setBusy(false);
    }
  }

  async function onDryRun() {
    setError(null);
    setImportResult(null);
    if (!importText.trim()) {
      setError(t("pasteCsv"));
      return;
    }
    setBusy(true);
    try {
      const res = await importCSV(tab, { csv: importText, dry_run: true });
      setImportResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("error"));
    } finally {
      setBusy(false);
    }
  }

  async function onApplyImport() {
    setError(null);
    if (importConfirm.trim() !== "IMPORT") {
      setError(t("confirmImportHint"));
      return;
    }
    if (!importReason.trim()) {
      setError(t("reasonRequired"));
      return;
    }
    setBusy(true);
    try {
      const res = await importCSV(tab, {
        csv: importText,
        dry_run: false,
        reason: importReason.trim(),
      });
      setImportResult(res);
      if (res.status === "ok") {
        setOkMsg(`${t("importApplied")} ${res.applied}`);
        setImportConfirm("");
        setEpoch((n) => n + 1);
      } else if (res.errors?.length) {
        setError(t("importHasErrors"));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("error"));
    } finally {
      setBusy(false);
    }
  }

  function runSearch(e: FormEvent) {
    e.preventDefault();
    setEpoch((n) => n + 1);
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "items", label: t("items") },
    { id: "services", label: t("services") },
    { id: "doctors", label: t("doctors") },
  ];
  const tabLabel = tabs.find((item) => item.id === tab)?.label ?? t("items");

  function selectHeading() {
    return (
      <th>
        <span className="sr-only">{t("select")}</span>
      </th>
    );
  }

  function selectCell(id: number, name: string) {
    return (
      <td>
        <input
          type="checkbox"
          aria-label={name ? `${t("select")} ${name}` : t("select")}
          checked={selected.has(id)}
          onChange={() => toggle(id)}
        />
      </td>
    );
  }

  return (
    <div className="page page-frame master-page">
      <div className="page-header">
        <p className="lede muted">{t("masterLede")}</p>
        <div className="page-actions">
          <button type="button" className="btn ghost" onClick={() => void onExport()}>
            {t("exportCsv")}
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={selected.size === 0}
            onClick={() => setBulkOpen(true)}
          >
            {t("bulkUpdate")} ({selected.size})
          </button>
        </div>
      </div>

      <div className="range-toggle" role="tablist" aria-label={t("masterData")}>
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            id={`master-tab-${item.id}`}
            role="tab"
            className={`btn ghost${tab === item.id ? " active" : ""}`}
            aria-selected={tab === item.id}
            aria-controls={`master-panel-${item.id}`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div id={`master-panel-${tab}`} role="tabpanel" aria-labelledby={`master-tab-${tab}`}>
        <form className="inline-search" onSubmit={runSearch}>
          <label htmlFor="master-search">{t("search")}</label>
          <input
            id="master-search"
            className="input"
            type="search"
            placeholder={t("search")}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button type="submit" className="btn ghost">
            {t("refresh")}
          </button>
        </form>

        {error && !bulkOpen ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        {okMsg ? (
          <p className="form-ok" role="status">
            {okMsg}
          </p>
        ) : null}
        {loading ? (
          <p className="muted" aria-live="polite">
            {t("loading")}
          </p>
        ) : null}

        <section className="panel" aria-labelledby="master-list-title">
          <h2 id="master-list-title">{tabLabel}</h2>
          <div className="panel-subhead">
            <span>
              {rowsCount} {t("rows")} · {selected.size} {t("selected")}
            </span>
            <label className="check-inline">
              <input
                type="checkbox"
                checked={allIds.length > 0 && selected.size === allIds.length}
                onChange={toggleAll}
              />
              {t("selectAll")}
            </label>
          </div>

          {tab === "items" ? (
            <div className="table-scroll">
              <table className="data-table" aria-labelledby="master-list-title">
                <thead>
                  <tr>
                    {selectHeading()}
                    <th>{t("code")}</th>
                    <th>{t("name")}</th>
                    <th className="num">{t("buyPrice")}</th>
                    <th className="num">{t("sellPrice")}</th>
                    <th className="num">{t("reorder")}</th>
                    <th className="num">{t("onHand")}</th>
                    <th>{t("active")}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((row) => (
                    <tr key={row.id} className={row.low_stock ? "row-warn" : undefined}>
                      {selectCell(row.id, row.name)}
                      <td>
                        <code>{row.code}</code>
                      </td>
                      <td>
                        {row.name}
                        {row.low_stock ? ` · ${t("lowStock")}` : ""}
                      </td>
                      <td className="num">{formatMMK(row.buy_price_mmk)}</td>
                      <td className="num">{formatMMK(row.sell_price_mmk)}</td>
                      <td className="num">{row.reorder_level}</td>
                      <td className="num">{row.stock_main}</td>
                      <td>{row.active ? t("yes") : t("no")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {tab === "services" ? (
            <div className="table-scroll">
              <table className="data-table" aria-labelledby="master-list-title">
                <thead>
                  <tr>
                    {selectHeading()}
                    <th>{t("code")}</th>
                    <th>{t("name")}</th>
                    <th className="num">{t("price")}</th>
                    <th>{t("active")}</th>
                  </tr>
                </thead>
                <tbody>
                  {services.map((row) => (
                    <tr key={row.id}>
                      {selectCell(row.id, row.name)}
                      <td>
                        <code>{row.code}</code>
                      </td>
                      <td>{row.name}</td>
                      <td className="num">{formatMMK(row.price_mmk)}</td>
                      <td>{row.active ? t("yes") : t("no")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {tab === "doctors" ? (
            <div className="table-scroll">
              <table className="data-table" aria-labelledby="master-list-title">
                <thead>
                  <tr>
                    {selectHeading()}
                    <th className="num">{t("idLabel")}</th>
                    <th>{t("name")}</th>
                    <th>{t("specialty")}</th>
                    <th className="num">{t("consultFee")}</th>
                    <th className="num">{t("otFee")}</th>
                    <th>{t("active")}</th>
                  </tr>
                </thead>
                <tbody>
                  {doctors.map((row) => (
                    <tr key={row.id}>
                      {selectCell(row.id, row.name)}
                      <td className="num">{row.id}</td>
                      <td>{row.name}</td>
                      <td>{row.specialty || "—"}</td>
                      <td className="num">{formatMMK(row.fees.consultation_mmk)}</td>
                      <td className="num">{formatMMK(row.fees.ot_mmk)}</td>
                      <td>{row.active ? t("yes") : t("no")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {!loading && rowsCount === 0 ? <p className="empty-state">{t("noRows")}</p> : null}
        </section>

        <section className="panel" aria-labelledby="master-csv-title">
          <h2 id="master-csv-title">{t("csvImport")}</h2>
          <p className="muted tiny">{t("csvImportHint")}</p>
          <label className="csv-paste" htmlFor="master-csv">
            {t("csvPasteLabel")}
            <textarea
              id="master-csv"
              className="input textarea"
              rows={5}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder={t("pasteCsv")}
            />
          </label>
          <div className="page-actions">
            <button type="button" className="btn ghost" disabled={busy} onClick={() => void onDryRun()}>
              {t("dryRun")}
            </button>
          </div>
          {importResult ? (
            <div className="import-result">
              <p className="muted">
                {t("validRows")}: {importResult.valid}
                {importResult.would_ok ? ` · ${t("readyToApply")}` : ""}
                {importResult.applied ? ` · ${t("importApplied")} ${importResult.applied}` : ""}
              </p>
              {importResult.errors?.length ? (
                <ul className="error-list" role="alert">
                  {importResult.errors.slice(0, 20).map((e, i) => (
                    <li key={`${e.line}-${i}`}>{importLineMessage(e.line, e.message)}</li>
                  ))}
                </ul>
              ) : null}
              {importResult.would_ok && importResult.dry_run ? (
                <div className="bulk-fields">
                  <label>
                    {t("reason")}
                    <input
                      className="input"
                      value={importReason}
                      onChange={(e) => setImportReason(e.target.value)}
                    />
                  </label>
                  <label>
                    {t("typeImport")}
                    <input
                      className="input"
                      value={importConfirm}
                      onChange={(e) => setImportConfirm(e.target.value)}
                      placeholder="IMPORT"
                      autoComplete="off"
                    />
                  </label>
                  <button
                    type="button"
                    className="btn danger"
                    disabled={busy}
                    onClick={() => void onApplyImport()}
                  >
                    {busy ? t("busy") : t("applyImport")}
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      </div>

      {bulkOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setBulkOpen(false)}>
          <div
            ref={bulkDialogRef}
            className="modal panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="bulk-title"
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="bulk-title">
              {t("bulkUpdate")} — {selected.size} {t("rows")}
            </h3>
            <p className="muted tiny">{t("bulkWarn")}</p>
            <form className="bulk-fields" onSubmit={(e) => void onBulk(e)}>
              {error ? (
                <p className="form-error" role="alert">
                  {error}
                </p>
              ) : null}
              {tab === "items" ? (
                <>
                  <label>
                    {t("sellPrice")} ({t("mmk")})
                    <input
                      ref={bulkFirstRef}
                      className="input"
                      type="number"
                      min={0}
                      value={sell}
                      onChange={(e) => setSell(e.target.value)}
                    />
                  </label>
                  <label>
                    {t("buyPrice")} ({t("mmk")})
                    <input className="input" type="number" min={0} value={buy} onChange={(e) => setBuy(e.target.value)} />
                  </label>
                  <label>
                    {t("reorder")}
                    <input
                      className="input"
                      type="number"
                      min={0}
                      value={reorder}
                      onChange={(e) => setReorder(e.target.value)}
                    />
                  </label>
                </>
              ) : null}
              {tab === "services" ? (
                <label>
                  {t("price")} ({t("mmk")})
                  <input
                    ref={bulkFirstRef}
                    className="input"
                    type="number"
                    min={0}
                    value={svcPrice}
                    onChange={(e) => setSvcPrice(e.target.value)}
                    required
                  />
                </label>
              ) : null}
              {tab === "doctors" ? (
                <>
                  <label>
                    {t("consultFee")} ({t("mmk")})
                    <input
                      ref={bulkFirstRef}
                      className="input"
                      type="number"
                      min={0}
                      value={consult}
                      onChange={(e) => setConsult(e.target.value)}
                    />
                  </label>
                  <label>
                    {t("otFee")} ({t("mmk")})
                    <input
                      className="input"
                      type="number"
                      min={0}
                      value={otFee}
                      onChange={(e) => setOtFee(e.target.value)}
                    />
                  </label>
                </>
              ) : null}
              <label>
                {t("reason")}
                <input
                  className="input"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  required
                />
              </label>
              <label>
                {t("typeUpdate")}
                <input
                  className="input"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="UPDATE"
                  autoComplete="off"
                  required
                />
              </label>
              <div className="page-actions">
                <button type="button" className="btn ghost" onClick={() => setBulkOpen(false)}>
                  {t("close")}
                </button>
                <button type="submit" className="btn danger" disabled={busy}>
                  {busy ? t("busy") : t("applyBulk")}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
