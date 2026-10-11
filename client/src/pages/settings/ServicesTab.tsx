import { FormEvent, useEffect, useState } from "react";
import {
  createService,
  deactivateService,
  listServices,
  updateService,
  type Service,
} from "@/features/settings/masterData";
import { Typeahead } from "@/shared/Typeahead";
import { useI18n } from "@/shared/i18n";
export function ServicesTab() {
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const [list, setList] = useState<Service[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Service | null>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [price, setPrice] = useState("0");

  async function reload(search = q) {
    setList(await listServices(search.trim()));
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await listServices("");
        if (!cancelled) setList(data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Load failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function startCreate() {
    setEditing(null);
    setCode("");
    setName("");
    setPrice("0");
  }

  function startEdit(s: Service) {
    setEditing(s);
    setCode(s.code);
    setName(s.name);
    setPrice(String(s.price_mmk));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = {
        code: code.trim(),
        name: name.trim(),
        price_mmk: Number(price) || 0,
        active: true,
      };
      if (editing) {
        await updateService(editing.id, body);
      } else {
        await createService(body);
      }
      startCreate();
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function onDeactivate(id: number) {
    setBusy(true);
    setError(null);
    try {
      await deactivateService(id);
      if (editing?.id === id) startCreate();
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deactivate failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="settings-stack">
      <form className="card-form" onSubmit={(e) => void submit(e)}>
        <h2 className="section-title">
          {editing ? `${t("editService")} #${editing.id}` : t("addService")}
        </h2>
        <div className="field-row">
          <label className="field">
            <span>{t("code")}</span>
            <input value={code} onChange={(e) => setCode(e.target.value)} required disabled={busy} />
          </label>
          <label className="field">
            <span>{t("priceMmk")}</span>
            <input
              type="number"
              min={0}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              disabled={busy}
            />
          </label>
        </div>
        <label className="field">
          <span>{t("name")}</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            disabled={busy}
            placeholder={t("serviceNamePlaceholder")}
          />
        </label>
        {error ? <p className="form-error">{error}</p> : null}
        <div className="btn-row">
          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? t("saving") : editing ? t("updateService") : t("addService")}
          </button>
          {editing ? (
            <button type="button" className="btn ghost" disabled={busy} onClick={startCreate}>
              {t("cancelEdit")}
            </button>
          ) : null}
        </div>
      </form>

      <div className="card-form">
        <div className="list-toolbar">
          <Typeahead
            label={t("searchServices")}
            value={q}
            onChange={setQ}
            placeholder={t("codeOrName")}
            loadSuggestions={async (term) => listServices(term.trim())}
            getKey={(s) => s.id}
            renderOption={(s) => (
              <>
                <span className="typeahead-title">
                  {s.code} — {s.name}
                  {!s.active ? ` ${t("inactive")}` : ""}
                </span>
                <span className="typeahead-sub">
                  {s.price_mmk.toLocaleString()} {t("mmk")} · {t("nonStock")}
                </span>
              </>
            )}
            optionClassName={(s) => (!s.active ? "inactive" : "")}
            onPick={(s) => {
              setQ(s.code);
              void reload(s.code).catch((err) =>
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
          {list.length === 0 ? <li className="empty-row">{t("noServicesYet")}</li> : null}
          {list.map((s) => (
            <li key={s.id} className={!s.active ? "inactive" : undefined}>
              <div>
                <p className="row-title">
                  {s.code} — {s.name}
                  {!s.active ? ` ${t("inactive")}` : ""}
                </p>
                <p className="row-sub">
                  {s.price_mmk.toLocaleString()} {t("mmk")} · {t("nonStock")}
                </p>
              </div>
              <div className="btn-row">
                <button type="button" className="btn ghost" onClick={() => startEdit(s)} disabled={busy}>
                  {t("edit")}
                </button>
                {s.active ? (
                  <button
                    type="button"
                    className="btn ghost danger"
                    onClick={() => void onDeactivate(s.id)}
                    disabled={busy}
                  >
                    {t("deactivate")}
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
