import sqlite3
from pathlib import Path

db = Path(r"c:\Mudita_Software\Mudita-Hospital\server\data\mudita.db")
c = sqlite3.connect(db)
print("services", c.execute("select count(*) from services").fetchone()[0])
print(
    "sample",
    c.execute(
        "select code,name,price_mmk from services where code like 'ECG%' order by code"
    ).fetchall(),
)
print(
    "audit",
    c.execute(
        "select action, entity, detail from audit_logs where action='csv_import' order by id desc limit 1"
    ).fetchall(),
)
