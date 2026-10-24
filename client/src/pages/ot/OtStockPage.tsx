import { FormEvent, Fragment, useEffect, useMemo, useState } from "react";
import { labelOtBatch, listOtStock, returnOtStock, type OtStockBatch } from "@/features/ot/api";
import {
  formatPackCompact,
  packFromItem,
  packLevelsFromItemPack,
  packPriceSlots,
  sellOuterFromSmallest,
} from "@/features/pharmacy/api";
import { ActionIcon } from "@/shared/ActionIcon";
import { DatePicker } from "@/shared/DatePicker";
import { useI18n } from "@/shared/i18n";

type CupboardItem = {
  item_id: number;
  item_code: string;
  item_name: string;
  stock_unit: string;
  dosage: string;
  buy_price_mmk: number;
  sell_price_mmk: number;
  pack_l1_qty: number;
  pack_l1_unit: string;
  pack_l2_qty: number;
  pack_l2_unit: string;
  pack_l3_qty: number;
  pack_l3_unit: string;
  ot_on_hand: number;
  batches: OtStockBatch[];
};

function groupBatches(batches: OtStockBatch[]): CupboardItem[] {
  const byId = new Map<number, CupboardItem>();
  for (const b of batches) {
    const existing = byId.get(b.item_id);
    if (existing) {
      existing.ot_on_hand += b.qty;
      existing.batches.push(b);
      continue;
    }
    byId.set(b.item_id, {
      item_id: b.item_id,
      item_code: b.item_code,
      item_name: b.item_name,
      stock_unit: b.stock_unit,
      dosage: b.dosage ?? "",
      buy_price_mmk: b.buy_price_mmk ?? 0,
      sell_price_mmk: b.sell_price_mmk ?? 0,
      pack_l1_qty: b.pack_l1_qty ?? 1,
      pack_l1_unit: b.pack_l1_unit || "Box",
      pack_l2_qty: b.pack_l2_qty ?? 1,
      pack_l2_unit: b.pack_l2_unit || "Strip",
      pack_l3_qty: b.pack_l3_qty ?? 1,
      pack_l3_unit: b.pack_l3_unit || "Tablet",
      ot_on_hand: b.qty,
      batches: [b],
    });
  }
  return Array.from(byId.values());
}

