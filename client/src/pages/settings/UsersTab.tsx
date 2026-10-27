import { FormEvent, useEffect, useState } from "react";
import {
  createUser,
  listUsers,
  updateUser,
  type ManagedUser,
} from "@/features/settings/masterData";
import { ActionIcon } from "@/shared/ActionIcon";
import { Typeahead } from "@/shared/Typeahead";
import { useI18n } from "@/shared/i18n";

const MODULES = [
  { id: "patients", labelKey: "rolePatients" },
  { id: "ipd", labelKey: "roleIPD" },
  { id: "opd", labelKey: "roleOPD" },
  { id: "ot", labelKey: "roleOT" },
  { id: "pharmacy", labelKey: "rolePharmacy" },
] as const;

const ACTIONS = ["read", "create", "update", "delete"] as const;

const ACTION_KEY = {
  read: "grantRead",
  create: "grantCreate",
  update: "grantUpdate",
  delete: "grantDelete",
} as const;

type ModuleId = (typeof MODULES)[number]["id"];
type ActionId = (typeof ACTIONS)[number];

function cellKey(module: ModuleId, action: ActionId): string {
  return `${module}.${action}`;
}

function usable(module: ModuleId, action: ActionId): boolean {
  return !(module === "ipd" && action === "delete");
}

function emptyCells(): Record<string, boolean> {
  return {};
}

function portalCells(role: string): Record<string, boolean> {
  const cells: Record<string, boolean> = {};
  const fill = (module: ModuleId, actions: ActionId[]) => {
    for (const action of actions) cells[cellKey(module, action)] = true;
  };
  switch (role) {
    case "OPD":
      fill("opd", ["read", "create", "update", "delete"]);
      break;
    case "OT":
      fill("ot", ["read", "create", "update", "delete"]);
      break;
    case "Pharmacy":
      fill("pharmacy", ["read", "create", "update", "delete"]);
      break;
    case "Patients":
      fill("patients", ["read", "create", "update"]);
      break;
    case "IPD":
      fill("ipd", ["read", "create", "update"]);
      break;
    default:
      break;
  }
  return cells;
}

function cellsFromGrants(grants: string[]): Record<string, boolean> {
  const cells: Record<string, boolean> = {};
  for (const grant of grants) {
    if (grant === "ipd.delete") continue;
    cells[grant] = true;
  }
  for (const mod of MODULES) {
    const any = ACTIONS.some(
      (action) => action !== "read" && usable(mod.id, action) && cells[cellKey(mod.id, action)],
    );
    if (any) cells[cellKey(mod.id, "read")] = true;
  }
  return cells;
}

function grantsFromCells(cells: Record<string, boolean>, dashboard: boolean): string[] {
  const grants: string[] = [];
  for (const mod of MODULES) {
    for (const action of ACTIONS) {
      if (!usable(mod.id, action)) continue;
      if (cells[cellKey(mod.id, action)]) grants.push(cellKey(mod.id, action));
    }
  }
  if (dashboard) grants.push("dashboard");
  return grants;
}

function accessLabel(u: ManagedUser, t: (key: string) => string): string {
  if (u.role === "Admin") return t("fullAccess");
  if (u.access_mode !== "unified") return u.role;
  const parts: string[] = [];
  const grants = u.grants ?? [];
  for (const mod of MODULES) {
    const names = ACTIONS.filter(
      (action) => usable(mod.id, action) && grants.includes(cellKey(mod.id, action)),
    ).map((action) => t(ACTION_KEY[action]));
    if (names.length) parts.push(`${t(mod.labelKey)}: ${names.join(", ")}`);
  }
  if (grants.includes("dashboard")) parts.push(t("dashboardAccess"));
  return parts.join(" · ");
}

