import { FormEvent, useState } from "react";
import { changePassword, type User } from "@/shared/auth";
import { useI18n } from "@/shared/i18n";

export function ChangePasswordForm({
  onDone,
  onCancel,
}: {
  onDone: (result: { token: string; user: User }) => Promise<void>;
  onCancel: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (next !== confirm) {
      setError("New passwords do not match");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await changePassword(current, next);
      await onDone(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Change failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card-form" onSubmit={(e) => void submit(e)}>
      <label className="field">
        <span>{t("currentPassword")}</span>
        <input
          type="password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          required
          disabled={busy}
        />
      </label>
      <label className="field">
        <span>{t("newPassword")}</span>
        <input
          type="password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          minLength={6}
          required
          disabled={busy}
        />
      </label>
      <label className="field">
        <span>{t("confirmNewPassword")}</span>
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          minLength={6}
          required
          disabled={busy}
        />
      </label>
      {error ? <p className="form-error">{error}</p> : null}
      <div className="btn-row">
        <button type="submit" className="btn primary" disabled={busy}>
          {busy ? t("saving") : t("savePassword")}
        </button>
        <button type="button" className="btn ghost" disabled={busy} onClick={() => void onCancel()}>
          {t("cancel")}
        </button>
      </div>
    </form>
  );
}
