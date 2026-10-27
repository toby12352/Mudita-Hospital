import type { Ref } from "react";
import type { PatientChart } from "@/features/patients/api";
import { PatientChartTypeahead } from "@/features/patients/PatientChartTypeahead";
import type { PharmacyBillLine, PharmacyItem } from "@/features/pharmacy/api";
import {
  formatPackCompact,
  formatPackPreview,
  packFromItem,
  pharmacyLineSaleView,
  saleUnitsFromPack,
} from "@/features/pharmacy/api";
import { useClinicActions } from "@/app/clinicActions";
import { ActionIcon } from "@/shared/ActionIcon";
import { AlertDialog } from "@/shared/AlertDialog";
import { BillLineGrid, createBillLineEntry } from "@/shared/BillLineGrid";
import {
  BillChargeToIpdButton,
  BillCollectNote,
  BillMarkPaidButton,
  BillPrintButton,
  moneyStatusLabel,
} from "@/shared/BillPayPrint";
import { BillTotals } from "@/shared/BillTotals";
import { discountKyats, type DiscountUnit } from "@/shared/discount";
import { formatMMK } from "@/shared/format";
import { useI18n } from "@/shared/i18n";

export type PharmacyBillLineView = PharmacyBillLine;

type Props = {
  billId: number | null;
  billNo: string;
  billStatus: string;
  printedAt: string | null;
  collectedCash?: number | null;
  chargedSales?: { id: number; bill_no: string }[];
  returnSaleId?: number | null;
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
  discountValue: string;
  discountUnit: DiscountUnit;
  onDiscountValue: (value: string) => void;
  onDiscountUnit: (unit: DiscountUnit) => void;
  /** Desk mode: sales, customer return-in, or transfer to the OT cupboard. */
  kind?: "sale" | "return" | "transfer";
  /** Transfer desk: Transfer was pressed and Confirm transfer is showing. */
  awaitingConfirm?: boolean;
  /** Transfer desk: confirm succeeded; show success overlay. */
  transferDone?: boolean;
  onDismissError: () => void;
  onDismissTransferDone?: () => void;
  onPatientName: (v: string) => void;
  onPickPatient: (patient: PatientChart) => void;
  patientNameRef?: Ref<HTMLInputElement>;
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
  onMarkPaid: () => void;
  onChargeToIpd?: () => void;
  onCreditToIpd?: () => void;
  onReturnSaleId?: (id: number) => void;
  onTransfer?: () => void;
  onConfirmTransfer?: () => void;
  onConfirm: () => void;
  onHistory: () => void;
  onDelete: () => void;
  onPurge?: () => void;
  onCancel: () => void;
  onNewBill: () => void;
};

