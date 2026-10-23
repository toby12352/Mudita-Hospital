import type { OpdBillLine, OpdDoctor, OpdService } from "@/features/opd/api";
import { BillLineGrid, createBillLineEntry } from "@/shared/BillLineGrid";
import { formatMMK } from "@/shared/format";
import { Typeahead } from "@/shared/Typeahead";
import { useI18n } from "@/shared/i18n";

type Props = {
  billId: number | null;
  billNo: string;
  billStatus: string;
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
  onPatientName: (v: string) => void;
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
  onConfirm: () => void;
  onHistory: () => void;
  onDelete: () => void;
  onCancel: () => void;
};

export function OpdBillForm(props: Props) {
  const { t } = useI18n();
  const {
    billId,
    billNo,
    billStatus,
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
  } = props;

  const total = lines.reduce((s, l) => s + l.qty * l.unit_price_mmk, 0);
  const paid = billStatus === "paid" ? total : 0;
  const balance = billStatus === "paid" ? 0 : total;
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
            <label className="opd-bill-field">
              <span className="opd-bill-label">{t("idName")}</span>
              <input
                className="opd-bill-input grow"
                value={isDraft ? patientName : idName}
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
            <div className="opd-bill-field opd-bill-field--typeahead">
              <span className="opd-bill-label">{t("doctor")}</span>
              <Typeahead
                value={doctorName}
                disabled={!isDraft}
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
              {isDraft ? (
                <button
                  type="button"
                  className="btn ghost opd-bill-consult"
                  onClick={props.onAddConsultation}
                  disabled={!doctorId}
                >
                  {t("addConsultation")}
                </button>
              ) : null}
            </div>
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
                itemTitle: (s) => `${s.code} — ${s.name}`,
                renderOption: (s) => (
                  <>
                    <span className="typeahead-title">
                      {s.code} — {s.name}
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
              { showUnitColumn: false },
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
