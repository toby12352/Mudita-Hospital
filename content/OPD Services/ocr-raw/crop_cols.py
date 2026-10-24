"""Crop left/right name columns (exclude Kyat) for vision transcription."""
from __future__ import annotations

import json
from pathlib import Path

from PIL import Image

SRC = Path(r"c:\Mudita_Software\Mudita-Hospital\content\OPD Services")
UP = SRC / "ocr-raw" / "upscaled"
OUT = SRC / "ocr-raw" / "cols"
OUT.mkdir(parents=True, exist_ok=True)


def load(n: int) -> list[dict]:
    return json.loads((SRC / "ocr-raw" / f"{n}-rapid.json").read_text(encoding="utf-8"))


def main() -> None:
    for n in range(1, 10):
        boxes = load(n)
        kyats = [b for b in boxes if b["text"].strip().lower() == "kyat"]
        particulars = [b for b in boxes if b["text"].strip().lower() == "particular"]
        im = Image.open(UP / f"{n}.png")
        w, h = im.size

        if len(particulars) >= 2 and len(kyats) >= 2:
            # left name: from left particular to left kyat
            # right name: from right particular to right kyat
            parts = sorted(particulars, key=lambda b: b["x"])
            kys = sorted(kyats, key=lambda b: b["x"])
            left_x0 = max(0, int(parts[0]["x"]) - 10)
            left_x1 = int(kys[0]["x"]) - 5
            right_x0 = max(0, int(parts[1]["x"]) - 10)
            right_x1 = int(kys[1]["x"]) - 5
            # start below header row
            y0 = int(max(parts[0]["y"], parts[1]["y"]) + max(parts[0]["h"], parts[1]["h"]) + 5)
        else:
            left_x0, left_x1 = 0, int(w * 0.38)
            right_x0, right_x1 = int(w * 0.48), int(w * 0.86)
            y0 = int(h * 0.12)

        left = im.crop((left_x0, y0, left_x1, h))
        right = im.crop((right_x0, y0, right_x1, h))
        # split each column into top/bottom halves for clearer vision reads
        for side, crop in (("L", left), ("R", right)):
            cw, ch = crop.size
            mid = ch // 2
            crop.crop((0, 0, cw, mid + 40)).save(OUT / f"{n}-{side}-top.png")
            crop.crop((0, mid - 40, cw, ch)).save(OUT / f"{n}-{side}-bot.png")
            crop.save(OUT / f"{n}-{side}.png")
        print(n, "left", left.size, "right", right.size, "y0", y0)


if __name__ == "__main__":
    main()
