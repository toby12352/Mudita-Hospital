from PIL import Image, ImageOps, ImageEnhance
from pathlib import Path

src = Path(r"c:\Mudita_Software\Mudita-Hospital\content\OPD Services")
out = src / "ocr-raw" / "upscaled"
out.mkdir(parents=True, exist_ok=True)
for n in range(1, 10):
    im = Image.open(src / f"{n}.png").convert("L")
    w, h = im.size
    im2 = im.resize((w * 4, h * 4), Image.Resampling.LANCZOS)
    im2 = ImageOps.autocontrast(im2)
    im2 = ImageEnhance.Contrast(im2).enhance(1.5)
    path = out / f"{n}.png"
    im2.save(path)
    print(n, im.size, "->", im2.size)