export function PharmacyBillForm(props: Props) {
  const { t } = useI18n();
  const {
    billId,
    billNo,
    billStatus,
    printedAt,
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
    discountValue,
    discountUnit,
    kind = "sale",
    awaitingConfirm = false,
    transferDone = false,
  } = props;
  const { pharmacyCreate, pharmacyDelete, billPurge } = useClinicActions();
  const writable = isDraft && pharmacyCreate;

  const isReturn = kind === "return";
  const isTransfer = kind === "transfer";
  const total = lines.reduce((s, l) => s + l.line_total_mmk, 0);
  const net = isTransfer
    ? total
    : Math.max(0, total - discountKyats(total, discountValue, discountUnit));
  const paid = billStatus === "paid" ? net : 0;
  const balance = billStatus === "paid" ? 0 : net;
  return (
    <section className="opd-bill-desk">
      <div className="opd-bill-desk-main">
        <h2 className="opd-bill-desk-title">
          {isTransfer ? t("pharmacyTransferToOt") : isReturn ? t("pharmacyReturnIn") : t("pharmacyBilling")}
        </h2>

        <div className="opd-bill-header">
          <div className="opd-bill-header-col">
            <div className="opd-bill-field">
              <span className="opd-bill-label">{t("vouNo")}</span>
              <span className="opd-bill-readonly">{billNo || "—"}</span>
            </div>
            <div className="opd-bill-field">
              <span className="opd-bill-label">
                {isTransfer ? t("destination") : t("payType")}
              </span>
              <span className="opd-bill-readonly">
                {isTransfer ? t("transferDestination") : t("payTypeCash")}
              </span>
            </div>
            {isTransfer ? null : (
            <div className="opd-bill-field opd-bill-field--typeahead">
              <span className="opd-bill-label">{t("patientName")}</span>
              <PatientChartTypeahead
                value={patientName}
                disabled={!writable}
                inputRef={props.patientNameRef}
                onChange={props.onPatientName}
                onPick={props.onPickPatient}
              />
            </div>
            )}
            {isTransfer ? null : (
            <label className="opd-bill-field">
              <span className="opd-bill-label">{t("phone")}</span>
              <input
                className="opd-bill-input"
                value={patientPhone}
                disabled={!writable}
                onChange={(e) => props.onPatientPhone(e.target.value)}
              />
            </label>
            )}
            {isTransfer ? null : (
            <label className="opd-bill-field">
              <span className="opd-bill-label">{t("age")}</span>
              <span className="opd-bill-control">
                <input
                  className="opd-bill-input opd-bill-input--narrow"
                  value={patientAge}
                  disabled={!writable}
                  inputMode="numeric"
                  onChange={(e) => props.onPatientAge(e.target.value)}
                />
                <span className="opd-bill-unit">{t("ageYearsShort")}</span>
              </span>
            </label>
            )}
            {isTransfer ? null : (
            <label className="opd-bill-field">
              <span className="opd-bill-label">{t("gender")}</span>
              <select
                className="opd-bill-input"
                value={patientGender}
                disabled={!writable}
                onChange={(e) => props.onPatientGender(e.target.value)}
              >
                <option value="">—</option>
                <option value="M">{t("genderM")}</option>
                <option value="F">{t("genderF")}</option>
                <option value="Other">{t("genderOther")}</option>
              </select>
            </label>
            )}
            <label className="opd-bill-field">
              <span className="opd-bill-label">{t("remark")}</span>
              <input
                className="opd-bill-input grow"
                data-focus={isTransfer ? "bill-patient" : undefined}
                value={description}
                disabled={!writable}
                onChange={(e) => props.onDescription(e.target.value)}
                autoFocus={isTransfer}
                aria-label={t("remark")}
              />
            </label>
          </div>

          <div className="opd-bill-header-col">
            <div className="opd-bill-field">
              <span className="opd-bill-label">{t("dateTime")}</span>
              <span className="opd-bill-readonly">{displayWhen}</span>
            </div>
            <div className="opd-bill-field">
              <span className="opd-bill-label">{t("status")}</span>
              <span className="opd-bill-readonly">
                {isTransfer && billStatus === "paid"
                  ? t("transferred")
                  : moneyStatusLabel(billStatus || "draft", t, printedAt, props.collectedCash)}
              </span>
            </div>
          </div>
        </div>

        <BillLineGrid
          draft={writable}
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
              {
                showUnitColumn: true,
                showPackColumn: true,
                sourceLabel: t("pharmacyStock"),
                sourceIcon: "box",
              },
            ),
          ]}
        />

        <div className="opd-bill-footer">
          <div className="opd-bill-footer-left">
            {!billId ? <span className="opd-bill-new-badge">{t("newBadge")}</span> : null}
          </div>
          {isTransfer ? (
            <div className="opd-bill-totals">
              <div className="opd-bill-total-row">
                <span>{t("totalLabel")}</span>
                <span>{formatMMK(total)}</span>
              </div>
              <p className="opd-bill-collect-note">
                {awaitingConfirm ? t("transferArmedNote") : t("transferConfirmNote")}
              </p>
            </div>
          ) : (
            <BillTotals
              total={total}
              paid={paid}
              balance={balance}
              discountValue={discountValue}
              discountUnit={discountUnit}
              editable={writable}
              onDiscountValue={props.onDiscountValue}
              onDiscountUnit={props.onDiscountUnit}
              note={
                <BillCollectNote
                  status={billStatus || "draft"}
                  balance={balance}
                  sideEffect={isReturn ? "pharmacy_return" : "pharmacy"}
                />
              }
            />
          )}
        </div>

        {okMsg ? <p className="form-ok">{okMsg}</p> : null}
      </div>

      <aside className="opd-bill-rail" aria-label={t("billActions")}>
        {pharmacyCreate && isTransfer ? (
          <>
            <button
              type="button"
              className={`opd-bill-rail-btn${isDraft && !awaitingConfirm ? " opd-bill-rail-btn--accent" : ""}`}
              disabled={busy || !isDraft || awaitingConfirm}
              onClick={props.onTransfer}
            >
              <span className="opd-bill-rail-btn-main">
                <ActionIcon name="transfer" />
                <span className="opd-bill-rail-btn-text">
                  <span className="opd-bill-rail-btn-label">{t("transferAction")}</span>
                  <span className="opd-bill-rail-btn-sub">{t("transferCheckLines")}</span>
                </span>
              </span>
              {awaitingConfirm ? null : <kbd>F7</kbd>}
            </button>
            {awaitingConfirm && isDraft ? (
              <button
                type="button"
                className="opd-bill-rail-btn opd-bill-rail-btn--accent"
                disabled={busy}
                onClick={props.onConfirmTransfer}
              >
                <span className="opd-bill-rail-btn-main">
                  <ActionIcon name="transfer" />
                  <span className="opd-bill-rail-btn-text">
                    <span className="opd-bill-rail-btn-label">{t("confirmTransfer")}</span>
                    <span className="opd-bill-rail-btn-sub">{t("movesToOtCupboard")}</span>
                  </span>
                </span>
                <kbd>F7</kbd>
              </button>
            ) : null}
          </>
        ) : (
          <>
            {pharmacyCreate ? (
              <BillMarkPaidButton
                status={billStatus || "draft"}
                busy={busy}
                onClick={props.onMarkPaid}
                collectLabel={isReturn ? t("markReturned") : undefined}
                collectSubLabel={isReturn ? t("marksReturned") : undefined}
              />
            ) : null}
            {pharmacyCreate && props.onChargeToIpd ? (
              <BillChargeToIpdButton busy={busy} onClick={props.onChargeToIpd} />
            ) : null}
            {pharmacyCreate && props.onCreditToIpd ? (
              <>
                {props.chargedSales && props.chargedSales.length > 1 ? (
                  <label className="field">
                    <span>{t("returnAgainstSale")}</span>
                    <select
                      className="opd-bill-input"
                      value={props.returnSaleId ?? ""}
                      disabled={busy}
                      onChange={(e) => props.onReturnSaleId?.(Number(e.target.value))}
                    >
                      {props.chargedSales.map((sale) => (
                        <option key={sale.id} value={sale.id}>
                          {sale.bill_no}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <BillChargeToIpdButton
                  busy={busy}
                  onClick={props.onCreditToIpd}
                  label={t("creditToIpd")}
                  subLabel={t("creditToIpdSub")}
                />
              </>
            ) : null}
            <BillPrintButton status={billStatus || "draft"} busy={busy} onClick={props.onPrint} />
          </>
        )}
        {pharmacyCreate ? (
          <button
            type="button"
            className="opd-bill-rail-btn"
            disabled={busy || !isDraft}
            onClick={props.onConfirm}
          >
            <span className="opd-bill-rail-btn-main">
              <ActionIcon name="check" />
              <span>{t("saveDraft")}</span>
            </span>
            <kbd>F5</kbd>
          </button>
        ) : null}
        <button type="button" className="opd-bill-rail-btn" disabled={busy} onClick={props.onHistory}>
          <span className="opd-bill-rail-btn-main">
            <ActionIcon name="history" />
            <span>{t("history")}</span>
          </span>
          <kbd>F9</kbd>
        </button>
        {pharmacyDelete ? (
          <button
            type="button"
            className="opd-bill-rail-btn opd-bill-rail-btn--danger"
            disabled={busy}
            onClick={props.onDelete}
          >
            <span className="opd-bill-rail-btn-main">
              <ActionIcon name="trash" />
              <span>{t("vDelete")}</span>
            </span>
            <kbd>^F8</kbd>
          </button>
        ) : null}
        {billPurge && props.onPurge ? (
          <button
            type="button"
            className="opd-bill-rail-btn opd-bill-rail-btn--danger"
            disabled={busy}
            onClick={props.onPurge}
          >
            <span className="opd-bill-rail-btn-main">
              <ActionIcon name="trash" />
              <span>{t("delete")}</span>
            </span>
          </button>
        ) : null}
        <button type="button" className="opd-bill-rail-btn" disabled={busy} onClick={props.onCancel}>
          <span>{t("cancel")}</span>
          <kbd>F10</kbd>
        </button>
        {pharmacyCreate ? (
        <button
          type="button"
          className={`opd-bill-rail-btn${!isDraft ? " opd-bill-rail-btn--accent" : ""}`}
          disabled={busy}
          onClick={props.onNewBill}
        >
          <span className="opd-bill-rail-btn-main">
            <ActionIcon name="plus" />
            <span>{isTransfer ? t("newTransfer") : isReturn ? t("newReturn") : t("newBill")}</span>
          </span>
          <kbd>F2</kbd>
        </button>
        ) : null}
      </aside>

      <AlertDialog message={error ?? ""} onClose={props.onDismissError} />
      {transferDone ? (
        <AlertDialog
          tone="success"
          message={t("itemsTransferredToOt")}
          onClose={props.onDismissTransferDone ?? (() => undefined)}
        />
      ) : null}
    </section>
  );
}
