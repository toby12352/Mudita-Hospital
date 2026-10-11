import { useEffect, useState } from "react";
import {
  formatItemCode,
  formatStockHistoryLine,
  formatStockHistoryReason,
  listStockMovements,
  type StockMovement,
} from "@/features/pharmacy/api";
import { Typeahead } from "@/shared/Typeahead";
export function PharmacyMovementsTab() {
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
    <div className="settings-stack">
      <div className="card-form">
        <h2 className="section-title">Item History</h2>
        <p className="hint">What changed in stock — restock, sales, OT, adjustments. Newest first.</p>
        <div className="list-toolbar">
          <Typeahead
            label="Filter"
            value={q}
            onChange={setQ}
            placeholder="ID/Code, name, or note"
            loadSuggestions={async (term) =>
              listStockMovements({ q: term.trim() || undefined })
            }
            getKey={(m) => m.id}
            renderOption={(m) => (
              <>
                <span className="typeahead-title">
                  {formatItemCode(m.item_code)} — {m.item_name}
                </span>
                <span className="typeahead-sub">
                  {formatStockHistoryLine(m, m.stock_unit || "item")}
                </span>
              </>
            )}
            onPick={(m) => {
              setQ(m.item_code);
              void reload(m.item_code).catch((err) =>
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
            Search
          </button>
        </div>
        {error ? <p className="form-error">{error}</p> : null}
        <ul className="data-list">
          {list.length === 0 ? <li className="empty-row">No history yet</li> : null}
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
      </div>
    </div>
  );
}
