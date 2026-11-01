import { FormEvent, useState } from "react";
import { FieldError } from "@/shared/FieldError";

export function LoginForm({
  onSubmit,
  error,
  disabled,
  t,
}: {
  onSubmit: (username: string, password: string) => Promise<void>;
  error: string | null;
  disabled?: boolean;
  t: (k: string) => string;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLocalError(null);
    setBusy(true);
    try {
      await onSubmit(username.trim(), password);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : t("loginFailed"));
    } finally {
      setBusy(false);
    }
  }

  const showError = localError || error;

  return (
    <form className="card-form" onSubmit={(e) => void submit(e)}>
      <label className="field">
        <span>{t("username")}</span>
        <input
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          disabled={busy || disabled}
          required
        />
      </label>
      <label className="field">
        <span>{t("password")}</span>
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={busy || disabled}
          required
        />
      </label>
      <FieldError>{showError}</FieldError>
      <button type="submit" className="btn primary" disabled={busy || disabled}>
        {busy ? t("signingIn") : t("signIn")}
      </button>
      <p className="hint">{t("loginHint")}</p>
    </form>
  );
}
