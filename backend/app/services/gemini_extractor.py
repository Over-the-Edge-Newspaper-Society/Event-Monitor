from __future__ import annotations

import base64
import json
import mimetypes
import os
import re
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

from ..models import Post, ExtractedEvent
from ..utils.image_downloader import IMAGES_DIR, download_image

try:  # pragma: no cover - dependency is optional for tests
    import google.generativeai as genai  # type: ignore
except ImportError:  # pragma: no cover
    genai = None  # type: ignore


GEMINI_PROMPT = """# AI Prompt for Event Poster Data Extraction

## Task
Extract all event information from this poster image and return it as structured JSON data.

## Instructions
Analyze the poster carefully and extract ALL available event information. If certain fields are not visible or clear, mark them as null rather than guessing.

## Required Output Format
Return ONLY a valid JSON object (no markdown, no explanation) in this exact structure:

{
  "events": [
    {
      "title": "Event name as shown on poster",
      "description": "Full description or tagline from poster",
      "startDate": "YYYY-MM-DD",
      "startTime": "HH:MM (24-hour format)",
      "endDate": "YYYY-MM-DD (if different from start)",
      "endTime": "HH:MM (if specified)",
      "timezone": "America/Vancouver (or appropriate timezone)",
      "venue": {
        "name": "Venue name",
        "address": "Full street address if shown",
        "city": "City name",
        "region": "Province/State",
        "country": "Country"
      },
      "organizer": "Organization or person hosting",
      "category": "Concert/Workshop/Festival/Sports/Theatre/Community/etc",
      "price": "Price information as shown (e.g., '$20', 'Free', '$15-25')",
      "tags": ["tag1", "tag2"],
      "registrationUrl": "URL if shown",
      "contactInfo": {
        "phone": "Phone number if shown",
        "email": "Email if shown",
        "website": "Website if shown"
      },
      "additionalInfo": "Any other relevant details from poster"
    }
  ],
  "extractionConfidence": {
    "overall": 0.95,
    "notes": "Any issues or uncertainties in extraction"
  }
}

## Field Guidelines

### Dates and Times
- Extract dates in YYYY-MM-DD format
- Use 24-hour time format (HH:MM)
- If only month/day shown, assume current or next year based on context
- If time shows "7 PM" convert to "19:00"
- If date shows "Every Tuesday", note in additionalInfo and use next occurrence

### Venue Information
- Extract complete venue name (e.g., "Prince George Civic Centre")
- Include full address if visible
- Default to city shown on poster or organization location

### Categories (use one of these)
- Concert
- Workshop
- Festival
- Sports
- Theatre
- Comedy
- Conference
- Community
- Education
- Fundraiser
- Market
- Exhibition
- Other

### Price
- Keep original format shown on poster
- "Free" for no-cost events
- Include all pricing tiers if shown (e.g., "$20 advance, $25 door")

### Missing Information
- Set field to null if not present
- Don't invent or guess information
- Note any ambiguities in extractionConfidence.notes

### Using Provided Context
- Additional context may include the Instagram post publication timestamp.
- Prefer event years that are the same as or after that publication date unless the poster explicitly shows an earlier year.
- When the poster omits the year, use the publication year if the month/day are on or after the post date; otherwise assume the following year.
- If the poster clearly states a year, use that value even if it conflicts with the guidance above.

Remember: Output ONLY the JSON object, no additional text or formatting."""


GEMINI_MODEL_ID = os.getenv("GEMINI_MODEL_ID", "gemini-2.5-flash")

CODE_FENCE_PATTERN = re.compile(r"```(?:json)?|```", re.IGNORECASE)
JSON_OBJECT_PATTERN = re.compile(r"\{[\s\S]*\}")


class GeminiExtractionError(Exception):
    """Base class for Gemini extraction failures."""


class GeminiClientUnavailable(GeminiExtractionError):
    """Raised when the Gemini SDK is not available."""


class GeminiApiKeyMissing(GeminiExtractionError):
    """Raised when no API key is configured."""


def _ensure_model(api_key: str):
    if not genai:  # pragma: no cover - dependency check
        raise GeminiClientUnavailable("google-generativeai package is not installed")
    if not api_key:
        raise GeminiApiKeyMissing("Gemini API key is not configured")
    genai.configure(api_key=api_key)
    return genai.GenerativeModel(GEMINI_MODEL_ID)


def _clean_response_text(raw_text: str) -> str:
    cleaned = CODE_FENCE_PATTERN.sub("", raw_text or "").strip()
    return cleaned


def _parse_json_from_text(raw_text: str) -> Dict[str, Any]:
    cleaned = _clean_response_text(raw_text)
    if not cleaned:
        raise GeminiExtractionError("Gemini response did not include any JSON content")
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        match = JSON_OBJECT_PATTERN.search(cleaned)
        if match:
            return json.loads(match.group(0))
        raise GeminiExtractionError("Failed to parse Gemini response as JSON")


