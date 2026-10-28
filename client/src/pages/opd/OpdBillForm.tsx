import { useEffect, useRef, type Ref } from "react";
import type { PatientChart } from "@/features/patients/api";
import { PatientChartTypeahead } from "@/features/patients/PatientChartTypeahead";
import type { OpdBillLine, OpdDoctor, OpdService } from "@/features/opd/api";
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
import { revealField } from "@/shared/FieldError";
import { formatMMK } from "@/shared/format";
import { Typeahead } from "@/shared/Typeahead";
import { useI18n } from "@/shared/i18n";

type Props = {
  billId: number | null;
  billNo: string;
  billStatus: string;
  printedAt: string | null;
  collectedCash?: number | null;
  patientId: number | null;
  patientName: string;
  patientPhone: string;
  patientAge: string;
  patientGender: string;
  doctorId: string;
  doctorName: string;
  description: string;
  lines: OpdBillLine[];
  doctors: OpdDoctor[];
  displayWhen: string;
  busy: boolean;
  error: string | null;
  okMsg: string | null;
  isDraft: boolean;
  discountValue: string;
  discountUnit: DiscountUnit;
  onDiscountValue: (value: string) => void;
  onDiscountUnit: (unit: DiscountUnit) => void;
  onDismissError: () => void;
  onPatientName: (v: string) => void;
  onPickPatient: (patient: PatientChart) => void;
  patientNameRef?: Ref<HTMLInputElement>;
  onPatientPhone: (v: string) => void;
  onPatientAge: (v: string) => void;
  onPatientGender: (v: string) => void;
  onDoctorName: (v: string) => void;
  onClearDoctorId: () => void;
  onPickDoctor: (d: OpdDoctor) => void;
  onDescription: (v: string) => void;
  onCommitService: (s: OpdService, qty: number) => void;
  onLookupService: (code: string) => Promise<OpdService | null>;
  onAddConsultation: () => void;
  loadServiceSuggestions: (term: string) => Promise<OpdService[]>;
  onCommitLineQty: (index: number, qty: number) => void;
  onRemoveLine: (index: number) => void;
  onPrint: () => void;
  onMarkPaid: () => void;
  onChargeToIpd?: () => void;
  onConfirm: () => void;
  onHistory: () => void;
  onDelete: () => void;
  onPurge?: () => void;
  onCancel: () => void;
  onNewBill: () => void;
};

