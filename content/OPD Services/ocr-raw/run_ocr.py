"""OCR upscaled OPD pages and dump structured lines for parsing."""
from __future__ import annotations

import json
from pathlib import Path

from rapidocr_onnxruntime import RapidOCR

src = Path(r"c:\Mudita_Software\Mudita-Hospital\content\OPD Services")
up = src / "ocr-raw" / "upscaled"
out = src / "ocr-raw"
engine = RapidOCR()

for n in range(1, 10):
    path = up / f"{n}.png"
    result, _ = engine(str(path))
    rows = []
    if result:
        for box, text, score in result:
            xs = [p[0] for p in box]
            ys = [p[1] for p in box]
            rows.append(
                {
                    "x": round(min(xs), 1),
                    "y": round(min(ys), 1),
                    "w": round(max(xs) - min(xs), 1),
                    "h": round(max(ys) - min(ys), 1),
                    "text": text,
                    "score": round(float(score), 3),
                }
            )
    rows.sort(key=lambda r: (r["y"], r["x"]))
    (out / f"{n}-rapid.json").write_text(json.dumps(rows, indent=2), encoding="utf-8")
    lines = [f"{r['y']:7.0f} {r['x']:7.0f} {r['score']:.2f}  {r['text']}" for r in rows]
    (out / f"{n}-rapid.txt").write_text("\n".join(lines), encoding="utf-8")
    print(f"{n}: {len(rows)} boxes")
