import { useEffect, useState } from "react";
import { fetchDemoStatus, resetDemo, seedDemo, type DemoStatus } from "@/features/settings/demo";
export function TrainingTab({ t }: { t: (k: string) => string }) {
  const [status, setStatus] = useState<DemoStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function reload() {
    setStatus(await fetchDemoStatus());
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await fetchDemoStatus();
        if (!cancelled) setStatus(s);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Load failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function doSeed() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await seedDemo();
      setMessage(res.message || t("done"));
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("error"));
    } finally {
      setBusy(false);
    }
  }

  async function doReset() {
    if (!window.confirm(t("confirmReset"))) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await resetDemo();
      setMessage(res.message || t("done"));
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card-form">
      <h2 className="section-title">{t("trainingTitle")}</h2>
      {status?.enabled ? <p className="hint">{t("trainingLede")}</p> : null}
      {status && !status.enabled ? <p className="hint">{t("trainingOff")}</p> : null}
      {status?.enabled ? (
        <p className="status-meta">
          {t("trainingStatus")}: {status.seeded ? t("seeded") : t("notSeeded")} · items{" "}
          {status.training_items} · OPD {status.training_opd_bills} · doctors{" "}
          {status.training_doctors}
        </p>
      ) : null}
      {error ? <p className="form-error">{error}</p> : null}
      {message ? <p className="form-ok">{message}</p> : null}
      {status?.enabled ? (
        <div className="btn-row">
          <button type="button" className="btn primary" disabled={busy} onClick={() => void doSeed()}>
            {busy ? t("busy") : t("seedTraining")}
          </button>
          <button type="button" className="btn ghost" disabled={busy} onClick={() => void doReset()}>
            {t("resetTraining")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
