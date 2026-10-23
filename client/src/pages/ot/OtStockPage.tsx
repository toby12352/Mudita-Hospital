import { FormEvent, useEffect, useState } from "react";
import { listOtStock, returnOtStock, type OtStockBatch } from "@/features/ot/api";
import { useI18n } from "@/shared/i18n";

export function OtStockPage() {
  const { t } = useI18n();
  const [batches, setBatches] = useState<OtStockBatch[]>([]);
  const [qtyById, setQtyById] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function reload() {
    setBatches(await listOtStock());
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await listOtStock();
        if (!cancelled) setBatches(data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Load failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onReturn(e: FormEvent, batch: OtStockBatch) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const qty = Number(qtyById[batch.id]);
      if (!qty || qty <= 0) throw new Error(t("qtyMustBePositive"));
      if (qty > batch.qty) throw new Error(t("qtyExceedsOt"));
      const result = await returnOtStock(batch.id, qty);
      setQtyById((prev) => ({ ...prev, [batch.id]: "" }));
      setNotice(
        `${t("returnedToPharmacy")}: ${result.qty.toLocaleString()}. ${t("otOnHand")} ${result.ot_qty.toLocaleString()}. ${t("inStock")} ${result.pharmacy_qty.toLocaleString()}.`,
      );
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Return failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="classic-list-panel">
      <h2 className="drug-setup-title">{t("navOtCupboard")}</h2>
      <p className="hint">{t("otStockHint")}</p>
      {notice ? <p className="form-ok">{notice}</p> : null}
      {error ? <p className="form-error">{error}</p> : null}
      <ul className="data-list">
        {batches.length === 0 ? <li className="empty-row">{t("noOtStock")}</li> : null}
        {batches.map((batch) => (
          <li key={batch.id}>
            <div>
              <p className="row-title">
                {batch.item_code} — {batch.item_name}
              </p>
              <p className="row-sub">
                {t("batch")} {batch.batch_no || "—"} · {t("expiry")} {batch.expiry_date || t("none")} · {t("qty")}{" "}
                {batch.qty.toLocaleString()} {batch.stock_unit}
              </p>
            </div>
            <form className="ot-stock-return" onSubmit={(e) => void onReturn(e, batch)}>
              <label className="field field-compact">
                <span>{t("qtyToReturn")}</span>
                <input
                  type="number"
                  min={1}
                  max={batch.qty}
                  value={qtyById[batch.id] ?? ""}
                  onChange={(e) => setQtyById((prev) => ({ ...prev, [batch.id]: e.target.value }))}
                  disabled={busy}
                  required
                />
              </label>
              <button type="submit" className="btn ghost" disabled={busy}>
                {t("returnToPharmacy")}
              </button>
            </form>
          </li>
        ))}
      </ul>
    </section>
  );
}