export function OtStockPage() {
  const { t } = useI18n();
  const [batches, setBatches] = useState<OtStockBatch[]>([]);
  const [filterQ, setFilterQ] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [qtyById, setQtyById] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const items = useMemo(() => groupBatches(batches), [batches]);

  const filtered = useMemo(() => {
    const q = filterQ.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (it) =>
        it.item_code.toLowerCase().includes(q) || it.item_name.toLowerCase().includes(q),
    );
  }, [items, filterQ]);

  const activeId =
    filtered.length === 0
      ? null
      : filtered.some((it) => it.item_id === selectedId)
        ? selectedId
        : filtered[0].item_id;
  const selected = filtered.find((it) => it.item_id === activeId) ?? null;

  async function reload(preferItemId?: number | null) {
    const data = await listOtStock();
    setBatches(data);
    const grouped = groupBatches(data);
    const keepId = preferItemId ?? selectedId;
    if (keepId != null && grouped.some((it) => it.item_id === keepId)) {
      setSelectedId(keepId);
      return;
    }
    setSelectedId(grouped[0]?.item_id ?? null);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await listOtStock();
        if (cancelled) return;
        setBatches(data);
        const grouped = groupBatches(data);
        setSelectedId(grouped[0]?.item_id ?? null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Load failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (activeId !== selectedId) setSelectedId(activeId);
  }, [activeId, selectedId]);

  async function onLabel(e: FormEvent, batch: OtStockBatch, batchNo: string, expiry: string) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (!batchNo.trim()) throw new Error(t("errBatchRequired"));
      if (!expiry.trim()) throw new Error(t("errExpiryRequired"));
      await labelOtBatch(batch.id, { batch_no: batchNo.trim(), expiry_date: expiry.trim() });
      setNotice(t("saved"));
      await reload(batch.item_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Label failed");
    } finally {
      setBusy(false);
    }
  }

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
      await reload(batch.item_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Return failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="drug-setup" aria-label={t("navOtCupboard")}>
      <div className="drug-setup-list-pane">
        <div className="drug-setup-title-row">
          <h2 className="drug-setup-title">{t("navOtCupboard")}</h2>
        </div>
        <p className="hint">{t("otStockHint")}</p>
        <div className="drug-setup-filter">
          <input
            className="drug-info-input"
            value={filterQ}
            onChange={(e) => setFilterQ(e.target.value)}
            placeholder={t("idCodeOrName")}
            aria-label={t("search")}
          />
        </div>
        {error && !selected ? <p className="form-error">{error}</p> : null}
        <div className="drug-setup-table" role="listbox" aria-label={t("cupboardItems")}>
          <div className="drug-setup-table-head ot-cupboard-cols">
            <span>{t("code")}</span>
            <span>{t("drugNameTrade")}</span>
            <span>{t("qty")}</span>
          </div>
          {filtered.length === 0 ? <p className="empty-row">{t("noOtStock")}</p> : null}
          {filtered.map((item) => (
            <div
              key={item.item_id}
              role="option"
              tabIndex={0}
              aria-selected={item.item_id === activeId}
              className={`drug-setup-table-row ot-cupboard-cols${
                item.item_id === activeId ? " selected" : ""
              }`}
              onClick={() => setSelectedId(item.item_id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setSelectedId(item.item_id);
                }
              }}
            >
              <span>{item.item_code}</span>
              <span>{item.item_name}</span>
              <span>
                {item.ot_on_hand.toLocaleString()}
                {item.stock_unit ? ` ${item.stock_unit}` : ""}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="drug-setup-detail-pane">
        <h3 className="drug-setup-title" style={{ fontSize: "1.1rem" }}>
          {t("drugInfo")}
        </h3>
        {notice ? <p className="form-ok">{notice}</p> : null}
        {error && selected ? <p className="form-error">{error}</p> : null}
        {selected ? (
          <>
            <div className="drug-info-field">
              <span className="drug-info-label">{t("brandName")}</span>
              <span className="drug-info-input">{selected.item_name}</span>
            </div>
            <div className="drug-info-field">
              <span className="drug-info-label">{t("dosage")}</span>
              <span className="drug-info-input">{selected.dosage.trim() || "—"}</span>
            </div>
            <div className="drug-info-field">
              <span className="drug-info-label">{t("packingSize")}</span>
              <span className="drug-info-input">
                {formatPackCompact(packFromItem(selected))}
              </span>
            </div>
            <div className="drug-info-field">
              <span className="drug-info-label">{t("otOnHand")}</span>
              <span className="drug-info-input">
                {selected.ot_on_hand.toLocaleString()}
                {selected.stock_unit ? ` ${selected.stock_unit}` : ""}
              </span>
            </div>
            {(() => {
              const pack = packFromItem(selected);
              const levels = packLevelsFromItemPack(pack);
              const slots = packPriceSlots(
                levels,
                selected.buy_price_mmk,
                sellOuterFromSmallest(pack, selected.sell_price_mmk),
              );
              return (
                <div className="drug-info-price-grid" aria-label={t("pricing")}>
                  <span />
                  <span>{t("purPrice")}</span>
                  <span>{t("salePrice")}</span>
                  {slots.map((slot) => (
                    <Fragment key={slot.unit}>
                      <span>{slot.unit}</span>
                      <span className="price-buy">{slot.buy_mmk.toLocaleString()}</span>
                      <span className="price-sell">{slot.sell_mmk.toLocaleString()}</span>
                    </Fragment>
                  ))}
                </div>
              );
            })()}

            <div className="ot-cupboard-batches" role="list" aria-label={t("batch")}>
              <div className="drug-setup-batch-head ot-cupboard-batch-head">
                <span>{t("batchNumber")}</span>
                <span>{t("qty")}</span>
                <span>{t("expiry")}</span>
                <span>{t("returnToPharmacy")}</span>
              </div>
              {selected.batches.map((batch) => (
                <div key={batch.id} className="ot-cupboard-batch-block" role="listitem">
                  <div className="drug-setup-batch-row ot-cupboard-batch-row">
                    <span>{batch.batch_no.trim() || t("none")}</span>
                    <span>{batch.qty.toLocaleString()}</span>
                    <span>{batch.expiry_date || t("none")}</span>
                    <form
                      className="ot-stock-return"
                      onSubmit={(e) => void onReturn(e, batch)}
                    >
                      <input
                        type="number"
                        min={1}
                        max={batch.qty}
                        value={qtyById[batch.id] ?? ""}
                        onChange={(e) =>
                          setQtyById((prev) => ({ ...prev, [batch.id]: e.target.value }))
                        }
                        disabled={busy}
                        required
                        aria-label={t("qtyToReturn")}
                        placeholder={t("qty")}
                      />
                      <button type="submit" className="btn action" disabled={busy}>
                        <ActionIcon name="undo" />
                        {t("returnToPharmacy")}
                      </button>
                    </form>
                  </div>
                  {!batch.batch_no.trim() || !batch.expiry_date ? (
                    <OtLabelFields
                      batchNo={batch.batch_no}
                      expiry={batch.expiry_date ?? ""}
                      busy={busy}
                      t={t}
                      onSave={(batchNo, expiry, ev) => void onLabel(ev, batch, batchNo, expiry)}
                    />
                  ) : null}
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="hint">{t("noOtStock")}</p>
        )}
      </div>
    </section>
  );
}

function OtLabelFields({
  batchNo,
  expiry,
  busy,
  t,
  onSave,
}: {
  batchNo: string;
  expiry: string;
  busy: boolean;
  t: (k: string) => string;
  onSave: (batchNo: string, expiry: string, e: FormEvent) => void;
}) {
  const [no, setNo] = useState(batchNo);
  const [exp, setExp] = useState(expiry);
  return (
    <form className="ot-stock-return ot-cupboard-label" onSubmit={(e) => onSave(no, exp, e)}>
      <label className="field field-compact">
        <span>{t("batchNumber")}</span>
        <input value={no} onChange={(e) => setNo(e.target.value)} disabled={busy} required />
      </label>
      <label className="field field-compact">
        <span>{t("expiry")}</span>
        <DatePicker value={exp} onChange={setExp} disabled={busy} />
      </label>
      <button type="submit" className="btn action" disabled={busy}>
        <ActionIcon name="check" />
        {t("saveLabel")}
      </button>
    </form>
  );
}
