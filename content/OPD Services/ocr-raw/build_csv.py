"""Build review CSVs from RapidOCR parse + lexicon fuzzy cleanup + codes."""
from __future__ import annotations

import csv
import json
import re
import unicodedata
from collections import Counter, defaultdict
import sys
from difflib import SequenceMatcher
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from ocr_fixes import apply_fix  # noqa: E402

SRC = Path(r"c:\Mudita_Software\Mudita-Hospital\content\OPD Services")
RAW = SRC / "ocr-raw"
PARSED = json.loads((RAW / "all-parsed.json").read_text(encoding="utf-8"))
LEXICON = [
    ln.strip()
    for ln in (RAW / "lexicon.txt").read_text(encoding="utf-8").splitlines()
    if ln.strip()
]

SECTION_PREFIX = {
    "General": "GEN",
    "ECG": "ECG",
    "Glucometer": "GLU",
    "Kaung Pyae Sone": "KPS",
    "Mudita Laboratory": "LAB",
    "Monitor": "MON",
    "OPD": "OPD",
    "Package": "PKG",
    "Shaving": "SHV",
    "Shwe Bhone": "SBH",
    "Ultrasound": "USG",
    "X-ray": "XRY",
}


def normalize_key(s: str) -> str:
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.lower()
    s = s.replace("_", " ")
    s = re.sub(r"[^a-z0-9&+/().,'\-\s]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def compact(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", s.lower())


def clean_particular(raw: str) -> str:
    s = raw.strip()
    s = s.replace("（", "(").replace("）", ")")
    s = re.sub(r"(?i)\bCharqe\b", "Charge", s)
    s = re.sub(r"(?i)\bAq\b", "Ag", s)
    s = re.sub(r"(?i)Iq([GMN])", r"Ig\1", s)
    s = re.sub(r"(?i)lq([GMN])", r"Ig\1", s)
    s = re.sub(r"(?i)\bAntl\b", "Anti", s)
    s = re.sub(r"(?i)\bAntI\b", "Anti", s)
    s = re.sub(r"(?i)\bArm-", "Anti-", s)
    s = re.sub(r"(?i)\bDkcount\b", "Discount", s)
    s = re.sub(r"(?i)\bDiccount\b", "Discount", s)
    s = re.sub(r"(?i)\bDodor\b", "Doctor", s)
    s = re.sub(r"(?i)\bDador\b", "Doctor", s)
    s = re.sub(r"(?i)\bDepolt\s*Retun\b", "Deposite Return", s)
    s = re.sub(r"(?i)\bPortobe\b", "Portable", s)
    s = re.sub(r"(?i)\bFumidicatilon\b", "Fumidication", s)
    s = re.sub(r"(?i)\bPscksqe\b", "Package", s)
    s = re.sub(r"(?i)\bPsckoqe\b", "Package", s)
    s = re.sub(r"(?i)\bPocksqe\b", "Package", s)
    s = re.sub(r"(?i)\bPackaas\b", "Package", s)
    s = re.sub(r"(?i)\bDepet\b", "Deposite", s)
    s = re.sub(r"(?i)\bDepee\b", "Deposite", s)
    s = re.sub(r"(?i)\bDepen\b", "Deposite", s)
    s = re.sub(r"(?i)\bDepem\b", "Deposite", s)
    s = re.sub(r"(?i)\bDepeem\b", "Deposite", s)
    s = re.sub(r"\s+", " ", s).strip()
    s = re.sub(r"\s+\(", "(", s)
    return s.strip()


def best_lexicon_match(particular: str) -> str:
    """Return lexicon name if close enough, else cleaned OCR text."""
    fixed = apply_fix(particular)
    if fixed:
        return fixed
    cleaned = clean_particular(particular)
    c_key = compact(cleaned)
    if not c_key:
        return cleaned
    # exact compact match
    for lex in LEXICON:
        if compact(lex) == c_key:
            return lex
    best = cleaned
    best_score = 0.0
    for lex in LEXICON:
        ratio = SequenceMatcher(None, c_key, compact(lex)).ratio()
        if ratio > best_score:
            best_score = ratio
            best = lex
    if best_score >= 0.78:
        return best
    n = normalize_key(cleaned)
    best2, score2 = cleaned, 0.0
    for lex in LEXICON:
        ratio = SequenceMatcher(None, n, normalize_key(lex)).ratio()
        if ratio > score2:
            score2 = ratio
            best2 = lex
    if score2 >= 0.74:
        return best2
    return cleaned


