"""Parse RapidOCR boxes into draft particular/price rows per page."""
from __future__ import annotations

import json
import re
from pathlib import Path

OUT = Path(r"c:\Mudita_Software\Mudita-Hospital\content\OPD Services\ocr-raw")

SKIP_TEXTS = {
    "particular",
    "kyat",
    "opd procedures",
    "time :",
    "time:",
}
HEADER_RE = re.compile(
    r"^page\s+\d+\s+of|^ps[gx]e\s+\d+|^\d+\s*0?ct\s+\d+|mudita\s*hospital|^poge\b|^psxe\b|^dote:|^date:",
    re.I,
)
PRICE_RE = re.compile(r"^-?\d{1,8}$")
ZERO_RE = re.compile(
    r"^(0|O|o|DDOOE|DDDOE|DDODE|ODOOE|DDCOE|DDDE|D0ODE|DODOE|DDOE|DDOEE|DCODE|DDDODE|DDDODE-|DOOEE|ODCOE|ODCOE|O0OSE|O0ODSE|00O05|00O0T|00O0S|00OT-|D0ODOT|D0ODSE|D0GEE|DD0OSE|DDDSE|DOS6E|DDOSE|DDOE|00006|00O00G|00O00OT|00OT)$",
    re.I,
)

# Compact forms of known section headers
SECTION_COMPACT = {
    "ecg": "ECG",
    "glucometer": "Glucometer",
    "glucomstar": "Glucometer",
    "kaungpyaesone": "Kaung Pyae Sone",
    "kaunopvcsonc": "Kaung Pyae Sone",
    "kaunopvcsone": "Kaung Pyae Sone",
    "muditalaboratory": "Mudita Laboratory",
    "mudtlabentor": "Mudita Laboratory",
    "muditalab": "Mudita Laboratory",
    "monitor": "Monitor",
    "opd": "OPD",
    "package": "Package",
    "packaas": "Package",
    "shaving": "Shaving",
    "shavina": "Shaving",
    "shwebhone": "Shwe Bhone",
    "shwcbhons": "Shwe Bhone",
    "ultrasound": "Ultrasound",
    "uktevound": "Ultrasound",
    "xray": "X-ray",
}


def load(n: int) -> list[dict]:
    return json.loads((OUT / f"{n}-rapid.json").read_text(encoding="utf-8"))


def is_price(text: str) -> bool:
    t = text.strip().replace(",", "").replace(" ", "")
    if ZERO_RE.match(t):
        return True
    if PRICE_RE.match(t):
        return True
    return False


def price_value(text: str) -> int:
    t = text.strip().replace(",", "").replace(" ", "")
    if ZERO_RE.match(t):
        return 0
    return int(t)


def is_noise(text: str) -> bool:
    t = text.strip()
    if not t:
        return True
    low = t.lower()
    if low in SKIP_TEXTS:
        return True
    if HEADER_RE.search(low):
        return True
    if re.fullmatch(r"\d{1,2}:\d{2}\s*(AM|PM|PY)", t, re.I):
        return True
    return False


def compact(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", s.lower())


def known_section(text: str) -> str | None:
    return SECTION_COMPACT.get(compact(text))


def mid_x(boxes: list[dict]) -> float:
    kyats = [b["x"] for b in boxes if b["text"].strip().lower() == "kyat"]
    if len(kyats) >= 2:
        return (min(kyats) + max(kyats)) / 2
    max_x = max((b["x"] + b["w"] for b in boxes), default=2000)
    return max_x * 0.48


def parse_page(n: int) -> list[dict]:
    boxes = [b for b in load(n) if not is_noise(b["text"])]
    split = mid_x(boxes)
    left = [b for b in boxes if b["x"] < split]
    right = [b for b in boxes if b["x"] >= split]
    out: list[dict] = []

    def parse_col(col: list[dict], side: str) -> None:
        prices = [b for b in col if is_price(b["text"])]
        labels = [b for b in col if not is_price(b["text"])]
        used_price: set[int] = set()
        for lab in sorted(labels, key=lambda b: b["y"]):
            text = lab["text"].strip()
            sec = known_section(text)
            best = None
            best_d = 1e9
            for i, p in enumerate(prices):
                if i in used_price:
                    continue
                d = abs(p["y"] - lab["y"])
                if p["x"] < lab["x"] - 5:
                    continue
                if d < best_d and d <= 30:
                    best_d = d
                    best = i
            if sec is not None and (best is None or best_d > 12):
                # treat as section header even if a stray number is nearby
                out.append(
                    {
                        "page": n,
                        "side": side,
                        "y": lab["y"],
                        "kind": "header",
                        "particular": sec,
                        "price_mmk": None,
                        "score": lab["score"],
                    }
                )
                continue
            if best is None:
                # unmatched label — keep as item with unknown price only if looks real
                if len(text) >= 2 and lab["score"] >= 0.55 and not re.fullmatch(r"[\W\d_]+", text):
                    out.append(
                        {
                            "page": n,
                            "side": side,
                            "y": lab["y"],
                            "kind": "item",
                            "particular": text,
                            "price_mmk": None,
                            "score": lab["score"],
                        }
                    )
                continue
            used_price.add(best)
            p = prices[best]
            out.append(
                {
                    "page": n,
                    "side": side,
                    "y": lab["y"],
                    "kind": "item",
                    "particular": text,
                    "price_mmk": price_value(p["text"]),
                    "score": min(lab["score"], p["score"]),
                }
            )
        for i, p in enumerate(prices):
            if i not in used_price:
                out.append(
                    {
                        "page": n,
                        "side": side,
                        "y": p["y"],
                        "kind": "orphan_price",
                        "particular": "",
                        "price_mmk": price_value(p["text"]),
                        "score": p["score"],
                    }
                )

    parse_col(left, "L")
    parse_col(right, "R")
    # Second pass: pair unpriced items with orphan prices on same side
    used_orphan_ids: set[int] = set()
    for side in ("L", "R"):
        unpriced = [r for r in out if r["side"] == side and r["kind"] == "item" and r["price_mmk"] is None]
        orphans = [(i, r) for i, r in enumerate(out) if r["side"] == side and r["kind"] == "orphan_price"]
        for item in unpriced:
            best_i = None
            best_d = 1e9
            for i, o in orphans:
                if i in used_orphan_ids:
                    continue
                d = abs(o["y"] - item["y"])
                if d < best_d and d <= 35:
                    best_d = d
                    best_i = i
            if best_i is not None:
                item["price_mmk"] = out[best_i]["price_mmk"]
                used_orphan_ids.add(best_i)
    out = [r for i, r in enumerate(out) if i not in used_orphan_ids]
    out.sort(key=lambda r: (0 if r["side"] == "L" else 1, r["y"]))
    return out


def main() -> None:
    all_rows: list[dict] = []
    for n in range(1, 10):
        rows = parse_page(n)
        all_rows.extend(rows)
        (OUT / f"{n}-parsed.json").write_text(json.dumps(rows, indent=2), encoding="utf-8")
        print(
            f"page {n}: {sum(1 for r in rows if r['kind']=='item' and r['price_mmk'] is not None)} priced, "
            f"{sum(1 for r in rows if r['kind']=='item' and r['price_mmk'] is None)} unpriced, "
            f"{sum(1 for r in rows if r['kind']=='header')} headers, "
            f"{sum(1 for r in rows if r['kind']=='orphan_price')} orphans"
        )
    (OUT / "all-parsed.json").write_text(json.dumps(all_rows, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