def _guess_mime_from_filename(filename: str) -> str:
    mime_type, _ = mimetypes.guess_type(filename)
    return mime_type or "image/jpeg"


def load_post_image(post: Post) -> Tuple[bytes, str, Optional[str]]:
    """Return image bytes, MIME type, and optionally a newly downloaded filename."""

    if post.local_image_path:
        local_path = Path(IMAGES_DIR) / post.local_image_path
        if local_path.exists():
            return local_path.read_bytes(), _guess_mime_from_filename(local_path.name), None

    if not post.image_url:
        raise GeminiExtractionError("Post does not have an accessible image")

    downloaded_filename = download_image(post.image_url, post.instagram_id)
    if not downloaded_filename:
        raise GeminiExtractionError("Failed to download post image for Gemini extraction")

    local_path = Path(IMAGES_DIR) / downloaded_filename
    if not local_path.exists():
        raise GeminiExtractionError("Downloaded image could not be found on disk")

    return local_path.read_bytes(), _guess_mime_from_filename(local_path.name), downloaded_filename


def extract_event_json(
    image_bytes: bytes,
    mime_type: str,
    api_key: str,
    caption: Optional[str] = None,
    post_timestamp: Optional[datetime] = None,
) -> Dict[str, Any]:
    model = _ensure_model(api_key)
    image_part = {
        "inline_data": {
            "data": base64.b64encode(image_bytes).decode("utf-8"),
            "mime_type": mime_type,
        }
    }
    prompt_part = {"text": GEMINI_PROMPT}

    parts = [image_part, prompt_part]

    context_sections = []
    if post_timestamp:
        ts = post_timestamp.replace(microsecond=0)
        timestamp_text = ts.isoformat()
        context_sections.append(
            "Instagram post publication details:\n"
            f"- Published on {timestamp_text}.\n"
            "- Treat events as upcoming relative to this date unless the poster clearly indicates an earlier year."
        )

    if caption:
        context_sections.append(f"Instagram caption (additional context):\n{caption}")

    if context_sections:
        parts.append({"text": "Additional context:\n" + "\n\n".join(context_sections)})

    try:
        response = model.generate_content(parts)
    except Exception as exc:  # pragma: no cover - network/API failures
        raise GeminiExtractionError(f"Gemini API error: {exc}") from exc

    text = getattr(response, "text", None)
    if not text:
        # Some responses require iterating candidates when .text is empty
        for candidate in getattr(response, "candidates", []) or []:
            if candidate and getattr(candidate, "content", None):
                parts = getattr(candidate.content, "parts", None)
                if not parts:
                    continue
                joined = "\n".join(str(getattr(part, "text", "")) for part in parts if getattr(part, "text", ""))
                if joined.strip():
                    text = joined
                    break
    if not text:
        raise GeminiExtractionError("Gemini response did not include text output")

    return _parse_json_from_text(text)


def extract_event_data_for_post(post: Post, api_key: str) -> Tuple[Dict[str, Any], Optional[str]]:
    """Extract event JSON for a post and return payload plus optional new local filename."""

    image_bytes, mime_type, downloaded_filename = load_post_image(post)
    result = extract_event_json(
        image_bytes,
        mime_type,
        api_key,
        caption=post.caption,
        post_timestamp=post.post_timestamp,
    )
    return result, downloaded_filename


def auto_extract_for_post(post: Post, settings, *, overwrite: bool = False) -> bool:
    """Auto-run Gemini extraction when enabled; swallow errors and report success status."""

    if not getattr(settings, "gemini_auto_extract", False):
        return False

    api_key = (getattr(settings, "gemini_api_key", "") or "").strip() or os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        return False

    if post.extracted_event and not overwrite:
        return False

    try:
        payload, downloaded_filename = extract_event_data_for_post(post, api_key)
    except GeminiExtractionError as exc:  # pragma: no cover - network failures
        print(f"Gemini auto extraction failed for post {post.instagram_id}: {exc}")
        return False

    if downloaded_filename and downloaded_filename != post.local_image_path:
        post.local_image_path = downloaded_filename

    extraction_confidence = None
    confidence_payload = None
    if isinstance(payload, dict):
        confidence_payload = payload.get("extractionConfidence")
    if isinstance(confidence_payload, dict):
        overall = confidence_payload.get("overall")
        try:
            extraction_confidence = float(overall) if overall is not None else None
        except (TypeError, ValueError):
            extraction_confidence = None

    if post.extracted_event:
        post.extracted_event.event_data_json = payload
        if extraction_confidence is not None:
            post.extracted_event.extraction_confidence = extraction_confidence
    else:
        post.extracted_event = ExtractedEvent(
            post_id=post.id,
            event_data_json=payload,
            extraction_confidence=extraction_confidence,
        )

    post.processed = True
    return True
