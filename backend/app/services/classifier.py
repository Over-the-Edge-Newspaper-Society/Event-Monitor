from __future__ import annotations

from pathlib import Path
from typing import Optional, Tuple

import pickle

MODEL_PATH = Path(__file__).resolve().parent.parent / "event_classifier.pkl"


class CaptionClassifier:
    def __init__(self) -> None:
        self.event_keywords = {
            "event",
            "concert",
            "festival",
            "workshop",
            "seminar",
            "conference",
            "party",
            "celebration",
            "fundraiser",
            "gala",
            "show",
            "performance",
            "exhibition",
            "market",
            "fair",
            "competition",
            "tournament",
            "meetup",
            "class",
            "rehearsal",
            "tour",
            "open mic",
            "screening",
        }
        self.poster_keywords = {
            "poster",
            "flyer",
            "announcement",
            "coming soon",
            "presenting",
            "featuring",
            "live music",
            "food trucks",
            "family friendly",
            "all ages",
            "free admission",
            "ticket",
            "rsvp",
            "register",
            "save the date",
            "doors open",
            "starts at",
        }
        self.month_keywords = {
            "january",
            "february",
            "march",
            "april",
            "may",
            "june",
            "july",
            "august",
            "september",
            "october",
            "november",
            "december",
        }
        self.model = None
        if MODEL_PATH.exists():
            try:
                with MODEL_PATH.open("rb") as fh:
                    self.vectorizer, self.model = pickle.load(fh)
            except Exception:
                self.model = None
                self.vectorizer = None
        else:
            self.vectorizer = None

    def classify(self, caption: Optional[str]) -> Tuple[bool, float]:
        if not caption:
            return False, 0.0
        caption_lower = caption.lower()

        if self.model and self.vectorizer:
            try:
                vector = self.vectorizer.transform([caption_lower])
                prediction = self.model.predict(vector)[0]
                confidence = float(self.model.predict_proba(vector)[0].max())
                return bool(prediction), confidence
            except Exception:
                pass

        event_score = sum(1 for keyword in self.event_keywords if keyword in caption_lower)
        event_score += sum(1 for keyword in self.month_keywords if keyword in caption_lower)
        poster_score = sum(1 for keyword in self.poster_keywords if keyword in caption_lower)
        total_score = event_score + poster_score

        if total_score >= 3:
            confidence = min(0.95, 0.5 + total_score * 0.1)
            return True, confidence
        if total_score >= 1:
            confidence = min(0.75, 0.3 + total_score * 0.1)
            return True, confidence
        return False, 0.1
