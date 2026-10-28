import { FormEvent, useEffect, useId, useRef, useState } from "react";
import {
  createDoctor,
  deactivateDoctor,
  listDoctors,
  updateDoctor,
  type Doctor,
} from "@/features/settings/masterData";
import { ActionIcon } from "@/shared/ActionIcon";
import { fieldKeyForApiError } from "@/shared/errors";
import { FieldError, revealField } from "@/shared/FieldError";
import { Typeahead } from "@/shared/Typeahead";
import { useI18n } from "@/shared/i18n";
export function DoctorsTab() {
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const [list, setList] = useState<Doctor[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Doctor | null>(null);
  const [name, setName] = useState("");
  const [specialty, setSpecialty] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);
  const formErrorRef = useRef<HTMLParagraphElement>(null);
  const nameErrorId = useId();
  const [consult, setConsult] = useState("0");
  const [ot, setOt] = useState("0");

  async function reload(search = q) {
    const data = await listDoctors(search.trim());
    setList(data);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await listDoctors("");
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
    setName("");
    setSpecialty("");
    setConsult("0");
    setOt("0");
  }

  function startEdit(d: Doctor) {
    setEditing(d);
    setName(d.name);
    setSpecialty(d.specialty);
    setConsult(String(d.fees.consultation_mmk));
    setOt(String(d.fees.ot_mmk));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNameError(null);
    try {
      const body = {
        name: name.trim(),
        specialty: specialty.trim(),
        consultation_mmk: Number(consult) || 0,
        ot_mmk: Number(ot) || 0,
        active: true,
      };
      if (editing) {
        await updateDoctor(editing.id, body);
      } else {
        await createDoctor(body);
      }
      startCreate();
      await reload();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Save failed";
      if (fieldKeyForApiError(err) === "name") {
        setNameError(msg);
        window.setTimeout(() => revealField(nameInputRef.current), 0);
      } else {
        setError(msg);
        window.setTimeout(() => revealField(formErrorRef.current), 0);
      }
    } finally {
      setBusy(false);
    }
  }

  async function onDeactivate(id: number) {
    setBusy(true);
    setError(null);
    try {
      await deactivateDoctor(id);
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
          {editing ? `${t("editDoctor")} #${editing.id}` : t("addDoctor")}
        </h2>
        <label className={`field${nameError ? " is-invalid" : ""}`}>
          <span>{t("name")}</span>
          <input
            ref={nameInputRef}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setNameError(null);
            }}
            required
            disabled={busy}
            aria-invalid={nameError ? true : undefined}
            aria-describedby={nameError ? nameErrorId : undefined}
          />
          <FieldError id={nameErrorId}>{nameError}</FieldError>
        </label>
        <label className="field">
          <span>{t("specialty")}</span>
          <input value={specialty} onChange={(e) => setSpecialty(e.target.value)} disabled={busy} />
        </label>
        <div className="field-row">
          <label className="field">
            <span>{t("consultationMmk")}</span>
            <input
              type="number"
              min={0}
              value={consult}
              onChange={(e) => setConsult(e.target.value)}
              disabled={busy}
            />
          </label>
          <label className="field">
            <span>{t("otFeeMmk")}</span>
            <input type="number" min={0} value={ot} onChange={(e) => setOt(e.target.value)} disabled={busy} />
          </label>
        </div>
        {error ? (
          <p ref={formErrorRef} className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="btn-row">
          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? t("saving") : editing ? t("updateDoctor") : t("addDoctor")}
          </button>
          {editing ? (
            <button type="button" className="btn action" disabled={busy} onClick={startCreate}>
              {t("cancelEdit")}
            </button>
          ) : null}
        </div>
      </form>

      <div className="card-form">
        <div className="list-toolbar">
          <Typeahead
            label={t("searchDoctors")}
            value={q}
            onChange={setQ}
            placeholder={t("doctorPlaceholder")}
            loadSuggestions={async (term) => listDoctors(term.trim())}
            getKey={(d) => d.id}
            renderOption={(d) => (
              <>
                <span className="typeahead-title">
                  {d.name}
                  {!d.active ? ` ${t("inactive")}` : ""}
                </span>
                <span className="typeahead-sub">
                  {d.specialty || t("general")} · {t("consultAbbrev")}{" "}
                  {d.fees.consultation_mmk.toLocaleString()} · OT {d.fees.ot_mmk.toLocaleString()}{" "}
                  {t("mmk")}
                </span>
              </>
            )}
            optionClassName={(d) => (!d.active ? "inactive" : "")}
            onPick={(d) => {
              setQ(d.name);
              void reload(d.name).catch((err) =>
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
          {list.length === 0 ? <li className="empty-row">{t("noDoctorsYet")}</li> : null}
          {list.map((d) => (
            <li key={d.id} className={!d.active ? "inactive" : undefined}>
              <div>
                <p className="row-title">
                  {d.name}
                  {!d.active ? ` ${t("inactive")}` : ""}
                </p>
                <p className="row-sub">
                  {d.specialty || t("general")} · {t("consultAbbrev")}{" "}
                  {d.fees.consultation_mmk.toLocaleString()} · OT {d.fees.ot_mmk.toLocaleString()}{" "}
                  {t("mmk")}
                </p>
              </div>
              <div className="btn-row">
                <button type="button" className="btn action" onClick={() => startEdit(d)} disabled={busy}>
                  <ActionIcon name="edit" />
                  {t("edit")}
                </button>
                {d.active ? (
                  <button
                    type="button"
                    className="btn action danger"
                    onClick={() => void onDeactivate(d.id)}
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
