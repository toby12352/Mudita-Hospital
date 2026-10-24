import json
from pathlib import Path

rows = json.loads(Path(__file__).with_name("all-parsed.json").read_text(encoding="utf-8"))
for r in rows:
    if r["kind"] == "header":
        print(f"p{r['page']} {r['side']} {r['score']:.2f}  {r['particular']}")
