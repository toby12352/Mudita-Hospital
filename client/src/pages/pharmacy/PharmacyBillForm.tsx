import type { PharmacyBillLine, PharmacyItem } from "@/features/pharmacy/api";
import {
  formatPackCompact,
  formatPackPreview,
  packFromItem,
  pharmacyLineSaleView,
  saleUnitsFromPack,
} from "@/features/pharmacy/api";
import { BillLineGrid, createBillLineEntry } from "@/shared/BillLineGrid";
import { formatMMK } from "@/shared/format";
import { useI18n } from "@/shared/i18n";

export type PharmacyBillLineView = PharmacyBillLine;

type Props = {
  billId: number | null;
  billNo: string;
  billStatus: string;
  patientName: string;
  patientPhone: string;
  patientAge: string;
  patientGender: string;
  description: string;
  lines: PharmacyBillLineView[];
  displayWhen: string;
  busy: boolean;
  error: string | null;
  okMsg: string | null;
  isDraft: boolean;
  onPatientName: (v: string) => void;
  onPatientPhone: (v: string) => void;
  onPatientAge: (v: string) => void;
  onPatientGender: (v: string) => void;
  onDescription: (v: string) => void;
  onCommitItem: (item: PharmacyItem, qty: number, unitId: string | null) => void;
  onLookupItem: (code: string) => Promise<PharmacyItem | null>;
  loadItemSuggestions: (term: string) => Promise<PharmacyItem[]>;
  onCommitLineQty: (index: number, qty: number) => boolean | void;
  onUnitChange: (index: number, unitId: string) => void;
  onRemoveLine: (index: number) => void;
  onPrint: () => void;
  onConfirm: () => void;
  onHistory: () => void;
  onDelete: () => void;
  onCancel: () => void;
};

