import sqlite3
import pandas as pd
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
DB_PATH = DATA_DIR / "askmiro.db"
CSV_PATH = DATA_DIR / "askmiro_london_leads.csv"

def main():
    if not CSV_PATH.exists():
        raise FileNotFoundError(f"CSV not found: {CSV_PATH}")

    df = pd.read_csv(CSV_PATH)
    print(f"Loaded {len(df):,} rows from {CSV_PATH.name}")

    conn = sqlite3.connect(DB_PATH)

    df.to_sql("raw_leads", conn, if_exists="replace", index=False)

    cols = set(df.columns)
    if "place_id" in cols:
        conn.execute("CREATE INDEX IF NOT EXISTS idx_raw_place_id ON raw_leads(place_id)")
    if "borough" in cols:
        conn.execute("CREATE INDEX IF NOT EXISTS idx_raw_borough ON raw_leads(borough)")

    conn.commit()
    conn.close()

    print(f"Imported {len(df):,} rows into raw_leads in {DB_PATH}")

if __name__ == "__main__":
    main()
