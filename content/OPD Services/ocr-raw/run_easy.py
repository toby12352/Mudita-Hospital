"""EasyOCR on upscaled pages."""
from __future__ import annotations

import json
from pathlib import Path

import easyocr

SRC = Path(r"c:\Mudita_Software\Mudita-Hospital\content\OPD Services")
UP = SRC / "ocr-raw" / "upscaled"
OUT = SRC / "ocr-raw"

reader = easyocr.Reader(["en"], gpu=False)
for n in range(1, 10):
    path = str(UP / f"{n}.png")
    print(f"easy {n}…", flush=True)
    result = reader.readtext(path, detail=1, paragraph=False)
    rows = []
    for box, text, score in result:
        xs = [p[0] for p in box]
        ys = [p[1] for p in box]
        rows.append(
            {
                "x": round(float(min(xs)), 1),
                "y": round(float(min(ys)), 1),
                "w": round(float(max(xs) - min(xs)), 1),
                "h": round(float(max(ys) - min(ys)), 1),
                "text": text,
                "score": round(float(score), 3),
            }
        )
    rows.sort(key=lambda r: (r["y"], r["x"]))
    (OUT / f"{n}-easy.json").write_text(json.dumps(rows, indent=2), encoding="utf-8")
    lines = [f"{r['y']:7.0f} {r['x']:7.0f} {r['score']:.2f}  {r['text']}" for r in rows]
    (OUT / f"{n}-easy.txt").write_text("\n".join(lines), encoding="utf-8")
    print(f"  {len(rows)} boxes", flush=True)