export function OpdBillForm(props: Props) {
  const { t } = useI18n();
  const {
    billId,
    billNo,
    billStatus,
    printedAt,
    patientId,
    patientName,
    patientPhone,
    patientAge,
    patientGender,
    doctorId,
    doctorName,
    description,
    lines,
    doctors,
    displayWhen,
    busy,
    error,
    okMsg,
    isDraft,
    discountValue,
    discountUnit,
  } = props;
  const { opdCreate, opdDelete } = useClinicActions();
  const writable = isDraft && opdCreate;
  const okMsgRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (okMsg?.trim()) revealField(okMsgRef.current);
  }, [okMsg]);

  const total = lines.reduce((s, l) => s + l.qty * l.unit_price_mmk, 0);
  const net = Math.max(0, total - discountKyats(total, discountValue, discountUnit));
  const paid = billStatus === "paid" ? net : 0;
  const balance = billStatus === "paid" ? 0 : net;
  const idName =
    patientId != null
      ? `${patientId} / ${patientName}`
      : billNo
        ? `${billNo} / ${patientName}`
        : patientName;

  return (
    <section className="opd-bill-desk">
      <div className="opd-bill-desk-main">
        <h2 className="opd-bill-desk-title">{t("opdBillTitle")}</h2>

        <div className="opd-bill-header">
          <div className="opd-bill-header-col">
            <div className="opd-bill-field opd-bill-field--typeahead">
              <span className="opd-bill-label">{t("idName")}</span>
              {writable ? (
                <PatientChartTypeahead
                  value={patientName}
                  inputRef={props.patientNameRef}
                  onChange={props.onPatientName}
                  onPick={props.onPickPatient}
                />
              ) : (
                <input
                  className="opd-bill-input"
                  data-focus="bill-patient"
                  value={idName}
                  disabled
                  aria-label={t("patientName")}
                />
              )}
            </div>
            <label className="opd-bill-field">
              <span className="opd-bill-label">{t("phone")}</span>
              <input
                className="opd-bill-input"
                value={patientPhone}
                disabled={!writable}
                onChange={(e) => props.onPatientPhone(e.target.value)}
              />
            </label>
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
            <div className="opd-bill-field opd-bill-field--typeahead">
              <span className="opd-bill-label">{t("doctor")}</span>
              <div className="opd-bill-control">
                <Typeahead
                  value={doctorName}
                  disabled={!writable}
                  placeholder={t("doctorPlaceholder")}
                  onChange={(v) => {
                    props.onDoctorName(v);
                    props.onClearDoctorId();
                  }}
                  loadSuggestions={async (term) => {
                    const q = term.trim().toLowerCase();
                    if (!q) return doctors.slice(0, 8);
                    return doctors
                      .filter(
                        (d) =>
                          d.name.toLowerCase().includes(q) ||
                          (d.specialty || "").toLowerCase().includes(q),
                      )
                      .slice(0, 8);
                  }}
                  getKey={(d) => d.id}
                  renderOption={(d) => (
                    <>
                      <span className="typeahead-title">{d.name}</span>
                      <span className="typeahead-sub">
                        {d.specialty || t("general")} · {t("consultAbbrev")}{" "}
                        {formatMMK(d.consultation_mmk)} {t("mmk")}
                      </span>
                    </>
                  )}
                  onPick={props.onPickDoctor}
                />
                {writable ? (
                  <button
                    type="button"
                    className="btn action opd-bill-consult"
                    onClick={props.onAddConsultation}
                    disabled={!doctorId}
                  >
                    <ActionIcon name="plus" />
                    {t("addConsultation")}
                  </button>
                ) : null}
              </div>
            </div>
            <label className="opd-bill-field">
              <span className="opd-bill-label">{t("remark")}</span>
              <input
                className="opd-bill-input grow"
                value={description}
                disabled={!writable}
                onChange={(e) => props.onDescription(e.target.value)}
              />
            </label>
          </div>

          <div className="opd-bill-header-col">
            <div className="opd-bill-field">
              <span className="opd-bill-label">{t("dateTime")}</span>
              <span className="opd-bill-readonly">{displayWhen}</span>
            </div>
            <div className="opd-bill-field">
              <span className="opd-bill-label">{t("vouNo")}</span>
              <span className="opd-bill-readonly">{billNo || "—"}</span>
            </div>
            <div className="opd-bill-field">
              <span className="opd-bill-label">{t("currency")}</span>
              <span className="opd-bill-readonly">{t("kyats")}</span>
            </div>
            <div className="opd-bill-field">
              <span className="opd-bill-label">{t("opdNo")}</span>
              <span className="opd-bill-readonly">{billNo || "—"}</span>
            </div>
            <div className="opd-bill-field">
              <span className="opd-bill-label">{t("status")}</span>
              <span className="opd-bill-readonly">
                {moneyStatusLabel(billStatus || "draft", t, printedAt, props.collectedCash)}
              </span>
            </div>
          </div>
        </div>

        <BillLineGrid
          draft={writable}
          itemHeader={t("particular")}
          priceHeader={t("fees")}
          emptyLabel={t("noLinesYet")}
          rows={lines.map((l, i) => ({
            key: `${l.line_type}-${l.code}-${i}`,
            title: l.code ? `${l.code} — ${l.description}` : l.description,
            qty: l.qty,
            priceMmk: l.unit_price_mmk,
            amountMmk: l.qty * l.unit_price_mmk,
            locked: l.line_type === "consultation",
            removable: true,
          }))}
          onQtyCommit={props.onCommitLineQty}
          onRemove={props.onRemoveLine}
          entries={[
            createBillLineEntry<OpdService>(
              {
                key: "service",
                placeholder: t("servicePlaceholder"),
                ariaLabel: t("particular"),
                loadSuggestions: props.loadServiceSuggestions,
                getKey: (s) => s.id,
                itemTitle: (s) => (s.code ? `${s.code} — ${s.name}` : s.name),
                renderOption: (s) => (
                  <>
                    <span className="typeahead-title">
                      {s.code ? `${s.code} — ${s.name}` : s.name}
                    </span>
                    <span className="typeahead-sub">
                      {t("serviceType")} · {formatMMK(s.price_mmk)} {t("mmk")}
                    </span>
                  </>
                ),
                unitsFor: () => [],
                onCommit: (s, qty) => props.onCommitService(s, qty),
                onSubmitCode: props.onLookupService,
              },
              {
                showUnitColumn: false,
                sourceLabel: t("opdServices"),
                sourceIcon: "clipboard",
              },
            ),
          ]}
        />

        <div className="opd-bill-footer">
          <div className="opd-bill-footer-left">
            <span className="opd-bill-service-count">
              {t("serviceCount")}: {lines.length}
            </span>
            {!billId ? <span className="opd-bill-new-badge">{t("newBadge")}</span> : null}
          </div>
          <BillTotals
            total={total}
            paid={paid}
            balance={balance}
            discountValue={discountValue}
            discountUnit={discountUnit}
            editable={writable}
            onDiscountValue={props.onDiscountValue}
            onDiscountUnit={props.onDiscountUnit}
            note={<BillCollectNote status={billStatus || "draft"} balance={balance} />}
          />
        </div>

        {okMsg ? (
          <p ref={okMsgRef} className="form-ok" role="status">
            {okMsg}
          </p>
        ) : null}
      </div>

      <aside className="opd-bill-rail" aria-label={t("billActions")}>
        {opdCreate ? (
          <BillMarkPaidButton
            status={billStatus || "draft"}
            busy={busy}
            onClick={props.onMarkPaid}
          />
        ) : null}
        {opdCreate && props.onChargeToIpd ? (
          <BillChargeToIpdButton busy={busy} onClick={props.onChargeToIpd} />
        ) : null}
        <BillPrintButton status={billStatus || "draft"} busy={busy} onClick={props.onPrint} />
        {opdCreate ? (
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
        {opdDelete ? (
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
        {props.onPurge ? (
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
        {opdCreate ? (
        <button
          type="button"
          className={`opd-bill-rail-btn${!isDraft ? " opd-bill-rail-btn--accent" : ""}`}
          disabled={busy}
          onClick={props.onNewBill}
        >
          <span className="opd-bill-rail-btn-main">
            <ActionIcon name="plus" />
            <span>{t("newBill")}</span>
          </span>
          <kbd>F2</kbd>
        </button>
        ) : null}
      </aside>

      <AlertDialog message={error ?? ""} onClose={props.onDismissError} />
    </section>
  );
}