export function PharmacyBillForm(props: Props) {
  const { t } = useI18n();
  const {
    billId,
    billNo,
    billStatus,
    patientName,
    patientPhone,
    patientAge,
    patientGender,
    description,
    lines,
    displayWhen,
    busy,
    error,
    okMsg,
    isDraft,
  } = props;

  const total = lines.reduce((s, l) => s + l.line_total_mmk, 0);
  const paid = billStatus === "paid" ? total : 0;
  const balance = billStatus === "paid" ? 0 : total;
  return (
    <section className="opd-bill-desk">
      <div className="opd-bill-desk-main">
        <h2 className="opd-bill-desk-title">{t("pharmacyBilling")}</h2>

        <div className="opd-bill-header">
          <div className="opd-bill-header-col">
            <div className="opd-bill-field">
              <span className="opd-bill-label">{t("vouNo")}</span>
              <span className="opd-bill-readonly">{billNo || "—"}</span>
            </div>
            <div className="opd-bill-field">
              <span className="opd-bill-label">{t("payType")}</span>
              <span className="opd-bill-readonly">{t("payTypeCash")}</span>
            </div>
            <label className="opd-bill-field">
              <span className="opd-bill-label">{t("patientName")}</span>
              <input
                className="opd-bill-input grow"
                value={patientName}
                disabled={!isDraft}
                onChange={(e) => props.onPatientName(e.target.value)}
                autoFocus
                aria-label={t("patientName")}
              />
            </label>
            <label className="opd-bill-field">
              <span className="opd-bill-label">{t("phone")}</span>
              <input
                className="opd-bill-input"
                value={patientPhone}
                disabled={!isDraft}
                onChange={(e) => props.onPatientPhone(e.target.value)}
              />
            </label>
            <label className="opd-bill-field">
              <span className="opd-bill-label">{t("age")}</span>
              <input
                className="opd-bill-input opd-bill-input--narrow"
                value={patientAge}
                disabled={!isDraft}
                inputMode="numeric"
                onChange={(e) => props.onPatientAge(e.target.value)}
              />
              <span className="opd-bill-unit">{t("ageYearsShort")}</span>
            </label>
            <label className="opd-bill-field">
              <span className="opd-bill-label">{t("gender")}</span>
              <select
                className="opd-bill-input"
                value={patientGender}
                disabled={!isDraft}
                onChange={(e) => props.onPatientGender(e.target.value)}
              >
                <option value="">—</option>
                <option value="M">{t("genderM")}</option>
                <option value="F">{t("genderF")}</option>
                <option value="Other">{t("genderOther")}</option>
              </select>
            </label>
            <label className="opd-bill-field">
              <span className="opd-bill-label">{t("remark")}</span>
              <input
                className="opd-bill-input grow"
                value={description}
                disabled={!isDraft}
                onChange={(e) => props.onDescription(e.target.value)}
              />
            </label>
          </div>

          <div className="opd-bill-header-col">
            <div className="opd-bill-field">
              <span className="opd-bill-label">{t("dateTime")}</span>
              <span className="opd-bill-readonly">{displayWhen}</span>
            </div>
            {billStatus && billStatus !== "draft" ? (
              <div className="opd-bill-field">
                <span className="opd-bill-label">{t("status")}</span>
                <span className="opd-bill-readonly">{billStatus.toUpperCase()}</span>
              </div>
            ) : null}
          </div>
        </div>

        <BillLineGrid
          draft={isDraft}
          showUnitColumn
          showPackColumn
          itemHeader={`${t("code")} — ${t("description")}`}
          priceHeader={t("price")}
          emptyLabel={t("noLinesYet")}
          rows={lines.map((l, i) => {
            const view = pharmacyLineSaleView(l);
            const pack = packFromItem(l);
            return {
              key: `${l.item_id}-${l.sort_order}-${i}`,
              title: l.code ? `${l.code} — ${l.description}` : l.description,
              packLabel: formatPackCompact(pack),
              packTitle: formatPackPreview(pack),
              qty: view.qty,
              unitId: view.unitId ?? (view.locked ? l.billing_unit : null),
              units: view.units.map((u) => ({ id: u.id, label: u.label })),
              priceMmk: view.priceMmk,
              amountMmk: l.line_total_mmk,
              locked: view.locked,
              removable: true,
            };
          })}
          onQtyCommit={props.onCommitLineQty}
          onUnitChange={props.onUnitChange}
          onRemove={props.onRemoveLine}
          entries={[
            createBillLineEntry<PharmacyItem>(
              {
                key: "medicine",
                placeholder: t("medicinePlaceholder"),
                ariaLabel: t("medicineLabel"),
                loadSuggestions: props.loadItemSuggestions,
                getKey: (item) => item.id,
                itemTitle: (item) => {
                  const dosage = (item.dosage || "").trim();
                  return `${item.code} — ${item.name}${dosage ? ` (${dosage})` : ""}`;
                },
                renderOption: (item) => {
                  const dosage = (item.dosage || "").trim();
                  const l3 = item.pack_l3_unit || item.billing_unit;
                  return (
                    <>
                      <span className="typeahead-title">
                        {item.code} — {item.name}
                        {dosage ? ` (${dosage})` : ""}
                      </span>
                      <span className="typeahead-sub">
                        {t("inStock")} {item.stock_main} {l3} · {formatMMK(item.sell_price_mmk)}{" "}
                        {t("mmk")}/{l3}
                      </span>
                    </>
                  );
                },
                packFor: (item) => formatPackCompact(packFromItem(item)),
                packTitleFor: (item) => formatPackPreview(packFromItem(item)),
                unitsFor: (item) =>
                  saleUnitsFromPack(packFromItem(item), item.sell_price_mmk).map((u) => ({
                    id: u.id,
                    label: u.label,
                  })),
                onCommit: (item, qty, unit) => props.onCommitItem(item, qty, unit?.id ?? null),
                onSubmitCode: props.onLookupItem,
              },
              { showUnitColumn: true, showPackColumn: true },
            ),
          ]}
        />

        <div className="opd-bill-footer">
          <div className="opd-bill-footer-left">
            {!billId ? <span className="opd-bill-new-badge">{t("newBadge")}</span> : null}
          </div>
          <div className="opd-bill-totals">
            <div className="opd-bill-total-row">
              <span>{t("totalLabel")}</span>
              <span>{formatMMK(total)}</span>
            </div>
            <div className="opd-bill-total-row">
              <span>{t("paid")}</span>
              <span>{formatMMK(paid)}</span>
            </div>
            <div className="opd-bill-total-row opd-bill-total-row--balance">
              <span>{t("balance")}</span>
              <span>{formatMMK(balance)}</span>
            </div>
          </div>
        </div>

        {error ? <p className="form-error">{error}</p> : null}
        {okMsg ? <p className="form-ok">{okMsg}</p> : null}
      </div>

      <aside className="opd-bill-rail" aria-label={t("billActions")}>
        <button
          type="button"
          className="opd-bill-rail-btn"
          disabled={busy}
          onClick={props.onPrint}
        >
          <span>{t("print")}</span>
          <kbd>F7</kbd>
        </button>
        <button
          type="button"
          className="opd-bill-rail-btn"
          disabled={busy || !isDraft}
          onClick={props.onConfirm}
        >
          <span>{t("confirm")}</span>
          <kbd>F5</kbd>
        </button>
        <button type="button" className="opd-bill-rail-btn" disabled={busy} onClick={props.onHistory}>
          <span>{t("history")}</span>
          <kbd>F9</kbd>
        </button>
        <button type="button" className="opd-bill-rail-btn" disabled={busy} onClick={props.onDelete}>
          <span>{t("vDelete")}</span>
          <kbd>^F8</kbd>
        </button>
        <button type="button" className="opd-bill-rail-btn" disabled={busy} onClick={props.onCancel}>
          <span>{t("cancel")}</span>
          <kbd>F10</kbd>
        </button>
      </aside>
    </section>
  );
}
