from __future__ import annotations

import csv
from io import StringIO
from typing import Tuple

from sqlalchemy.orm import Session

from ..models import Club


def import_clubs_from_csv(session: Session, csv_text: str) -> Tuple[int, int]:
    created = 0
    updated = 0
    # Remove UTF-8 BOM if present
    if csv_text.startswith('\ufeff'):
        csv_text = csv_text[1:]
    reader = csv.DictReader(StringIO(csv_text))
    for row in reader:
        # Support both original format and the clubs_instagram CSV format
        username = (row.get("username") or row.get("Instagram Handle") or "").strip()

        # Clean Instagram handle - remove @ symbol and extract from URL if needed
        if username.startswith("@"):
            username = username[1:]
        elif username.startswith("https://"):
            # Extract username from Instagram URL
            parts = username.split("/")
            username = parts[-2] if parts[-1] == "" else parts[-1]

        if not username:
            continue

        name = (row.get("name") or row.get("Club Name") or username).strip()
        active_value = (row.get("active") or "true").strip().lower()
        classification_mode = (row.get("classification_mode") or row.get("mode") or "auto").strip().lower()
        classification_mode = "manual" if classification_mode == "manual" else "auto"

        club = session.query(Club).filter(Club.username == username).one_or_none()
        if club:
            club.name = name
            club.active = active_value in {"true", "1", "yes", "y"}
            club.classification_mode = classification_mode
            updated += 1
        else:
            club = Club(
                name=name,
                username=username,
                active=active_value in {"true", "1", "yes", "y"},
                classification_mode=classification_mode,
            )
            session.add(club)
            session.flush()
            created += 1
    session.commit()
    return created, updated
