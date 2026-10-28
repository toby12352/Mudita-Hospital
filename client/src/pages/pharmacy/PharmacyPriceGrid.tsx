import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  impliedMarkupPercent,
  packPriceSlots,
  pricesFromUnit,
  scaleSellSmallest,
  sellSmallestFromMarkup,
  unitFactors,
  type PackLevels,
} from "@/features/pharmacy/api";
import { useI18n } from "@/shared/i18n";

type FocusCell =
  | { kind: "buy"; index: number; draft: string }
  | { kind: "sell"; index: number; draft: string }
  | { kind: "markup"; draft: string };

function markupFromPrices(buyOuter: number, sellOuter: number): string {
  const p = impliedMarkupPercent(buyOuter, sellOuter);
  return p != null ? String(p) : "";
}

function parseWholePercent(raw: string): number | null {
  const trim = raw.trim();
  if (trim === "") return null;
  const pct = Number(trim);
  if (!Number.isFinite(pct) || pct < 0 || !Number.isInteger(pct)) return null;
  return pct;
}

/** Fingerprint of packing chain so deepening/qty edits re-sync sell factors. */
function packChainKey(levels: PackLevels): string {
  return `${levels.units.join("\0")}|${levels.qtys.join(",")}`;
}

export function PharmacyPriceGrid({
  levels,
  buyOuter,
  sellSmallest,
  onPrices,
  disabled = false,
  unitLabel,
  required = false,
  /** Bump when parent reloads/resets stored prices so markup re-derives. */
  syncToken = 0,
}: {
  levels: PackLevels;
  buyOuter: number;
  sellSmallest: number;
  onPrices: (buyOuter: number, sellSmallest: number) => void;
  disabled?: boolean;
  unitLabel: (unit: string) => string;
  required?: boolean;
  syncToken?: number | string;
}) {
  const { t } = useI18n();
  const factors = useMemo(() => unitFactors(levels), [levels]);
  const unitsPerOuter = Math.max(1, factors[0] || 1);
  const sellOuter = Math.max(0, sellSmallest || 0) * unitsPerOuter;
  const slots = packPriceSlots(levels, buyOuter, sellOuter);
  const chainKey = packChainKey(levels);

  const [markup, setMarkup] = useState(() => markupFromPrices(buyOuter, sellOuter));
  const [focus, setFocus] = useState<FocusCell | null>(null);

  const unitsPerOuterRef = useRef(unitsPerOuter);
  const chainKeyRef = useRef(chainKey);
  const buyOuterRef = useRef(buyOuter);
  const sellSmallestRef = useRef(sellSmallest);
  const markupRef = useRef(markup);
  const onPricesRef = useRef(onPrices);
  buyOuterRef.current = buyOuter;
  sellSmallestRef.current = sellSmallest;
  markupRef.current = markup;
  onPricesRef.current = onPrices;

  useEffect(() => {
    setMarkup(markupFromPrices(buyOuter, sellOuter));
    setFocus(null);
    // Only re-seed markup when parent resets / opens a different item — not on every price keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- syncToken is the intentional trigger
  }, [syncToken]);

  // When packing depth or qtys change, keep outer sale (or markup %) aligned with the new factor.
  useEffect(() => {
    const prevFactor = unitsPerOuterRef.current;
    const prevChain = chainKeyRef.current;
    unitsPerOuterRef.current = unitsPerOuter;
    chainKeyRef.current = chainKey;
    if (prevChain === chainKey || prevFactor === unitsPerOuter) return;

    setFocus(null);
    const buy = buyOuterRef.current;
    const sell = sellSmallestRef.current;
    const pct = parseWholePercent(markupRef.current);
    let nextSell = sell;
    if (pct != null && buy > 0) {
      nextSell = sellSmallestFromMarkup(buy, unitsPerOuter, pct);
      setMarkup(String(pct));
    } else if (sell > 0 && prevFactor > 0) {
      const oldSellOuter = sell * prevFactor;
      nextSell = Math.round(oldSellOuter / unitsPerOuter);
      setMarkup(markupFromPrices(buy, nextSell * unitsPerOuter));
    } else {
      setMarkup(markupFromPrices(buy, sell * unitsPerOuter));
    }
    if (nextSell !== sell) {
      onPricesRef.current(buy, nextSell);
    }
  }, [chainKey, unitsPerOuter]);

  function parseNonNeg(raw: string): number {
    if (raw.trim() === "") return 0;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }

  function currentMarkupRaw(): string {
    return focus?.kind === "markup" ? focus.draft : markup;
  }

  function applyBuyAt(index: number, raw: string) {
    const price = parseNonNeg(raw);
    const buys = pricesFromUnit(levels, index, price);
    const newBuyOuter = buys[0] ?? 0;
    const pct = parseWholePercent(currentMarkupRaw());
    let newSell = sellSmallest;
    if (pct != null) {
      newSell = sellSmallestFromMarkup(newBuyOuter, unitsPerOuter, pct);
    } else if (sellSmallest > 0) {
      newSell = scaleSellSmallest(buyOuter, newBuyOuter, sellSmallest);
    } else {
      newSell = 0;
    }
    onPrices(newBuyOuter, newSell);
  }

  function applySellAt(index: number, raw: string) {
    const price = parseNonNeg(raw);
    const sells = pricesFromUnit(levels, index, price);
    const newSellSmallest = sells.length ? sells[sells.length - 1] : 0;
    const newSellOuter = sells[0] ?? 0;
    setMarkup(markupFromPrices(buyOuter, newSellOuter));
    onPrices(buyOuter, newSellSmallest);
  }

  function applyMarkup(raw: string) {
    setMarkup(raw);
    const pct = parseWholePercent(raw);
    if (pct == null) return;
    onPrices(buyOuter, sellSmallestFromMarkup(buyOuter, unitsPerOuter, pct));
  }

  /** Create mode starts blank. A stored 0 must not satisfy `required`. */
  function priceText(n: number): string {
    if (required && !(n > 0)) return "";
    return String(n);
  }

  function displayBuy(index: number): string {
    if (focus?.kind === "buy" && focus.index === index) return focus.draft;
    return priceText(slots[index]?.buy_mmk ?? 0);
  }

  function displaySell(index: number): string {
    if (focus?.kind === "sell" && focus.index === index) return focus.draft;
    return priceText(slots[index]?.sell_mmk ?? 0);
  }

  function displayMarkup(): string {
    if (focus?.kind === "markup") return focus.draft;
    return markup;
  }

  if (slots.length === 0) return null;

  const rowCount = slots.length;
  // CSS grid rows: 1 = header, 2..N+1 = unit rows, then hint
  const markupRowEnd = 2 + rowCount;

  return (
    <div
      className="drug-info-price-grid packing-price-grid packing-price-grid-edit"
      aria-label={t("pricing")}
      style={{ gridTemplateRows: `auto repeat(${rowCount}, auto) auto` }}
    >
      <span className="packing-price-corner" aria-hidden="true" />
      <span>{t("purPrice")}</span>
      <span className="packing-price-pct-head" aria-hidden="true">
        %
      </span>
      <span>{t("salePrice")}</span>

      {slots.map((slot, i) => {
        const row = i + 2;
        return (
          <Fragment key={slot.unit}>
            <span style={{ gridColumn: 1, gridRow: row }}>{unitLabel(slot.unit)}</span>
            <input
              className="price-buy"
              type="number"
              min={required && i === 0 ? 1 : 0}
              value={displayBuy(i)}
              placeholder={t("buyPricePlaceholder")}
              disabled={disabled}
              required={required && i === 0}
              aria-label={`${t("purPrice")} ${unitLabel(slot.unit)}`}
              style={{ gridColumn: 2, gridRow: row }}
              onFocus={() =>
                setFocus({ kind: "buy", index: i, draft: priceText(slots[i]?.buy_mmk ?? 0) })
              }
              onChange={(e) => {
                const draft = e.target.value;
                setFocus({ kind: "buy", index: i, draft });
                applyBuyAt(i, draft);
              }}
              onBlur={() => {
                if (focus?.kind === "buy" && focus.index === i) {
                  applyBuyAt(i, focus.draft);
                }
                setFocus(null);
              }}
            />
            <input
              className="price-sell"
              type="number"
              min={required && i === 0 ? 1 : 0}
              value={displaySell(i)}
              placeholder={t("sellPricePlaceholder")}
              disabled={disabled}
              required={required && i === 0}
              aria-label={`${t("salePrice")} ${unitLabel(slot.unit)}`}
              style={{ gridColumn: 4, gridRow: row }}
              onFocus={() =>
                setFocus({ kind: "sell", index: i, draft: priceText(slots[i]?.sell_mmk ?? 0) })
              }
              onChange={(e) => {
                const draft = e.target.value;
                setFocus({ kind: "sell", index: i, draft });
                applySellAt(i, draft);
              }}
              onBlur={() => {
                if (focus?.kind === "sell" && focus.index === i) {
                  // Snapped display can differ from stored per-smallest; skip if unchanged.
                  const shown = slots[i]?.sell_mmk ?? 0;
                  if (parseNonNeg(focus.draft) !== shown) {
                    applySellAt(i, focus.draft);
                  }
                }
                setFocus(null);
              }}
            />
          </Fragment>
        );
      })}

      <label
        className="packing-price-markup"
        style={{ gridColumn: 3, gridRow: `2 / ${markupRowEnd}` }}
      >
        <span className="visually-hidden">{t("priceMarkupPercent")}</span>
        <span className="packing-price-op" aria-hidden="true">
          ×
        </span>
        <input
          type="number"
          min={0}
          step={1}
          inputMode="numeric"
          value={displayMarkup()}
          placeholder="0"
          title={t("priceMarkupHint")}
          aria-label={t("priceMarkupPercent")}
          disabled={disabled}
          onFocus={() => setFocus({ kind: "markup", draft: markup })}
          onChange={(e) => {
            const draft = e.target.value;
            setFocus({ kind: "markup", draft });
            applyMarkup(draft);
          }}
          onBlur={() => {
            const draft = focus?.kind === "markup" ? focus.draft : markup;
            setFocus(null);
            const pct = parseWholePercent(draft);
            if (pct != null) {
              setMarkup(String(pct));
              onPrices(buyOuter, sellSmallestFromMarkup(buyOuter, unitsPerOuter, pct));
            } else if (draft.trim() === "") {
              setMarkup("");
            } else {
              setMarkup(markupFromPrices(buyOuter, sellOuter));
            }
          }}
        />
        <span className="packing-price-op" aria-hidden="true">
          %
        </span>
        <span className="packing-price-op packing-price-eq" aria-hidden="true">
          =
        </span>
      </label>

      <p
        className="hint packing-price-markup-hint"
        style={{ gridColumn: "1 / -1", gridRow: markupRowEnd }}
      >
        {t("priceMarkupHint")} {t("pricePayableHint")}
      </p>
    </div>
  );
}
