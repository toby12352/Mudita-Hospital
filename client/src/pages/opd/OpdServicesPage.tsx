import { FormEvent, useEffect, useState } from "react";
import {
  createService,
  deactivateService,
  listServices,
  updateService,
  type Service,
} from "@/features/settings/masterData";
import { formatMMK } from "@/shared/format";
import { useI18n } from "@/shared/i18n";
import { OpdCatalogHistory } from "./OpdCatalogHistory";

export function OpdServicesPage() {
  const { t } = useI18n();
  const [mode, setMode] = useState<"items" | "history">("items");
  const [creating, setCreating] = useState(false);
  const [createKey, setCreateKey] = useState(0);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterQ, setFilterQ] = useState("");
  const [list, setList] = useState<Service[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editing, setEditing] = useState<Service | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [price, setPrice] = useState("0");

  async function reload(search = filterQ) {
    const data = await listServices(search.trim());
    setList(data);
    return data;
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await listServices("");
        if (cancelled) return;
        setList(data);
        if (data.length > 0 && selectedId == null) setSelectedId(data[0].id);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Load failed");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial load
  }, []);

  const selected = list.find((s) => s.id === selectedId) ?? null;
  const showForm = creating || editing != null;

  function fillForm(s: Service | null) {
    if (!s) {
      setCode("");
      setName("");
      setPrice("0");
      return;
    }
    setCode(s.code);
    setName(s.name);
    setPrice(String(s.price_mmk));
  }

  function openCreate() {
    setEditing(null);
    fillForm(null);
    setCreating(true);
    setCreateKey((n) => n + 1);
  }

  function closeForm() {
    setCreating(false);
    setEditing(null);
    fillForm(null);
  }

  function selectItem(id: number) {
    setSelectedId(id);
    setCreating(false);
    setEditing(null);
    fillForm(null);
  }

  function openEdit(s: Service) {
    setCreating(false);
    setEditing(s);
    fillForm(s);
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
      const saved = editing
        ? await updateService(editing.id, body)
        : await createService({
            code: body.code,
            name: body.name,
            price_mmk: body.price_mmk,
          });
      setFilterQ("");
      setCreating(false);
      setEditing(null);
      fillForm(null);
      const data = await listServices("");
      setList(data);
      setSelectedId(saved.id);
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
      if (editing?.id === id) closeForm();
      const data = await reload();
      if (selectedId === id) {
        const next = data.find((s) => s.id === id) ?? data[0] ?? null;
        setSelectedId(next?.id ?? null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deactivate failed");
    } finally {
      setBusy(false);
    }
  }

  if (mode === "history") {
    return (
      <OpdCatalogHistory
        entity="service"
        title={t("serviceHistory")}
        backLabel={t("serviceSetup")}
        onBack={() => setMode("items")}
      />
    );
  }

  return (
    <section className="drug-setup" aria-label={t("serviceSetup")}>
      <div className="drug-setup-list-pane">
        <div className="drug-setup-title-row">
          <h2 className="drug-setup-title">{t("serviceSetup")}</h2>
          <div className="tabs">
            <button
              type="button"
              className={`tab${creating ? " active" : ""}`}
              onClick={openCreate}
            >
              {t("newBadge")}
            </button>
            <button
              type="button"
              className={`tab${filterOpen ? " active" : ""}`}
              onClick={() => setFilterOpen((v) => !v)}
            >
              {t("filter")}
            </button>
            <button type="button" className="tab" onClick={() => setMode("history")}>
              {t("catalogHistoryLink")}
            </button>
          </div>
        </div>
        <p className="drug-setup-selected" aria-hidden="true" />
        {filterOpen ? (
          <div className="drug-setup-filter">
            <input
              className="drug-info-input"
              value={filterQ}
              onChange={(e) => setFilterQ(e.target.value)}
              placeholder={t("codeOrName")}
              aria-label={t("filter")}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  void reload(filterQ)
                    .then((data) => {
                      if (data[0]) selectItem(data[0].id);
                    })
                    .catch((err) => setError(err instanceof Error ? err.message : "Search failed"));
                }
              }}
            />
            <button
              type="button"
              className="btn ghost"
              onClick={() =>
                void reload(filterQ)
                  .then((data) => {
                    if (data[0]) selectItem(data[0].id);
                  })
                  .catch((err) => setError(err instanceof Error ? err.message : "Search failed"))
              }
            >
              {t("search")}
            </button>
          </div>
        ) : null}
        {error && !showForm ? <p className="form-error">{error}</p> : null}
        <div className="drug-setup-table" role="listbox" aria-label={t("maintenanceServices")}>
          <div className="drug-setup-table-head opd-service-cols">
            <span>{t("code")}</span>
            <span>{t("name")}</span>
          </div>
          {list.length === 0 ? <p className="empty-row">{t("noServicesYet")}</p> : null}
          {list.map((s) => (
            <div
              key={s.id}
              role="option"
              tabIndex={0}
              aria-selected={s.id === selectedId && !creating && editing == null}
              className={`drug-setup-table-row opd-service-cols${
                s.id === selectedId && !creating && editing == null ? " selected" : ""
              }${!s.active ? " inactive" : ""}`}
              onClick={() => selectItem(s.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  selectItem(s.id);
                }
              }}
            >
              <span>{s.code}</span>
              <span>{s.name}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="drug-setup-detail-pane">
        {showForm ? (
          <>
            <div className="drug-setup-title-row">
              <h3 className="drug-setup-title" style={{ fontSize: "1.1rem" }}>
                {editing ? `${t("editService")} #${editing.id}` : t("createNewServiceTitle")}
              </h3>
              <button type="button" className="desk-text-link" onClick={closeForm}>
                {t("cancel")}
              </button>
            </div>
            <form
              key={editing ? `edit-${editing.id}` : `create-${createKey}`}
              className="card-form"
              onSubmit={(e) => void submit(e)}
            >
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
              </div>
            </form>
          </>
        ) : (
          <>
            <h3 className="drug-setup-title" style={{ fontSize: "1.1rem" }}>
              {t("serviceInfo")}
            </h3>
            {selected ? (
              <>
                <div className="drug-info-field">
                  <span className="drug-info-label">{t("code")}</span>
                  <span>{selected.code}</span>
                </div>
                <div className="drug-info-field">
                  <span className="drug-info-label">{t("name")}</span>
                  <span>{selected.name}</span>
                </div>
                <div className="drug-info-field">
                  <span className="drug-info-label">{t("priceMmk")}</span>
                  <span>
                    {formatMMK(selected.price_mmk)} {t("mmk")}
                  </span>
                </div>
                <div className="drug-info-field">
                  <span className="drug-info-label">{t("active")}</span>
                  <span>{selected.active ? t("active") : t("inactive")}</span>
                </div>
                <div className="btn-row drug-setup-actions">
                  <button
                    type="button"
                    className="btn ghost"
                    disabled={busy}
                    onClick={() => openEdit(selected)}
                  >
                    {t("edit")}
                  </button>
                  {selected.active ? (
                    <button
                      type="button"
                      className="btn ghost danger"
                      disabled={busy}
                      onClick={() => void onDeactivate(selected.id)}
                    >
                      {t("deactivate")}
                    </button>
                  ) : null}
                </div>
              </>
            ) : (
              <p className="hint">{t("noServicesYet")}</p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