def build_rows() -> tuple[list[dict], list[dict]]:
    section_L = "General"
    section_R = "General"
    last_section = "General"
    kept: list[dict] = []
    skipped: list[dict] = []

    by_page: dict[int, list] = defaultdict(list)
    for r in PARSED:
        by_page[r["page"]].append(r)

    for page in range(1, 10):
        section_L = last_section
        section_R = last_section
        # Page 8 printout is an OPD block (header often missed by OCR).
        if page == 8:
            section_L = "OPD"
            section_R = "OPD"
            last_section = "OPD"
        for r in by_page[page]:
            side = r["side"]
            if r["kind"] == "header":
                sec = r["particular"]  # already canonical from parser
                if side == "L":
                    section_L = sec
                else:
                    section_R = sec
                last_section = sec
                continue
            if r["kind"] != "item":
                continue
            price = r.get("price_mmk")
            if price is None:
                continue
            particular = best_lexicon_match(r.get("particular") or "")
            if not particular or len(particular) < 2:
                continue
            # Implicit Monitor header before Monitor Used (page 3).
            if compact(particular) in {"monitorused", "monitarused"} and side == "L":
                section_L = "Monitor"
                last_section = "Monitor"
            # Implicit X-ray header once we see X-ray lines under Ultrasound.
            if side == "R" and (
                compact(particular).startswith("xray")
                or normalize_key(particular).startswith("x-ray")
                or normalize_key(particular).startswith("x ray")
            ):
                if section_R in {"Ultrasound", "Shwe Bhone", "OPD"}:
                    section_R = "X-ray"
                    last_section = "X-ray"
            sec = section_L if side == "L" else section_R
            last_section = sec
            if price < 0:
                skipped.append(
                    {
                        "page": page,
                        "section": sec,
                        "particular": particular,
                        "price_mmk": price,
                        "reason": "negative_discount",
                    }
                )
                continue
            kept.append(
                {
                    "page": page,
                    "section": sec,
                    "particular": particular,
                    "price_mmk": int(price),
                    "ocr_raw": r.get("particular") or "",
                }
            )
    return kept, skipped


def disambiguate_and_code(kept: list[dict]) -> list[dict]:
    name_counts = Counter(r["particular"] for r in kept)
    sec_part_prices: dict[tuple[str, str], list[int]] = defaultdict(list)
    for r in kept:
        sec_part_prices[(r["section"], r["particular"])].append(r["price_mmk"])

    used_names: Counter = Counter()
    seq: dict[str, int] = defaultdict(int)
    out = []
    for r in kept:
        particular = r["particular"]
        section = r["section"]
        price = r["price_mmk"]
        if name_counts[particular] > 1:
            name = f"{particular} ({section})"
        else:
            name = particular
        same = sec_part_prices[(section, particular)]
        if len(same) > 1 and used_names[name] > 0:
            name = f"{particular} ({section}, {price})"
        elif len(same) > 1 and same.count(price) != len(same) and used_names[name] >= 1:
            name = f"{particular} ({section}, {price})"
        # if still colliding after first use of same name
        if used_names[name] > 0:
            name = f"{particular} ({section}, {price})"
            if used_names[name] > 0:
                name = f"{name} #{used_names[name] + 1}"
        used_names[name] += 1

        prefix = SECTION_PREFIX.get(section, "SVC")
        seq[prefix] += 1
        code = f"{prefix}{seq[prefix]:03d}"
        out.append(
            {
                "section": section,
                "particular": particular,
                "price_mmk": price,
                "name": name,
                "code": code,
                "page": r["page"],
            }
        )
    return out


def main() -> None:
    kept, skipped = build_rows()
    rows = disambiguate_and_code(kept)

    csv_path = SRC / "opd-services.csv"
    with csv_path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["section", "particular", "price_mmk", "name", "code"])
        w.writeheader()
        for r in rows:
            w.writerow({k: r[k] for k in w.fieldnames})

    skip_path = SRC / "opd-services-skipped.csv"
    with skip_path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["page", "section", "particular", "price_mmk", "reason"])
        w.writeheader()
        for r in skipped:
            w.writerow(r)

    debug = RAW / "opd-services-debug.csv"
    with debug.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["page", "section", "particular", "price_mmk", "name", "code"])
        w.writeheader()
        for r in rows:
            w.writerow(r)

    print(f"kept={len(rows)} skipped={len(skipped)}")
    print("sections:", dict(Counter(r["section"] for r in rows)))
    print("zeros:", sum(1 for r in rows if r["price_mmk"] == 0))
    print("top prices:")
    for r in sorted(rows, key=lambda x: -x["price_mmk"])[:15]:
        print(f"  {r['price_mmk']:>10}  {r['name']}")
    print("sample names:")
    for r in rows[:12]:
        print(f"  [{r['code']}] {r['name']} = {r['price_mmk']}")


if __name__ == "__main__":
    main()
