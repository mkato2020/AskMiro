"""
pdf_extractor.py — Local PDF extraction for AskMiro Sales OS.
Extracts text from PDFs and parses cleaning-relevant metadata.
Uses pdfminer.six for text extraction (no cloud dependency).
OCR for scanned PDFs is NOT implemented in this version — add later with pytesseract.
"""
import re
import logging
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

# Cleaning-relevant keywords to detect in documents
CLEANING_KEYWORDS = [
    'cleaning', 'cleaner', 'hygiene', 'sanitation', 'janitorial', 'washroom',
    'deep clean', 'contract clean', 'facilities', 'maintenance', 'housekeeping',
    'window cleaning', 'floor care', 'waste', 'disinfection', 'infection control',
    'daily', 'weekly', 'monthly', 'frequency', 'schedule', 'rota',
    'sq ft', 'sqft', 'square feet', 'square metres', 'sq m',
    'per visit', 'per week', 'per month', 'per annum', 'per year',
    'tender', 'bid', 'proposal', 'quote', 'quotation', 'estimate',
    'scope of works', 'specification', 'requirements', 'service level',
]

VALUE_PATTERNS = [
    r'£[\d,]+(?:\.\d{2})?(?:\s*(?:per\s+(?:month|week|annum|year|visit)|p\.?a\.?|p\.?m\.?))?',
    r'\d+(?:\.\d{2})?\s*(?:per\s+(?:month|week|annum|year|visit)|p\.?a\.?|p\.?m\.?)',
    r'(?:budget|value|contract|quote|price|cost)[:\s]+£?[\d,]+',
]

DATE_PATTERN = re.compile(
    r'\b(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s*\d{4})\b',
    re.IGNORECASE
)

EMAIL_PATTERN = re.compile(r'\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Z|a-z]{2,}\b')
PHONE_PATTERN = re.compile(r'(?:\+44\s?|0)(?:\d\s?){9,10}')
POSTCODE_PATTERN = re.compile(r'\b[A-Z]{1,2}\d{1,2}[A-Z]?\s?\d[A-Z]{2}\b', re.IGNORECASE)


def extract_text(file_path: str) -> tuple:
    """
    Extract raw text from a PDF file.
    Returns (text, status) where status is 'success', 'partial', or 'failed'.
    """
    try:
        from pdfminer.high_level import extract_text as _extract
        text = _extract(file_path)
        if not text or not text.strip():
            return "", "partial"  # Could be scanned — OCR not yet implemented
        return text.strip(), "success"
    except ImportError:
        logger.error("pdfminer.six not installed. Run: pip install pdfminer.six")
        return "", "failed"
    except Exception as e:
        logger.error("PDF extraction failed for %s: %s", file_path, e)
        return "", "failed"


def parse_document(text: str) -> dict:
    """Parse cleaning-relevant info from extracted text."""
    if not text:
        return {}

    lower = text.lower()

    # Contacts: emails + phones
    emails = list(set(EMAIL_PATTERN.findall(text)))
    phones = list(set(PHONE_PATTERN.findall(text)))
    contacts = [{"type": "email", "value": e} for e in emails[:10]]
    contacts += [{"type": "phone", "value": p.strip()} for p in phones[:10]]

    # Postcodes -> addresses
    postcodes = list(set(POSTCODE_PATTERN.findall(text)))

    # Company name: look for common patterns
    company = None
    for line in text.split('\n')[:20]:
        line = line.strip()
        if len(line) > 3 and len(line) < 80 and not line.startswith('http'):
            company = company or line
            break

    # Dates
    dates = list(set(DATE_PATTERN.findall(text)))[:10]

    # Cleaning keywords found
    found_keywords = [kw for kw in CLEANING_KEYWORDS if kw in lower]

    # Value/pricing clues
    value_clues = {}
    for pattern in VALUE_PATTERNS:
        matches = re.findall(pattern, text, re.IGNORECASE)
        if matches:
            value_clues[pattern[:20]] = matches[:5]

    return {
        "contacts": contacts,
        "company": company,
        "address": postcodes[0] if postcodes else None,
        "dates": dates,
        "keywords": found_keywords,
        "value_clues": value_clues,
    }


def extract_and_parse(file_path: str) -> dict:
    """Full pipeline: extract text + parse metadata."""
    text, status = extract_text(file_path)
    parsed = parse_document(text) if text else {}
    return {
        "text": text,
        "status": status,
        "parsed": parsed,
    }
