import { FormEvent, useEffect, useState } from "react";
import {
  fetchHospitalSettings,
  saveHospitalSettings,
  type HospitalSettings,
} from "@/features/settings/masterData";
import { useI18n } from "@/shared/i18n";

function formatPhones(phone: string, phone2: string): string {
  return [phone, phone2].map((p) => p.trim()).filter(Boolean).join(" / ");
}

export function HospitalTab() {
  const { t } = useI18n();
  const [form, setForm] = useState<HospitalSettings>({
    hospital_name: "",
    address: "",
    phone: "",
    phone2: "",
    logo_path: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchHospitalSettings();
        if (!cancelled) setForm(data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Load failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const data = await saveHospitalSettings({
        hospital_name: form.hospital_name.trim(),
        address: form.address.trim(),
        phone: form.phone.trim(),
        phone2: form.phone2.trim(),
        logo_path: form.logo_path.trim(),
      });
      setForm(data);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  const phonesPreview = formatPhones(form.phone, form.phone2);

  return (
    <div className="settings-split">
      <form className="card-form" onSubmit={(e) => void submit(e)}>
        <h2 className="section-title">{t("billHeader")}</h2>
        <label className="field">
          <span>{t("hospitalName")}</span>
          <input
            value={form.hospital_name}
            onChange={(e) => setForm({ ...form, hospital_name: e.target.value })}
            required
            disabled={busy}
          />
        </label>
        <label className="field">
          <span>{t("address")}</span>
          <input
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            disabled={busy}
          />
        </label>
        <label className="field">
          <span>{t("phone1")}</span>
          <input
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            disabled={busy}
          />
        </label>
        <label className="field">
          <span>{t("phone2")}</span>
          <input
            value={form.phone2}
            onChange={(e) => setForm({ ...form, phone2: e.target.value })}
            disabled={busy}
          />
        </label>
        <label className="field">
          <span>{t("logoPath")}</span>
          <input
            value={form.logo_path}
            onChange={(e) => setForm({ ...form, logo_path: e.target.value })}
            placeholder="C:\Mudita\logo.png"
            disabled={busy}
          />
        </label>
        {error ? <p className="form-error">{error}</p> : null}
        {saved ? <p className="form-ok">{t("saved")}</p> : null}
        <button type="submit" className="btn primary" disabled={busy}>
          {busy ? t("saving") : t("saveHospital")}
        </button>
      </form>
      <aside className="bill-preview" aria-label="Bill header preview">
        <p className="preview-label">{t("preview")}</p>
        <p className="preview-name">{form.hospital_name || t("hospitalName")}</p>
        {form.address ? <p className="preview-line">{form.address}</p> : null}
        {phonesPreview ? (
          <p className="preview-line">
            {t("tel")}: {phonesPreview}
          </p>
        ) : null}
        {form.logo_path ? <p className="preview-meta">Logo: {form.logo_path}</p> : null}
      </aside>
    </div>
  );
}