export function UsersTab() {
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const [list, setList] = useState<ManagedUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [cells, setCells] = useState<Record<string, boolean>>(emptyCells);
  const [dashboard, setDashboard] = useState(false);
  const [portalWarning, setPortalWarning] = useState(false);

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

  function clearForm() {
    setEditingId(null);
    setUsername("");
    setDisplayName("");
    setPassword("");
    setCells(emptyCells());
    setDashboard(false);
    setPortalWarning(false);
  }

  function setCell(module: ModuleId, action: ActionId, on: boolean) {
    if (!usable(module, action)) return;
    setCells((prev) => {
      const next = { ...prev };
      next[cellKey(module, action)] = on;
      if (on && action !== "read") next[cellKey(module, "read")] = true;
      if (!on && action === "read") {
        for (const other of ACTIONS) {
          if (other !== "read") next[cellKey(module, other)] = false;
        }
      }
      return next;
    });
  }

  function checkAll(module: ModuleId) {
    setCells((prev) => {
      const next = { ...prev };
      for (const action of ACTIONS) {
        if (!usable(module, action)) continue;
        next[cellKey(module, action)] = true;
      }
      return next;
    });
  }

  function loadEdit(u: ManagedUser) {
    if (u.role === "Admin") return;
    setEditingId(u.id);
    setUsername(u.username);
    setDisplayName(u.display_name);
    setPassword("");
    setError(null);
    if (u.access_mode === "unified") {
      setCells(cellsFromGrants(u.grants ?? []));
      setDashboard((u.grants ?? []).includes("dashboard"));
      setPortalWarning(false);
    } else {
      setCells(portalCells(u.role));
      setDashboard(false);
      setPortalWarning(true);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const grants = grantsFromCells(cells, dashboard);
    try {
      if (editingId != null) {
        await updateUser(editingId, {
          display_name: displayName.trim(),
          grants,
          ...(password ? { password } : {}),
        });
      } else {
        await createUser({
          username: username.trim(),
          display_name: displayName.trim(),
          password,
          grants,
        });
      }
      clearForm();
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
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
        <h2 className="section-title">{editingId != null ? t("editUserTitle") : t("createUserTitle")}</h2>
        <div className="field-row">
          <label className="field">
            <span>{t("username")}</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              disabled={busy || editingId != null}
            />
          </label>
          <label className="field">
            <span>{t("displayName")}</span>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              disabled={busy}
            />
          </label>
        </div>
        <label className="field">
          <span>{editingId != null ? t("password") : t("tempPassword")}</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={editingId != null && password === "" ? undefined : 6}
            required={editingId == null}
            disabled={busy}
          />
        </label>
        {editingId != null ? <p className="hint">{t("passwordKeep")}</p> : null}

        <div className="grant-matrix-wrap">
          <table className="grant-matrix">
            <thead>
              <tr>
                <th scope="col" />
                {ACTIONS.map((action) => (
                  <th key={action} scope="col">
                    {t(ACTION_KEY[action])}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MODULES.map((mod) => (
                <tr key={mod.id}>
                  <th scope="row">
                    <div className="grant-module">
                      <span>{t(mod.labelKey)}</span>
                      <button
                        type="button"
                        className="grant-all"
                        disabled={busy}
                        onClick={() => checkAll(mod.id)}
                      >
                        {t("grantAll")}
                      </button>
                    </div>
                  </th>
                  {ACTIONS.map((action) => {
                    const enabled = usable(mod.id, action);
                    return (
                      <td key={action}>
                        <input
                          type="checkbox"
                          checked={enabled && !!cells[cellKey(mod.id, action)]}
                          disabled={busy || !enabled}
                          aria-label={`${t(mod.labelKey)} ${t(ACTION_KEY[action])}`}
                          onChange={(e) => setCell(mod.id, action, e.target.checked)}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <label className="grant-dashboard">
          <input
            type="checkbox"
            checked={dashboard}
            disabled={busy}
            onChange={(e) => setDashboard(e.target.checked)}
          />
          <span>{t("dashboardAccess")}</span>
        </label>
        {portalWarning ? <p className="hint">{t("portalSwitchWarning")}</p> : null}
        <p className="hint">{t("grantHint")}</p>
        <p className="hint">{t("usersHint")}</p>
        {error ? <p className="form-error">{error}</p> : null}
        <div className="btn-row">
          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? t("saving") : editingId != null ? t("saveUser") : t("createUser")}
          </button>
          {editingId != null ? (
            <button type="button" className="btn ghost" disabled={busy} onClick={clearForm}>
              {t("cancel")}
            </button>
          ) : null}
        </div>
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
                  {u.username} · {accessLabel(u, t)}
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
            className="btn action"
            onClick={() =>
              void reload(q).catch((err) =>
                setError(err instanceof Error ? err.message : "Search failed"),
              )
            }
          >
            <ActionIcon name="search" />
            {t("search")}
          </button>
        </div>
        <ul className="data-list">
          {list.map((u) => (
            <li key={u.id} className={!u.active ? "inactive" : undefined}>
              <div>
                <p className="row-title">
                  {u.username}
                  {!u.active ? ` ${t("inactive")}` : ""}
                </p>
                <p className="row-sub">
                  {u.display_name}
                  {u.must_change_password ? ` · ${t("mustChangePassword")}` : ""}
                </p>
                <p className="row-sub">{accessLabel(u, t)}</p>
              </div>
              {u.role !== "Admin" ? (
                <div className="row-actions">
                  <button
                    type="button"
                    className="btn action"
                    disabled={busy}
                    onClick={() => loadEdit(u)}
                  >
                    {t("edit")}
                  </button>
                  <button
                    type="button"
                    className={`btn action${u.active ? " danger" : ""}`}
                    disabled={busy}
                    onClick={() => void toggleActive(u)}
                  >
                    {u.active ? t("deactivate") : t("activate")}
                  </button>
                </div>
              ) : (
                <span className="row-sub">{t("fullAccess")}</span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
