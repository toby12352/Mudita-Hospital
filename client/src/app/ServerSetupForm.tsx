import { FormEvent, useState } from "react";
import { fetchHealth, markApiConfigured, setApiBase } from "@/shared/api";
import { userMessage } from "@/shared/errors";
import { useI18n } from "@/shared/i18n";

export function ServerSetupForm({
  initial,
  onSave,
  onUseLocal,
}: {
  initial: string;
  onSave: (base: string) => void;
  onUseLocal: () => void;
}) {
  const { t } = useI18n();
  const [value, setValue] = useState(() => {
    try {
      const u = new URL(initial);
      return u.hostname === "127.0.0.1" || u.hostname === "localhost" ? "" : u.hostname;
    } catch {
      return "";
    }
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setHint(null);
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 4000);
    try {
      const base = setApiBase(value.trim());
      const health = await fetchHealth(controller.signal);
      if (health.db !== "ok" || health.status !== "ok") {
        throw new Error(userMessage("db=error"));
      }
      markApiConfigured();
      setHint(t("errConnectedTo").split("{base}").join(base));
      onSave(base);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.name === "AbortError"
            ? userMessage("Failed to fetch")
            : err.message
          : userMessage("Failed to fetch");
      setError(`${msg} ${t("errSaveRetryHint")}`);
    } finally {
      window.clearTimeout(timer);
      setBusy(false);
    }
  }

  function saveAnyway() {
    try {
      const base = setApiBase(value.trim());
      onSave(base);
    } catch (err) {
      setError(err instanceof Error ? err.message : userMessage("Invalid server address"));
    }
  }

  return (
    <form className="card-form" onSubmit={(e) => void submit(e)}>
      <label className="field">
        <span>{t("serverIpOrAddress")}</span>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="192.168.1.10"
          autoFocus
          disabled={busy}
          required
        />
      </label>
      <p className="hint">
        {t("serverExamples")} <code>192.168.1.10</code> or <code>http://192.168.1.10:8080</code>
      </p>
      {error ? <p className="form-error">{error}</p> : null}
      {hint ? <p className="form-ok">{hint}</p> : null}
      <div className="btn-row">
        <button type="submit" className="btn primary" disabled={busy || !value.trim()}>
          {busy ? t("testing") : t("saveAndTest")}
        </button>
        {error ? (
          <button type="button" className="btn ghost" onClick={saveAnyway} disabled={busy}>
            {t("saveAnyway")}
          </button>
        ) : null}
        <button type="button" className="btn ghost" onClick={onUseLocal} disabled={busy}>
          {t("thisPc")}
        </button>
      </div>
    </form>
  );
}
