import { useEffect, useState } from "react";
import {
  formatItemCode,
  formatStockHistoryLine,
  formatStockHistoryReason,
  listStockMovements,
  type StockMovement,
} from "@/features/pharmacy/api";
import { ActionIcon } from "@/shared/ActionIcon";
import { useI18n } from "@/shared/i18n";

export function PharmacyMovementsTab() {
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const [list, setList] = useState<StockMovement[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function reload(search = q) {
    setList(await listStockMovements({ q: search.trim() || undefined }));
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await listStockMovements();
        if (!cancelled) setList(data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Load failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <h3 className="drug-setup-title" style={{ fontSize: "1.1rem" }}>
        {t("inventoryHistory")}
      </h3>
      <p className="hint">{t("inventoryHistoryHint")}</p>
      <div className="list-toolbar">
        <label className="field">
          <span>{t("filter")}</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("idCodeOrName")}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                void reload(q).catch((err) =>
                  setError(err instanceof Error ? err.message : "Search failed"),
                );
              }
            }}
          />
        </label>
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
      {error ? <p className="form-error">{error}</p> : null}
      <ul className="data-list">
        {list.length === 0 ? <li className="empty-row">{t("noHistoryYet")}</li> : null}
        {list.map((m) => {
          const reasonLine = formatStockHistoryReason(m.reason);
          return (
            <li key={m.id}>
              <div>
                <p className="row-title">
                  {formatItemCode(m.item_code)} — {m.item_name}
                </p>
                <p className="row-sub">
                  {formatStockHistoryLine(m, m.stock_unit || "item")}
                </p>
                {reasonLine ? <p className="row-sub">{reasonLine}</p> : null}
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
