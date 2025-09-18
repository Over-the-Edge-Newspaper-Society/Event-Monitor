from __future__ import annotations

import argparse
from pathlib import Path

from ..database import SessionLocal, engine
from ..models import Base
from ..utils.csv_loader import import_clubs_from_csv


def main() -> None:
    parser = argparse.ArgumentParser(description="Import Instagram clubs from CSV")
    parser.add_argument("csv_path", type=Path, help="Path to CSV file")
    args = parser.parse_args()

    if not args.csv_path.exists():
        raise SystemExit(f"CSV file not found: {args.csv_path}")

    Base.metadata.create_all(bind=engine)

    csv_text = args.csv_path.read_text(encoding="utf-8-sig")
    session = SessionLocal()
    try:
        created, updated = import_clubs_from_csv(session, csv_text)
    finally:
        session.close()

    print(f"Imported clubs. Created: {created}, Updated: {updated}")


if __name__ == "__main__":
    main()
