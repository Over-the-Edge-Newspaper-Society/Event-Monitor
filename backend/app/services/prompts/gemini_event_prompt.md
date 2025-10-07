# AI Prompt for Event Poster Data Extraction

## Task
Extract all event information from this poster image and return it as structured JSON data.

## Instructions
Analyze the poster carefully and extract ALL available event information. If certain fields are not visible or clear, mark them as null rather than guessing.

## Required Output Format
Return ONLY a valid JSON object (no markdown, no explanation) in this exact structure:

```json
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
      "occurrenceType": "single|multi_day|recurring|all_day|virtual",
      "recurrenceType": "none|daily|weekly|monthly|yearly|custom",
      "seriesDates": [
        {
          "start": "YYYY-MM-DDTHH:MM:SS",
          "end": "YYYY-MM-DDTHH:MM:SS"
        }
      ],
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
```

## Field Guidelines

### Dates and Times
- Extract dates in YYYY-MM-DD format
- Use 24-hour time format (HH:MM)
- If only month/day shown, assume current or next year based on context
- If time shows "7 PM" convert to "19:00"
- If date shows "Every Tuesday", note in additionalInfo and use next occurrence

### Occurrence Types and Series Events
**When the poster shows MULTIPLE specific dates** (e.g., "Oct 31, Nov 1, Nov 2" or "Friday-Sunday"):
- Set `occurrenceType: "recurring"`
- Set `recurrenceType: "custom"`
- Include ALL dates in `seriesDates` array with full start/end datetimes
- Set `startDate` and `startTime` to the FIRST occurrence
- Set `endDate` and `endTime` to match the FIRST occurrence (not the last)

**Occurrence Type Options:**
- `single` - Single day event (default)
- `multi_day` - Multi-day event (same continuous event, like a 3-day conference)
- `recurring` - Multiple separate occurrences (like a fair running 3 different days)
- `all_day` - All-day event with no specific times
- `virtual` - Online/virtual event

**Recurrence Type Options:**
- `none` - Does not repeat (default for single events)
- `custom` - Specific dates listed (use for irregular patterns)
- `daily` - Repeats daily
- `weekly` - Repeats weekly
- `monthly` - Repeats monthly
- `yearly` - Repeats yearly

**Series Dates Format:**
- Each entry in `seriesDates` should have ISO 8601 datetime format
- Include timezone in datetime (e.g., "2025-10-31T10:00:00-07:00")
- If end time not specified, calculate reasonable duration or set same as start

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

## Examples

### Example 1: Single Event
For a poster showing:
"SUMMER CONCERT SERIES
July 15, 2024 • 7:00 PM
Fort George Park
Featuring: Local Band
Free Admission"

Return:
```json
{
  "events": [{
    "title": "Summer Concert Series",
    "description": "Featuring: Local Band",
    "startDate": "2024-07-15",
    "startTime": "19:00",
    "endDate": null,
    "endTime": null,
    "timezone": "America/Vancouver",
    "occurrenceType": "single",
    "recurrenceType": "none",
    "seriesDates": null,
    "venue": {
      "name": "Fort George Park",
      "address": null,
      "city": "Prince George",
      "region": "BC",
      "country": "Canada"
    },
    "organizer": null,
    "category": "Concert",
    "price": "Free",
    "tags": ["music", "outdoor", "summer"],
    "registrationUrl": null,
    "contactInfo": {
      "phone": null,
      "email": null,
      "website": null
    },
    "additionalInfo": null
  }],
  "extractionConfidence": {
    "overall": 0.90,
    "notes": "Organizer not specified on poster"
  }
}
```

### Example 2: Multi-Date Recurring Event
For a poster showing:
"STUDIO FAIR 2025
October 31 - November 2
Friday 10am-8pm
Saturday 10am-6pm
Sunday 10am-4pm
CN Centre
$10 admission"

Return:
```json
{
  "events": [{
    "title": "Studio Fair 2025",
    "description": "Professional artisan fair featuring local crafts",
    "startDate": "2025-10-31",
    "startTime": "10:00",
    "endDate": "2025-10-31",
    "endTime": "20:00",
    "timezone": "America/Vancouver",
    "occurrenceType": "recurring",
    "recurrenceType": "custom",
    "seriesDates": [
      {
        "start": "2025-10-31T10:00:00-07:00",
        "end": "2025-10-31T20:00:00-07:00"
      },
      {
        "start": "2025-11-01T10:00:00-07:00",
        "end": "2025-11-01T18:00:00-07:00"
      },
      {
        "start": "2025-11-02T10:00:00-08:00",
        "end": "2025-11-02T16:00:00-08:00"
      }
    ],
    "venue": {
      "name": "CN Centre",
      "address": null,
      "city": "Prince George",
      "region": "BC",
      "country": "Canada"
    },
    "organizer": null,
    "category": "Market",
    "price": "$10",
    "tags": ["artisan", "crafts", "market"],
    "registrationUrl": null,
    "contactInfo": {
      "phone": null,
      "email": null,
      "website": null
    },
    "additionalInfo": "Fair runs different hours each day"
  }],
  "extractionConfidence": {
    "overall": 0.95,
    "notes": "All dates and times clearly specified"
  }
}
```

Remember: Output ONLY the JSON object, no additional text or formatting.