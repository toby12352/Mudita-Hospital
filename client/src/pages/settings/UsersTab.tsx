import { FormEvent, useEffect, useState } from "react";
import {
  createUser,
  listUsers,
  updateUser,
  type ManagedUser,
} from "@/features/settings/masterData";
import { Typeahead } from "@/shared/Typeahead";
import { useI18n } from "@/shared/i18n";

export function UsersTab() {
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const [list, setList] = useState<ManagedUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<"OPD" | "OT" | "Pharmacy">("OPD");
  const [password, setPassword] = useState("");

  async function reload(search = q) {
    setList(await listUsers(search.trim()));
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await listUsers("");
        if (!cancelled) setList(data);
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
    try {
      await createUser({
        username: username.trim(),
        display_name: displayName.trim(),
        role,
        password,
      });
      setUsername("");
      setDisplayName("");
      setPassword("");
      setRole("OPD");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(u: ManagedUser) {
    setBusy(true);
    setError(null);
    try {
      await updateUser(u.id, { active: !u.active });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="settings-stack">
      <form className="card-form" onSubmit={(e) => void submit(e)}>
        <h2 className="section-title">{t("createUserTitle")}</h2>
        <div className="field-row">
          <label className="field">
            <span>{t("username")}</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              disabled={busy}
            />
          </label>
          <label className="field">
            <span>{t("role")}</span>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as "OPD" | "OT" | "Pharmacy")}
              disabled={busy}
            >
              <option value="OPD">{t("roleOPD")}</option>
              <option value="OT">{t("roleOT")}</option>
              <option value="Pharmacy">{t("rolePharmacy")}</option>
            </select>
          </label>
        </div>
        <label className="field">
          <span>{t("displayName")}</span>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            disabled={busy}
          />
        </label>
        <label className="field">
          <span>{t("tempPassword")}</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            required
            disabled={busy}
          />
        </label>
        <p className="hint">{t("usersHint")}</p>
        {error ? <p className="form-error">{error}</p> : null}
        <button type="submit" className="btn primary" disabled={busy}>
          {busy ? t("saving") : t("createUser")}
        </button>
      </form>

      <div className="card-form">
        <div className="list-toolbar">
          <Typeahead
            label={t("searchUsers")}
            value={q}
            onChange={setQ}
            placeholder={t("usernameOrName")}
            loadSuggestions={async (term) => listUsers(term.trim())}
            getKey={(u) => u.id}
            renderOption={(u) => (
              <>
                <span className="typeahead-title">
                  {u.username} · {u.role}
                  {!u.active ? ` ${t("inactive")}` : ""}
                </span>
                <span className="typeahead-sub">{u.display_name}</span>
              </>
            )}
            optionClassName={(u) => (!u.active ? "inactive" : "")}
            onPick={(u) => {
              setQ(u.username);
              void reload(u.username).catch((err) =>
                setError(err instanceof Error ? err.message : "Search failed"),
              );
            }}
            onSubmitWithoutPick={() =>
              void reload(q).catch((err) =>
                setError(err instanceof Error ? err.message : "Search failed"),
              )
            }
          />
          <button
            type="button"
            className="btn ghost"
            onClick={() =>
              void reload(q).catch((err) =>
                setError(err instanceof Error ? err.message : "Search failed"),
              )
            }
          >
            {t("search")}
          </button>
        </div>
        <ul className="data-list">
          {list.map((u) => (
            <li key={u.id} className={!u.active ? "inactive" : undefined}>
              <div>
                <p className="row-title">
                  {u.username} · {u.role}
                  {!u.active ? ` ${t("inactive")}` : ""}
                </p>
                <p className="row-sub">
                  {u.display_name}
                  {u.must_change_password ? ` · ${t("mustChangePassword")}` : ""}
                </p>
              </div>
              {u.role !== "Admin" ? (
                <button
                  type="button"
                  className="btn ghost"
                  disabled={busy}
                  onClick={() => void toggleActive(u)}
                >
                  {u.active ? t("deactivate") : t("activate")}
                </button>
              ) : (
                <span className="row-sub">Admin</span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
