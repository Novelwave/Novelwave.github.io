#!/usr/bin/env python3
"""Checks .github/i18n/<language>.json against strings.json: every piece translated, the same
HTML tags and attributes, placeholders and entities kept, and no word for "free".
    python3 .github/scripts/check_translation.py de
"""
import json, re, sys
from pathlib import Path
I18N = Path(__file__).resolve().parents[1] / "i18n"
FREE = re.compile(r"\b(free|kostenlos|gratis|umsonst|gratuit|gratuita|gratuito|gratuite|libre de pago|бесплатн|gratuită|gratuit)\w*", re.I)
language = sys.argv[1]
english = json.loads((I18N / "strings.json").read_text())
table = json.loads((I18N / f"{language}.json").read_text())
problems = []
for text in english:
    if text not in table:
        problems.append(f"missing: {text[:90]}"); continue
    translated = table[text]
    tags = lambda s: sorted(re.findall(r"<[^>]+>", s))
    if tags(text) != tags(translated):
        problems.append(f"tags differ: {text[:90]}")
    for token in re.findall(r"\{\w+\}|&\w+;", text):
        if translated.count(token) != text.count(token):
            problems.append(f"lost {token}: {text[:90]}")
    stripped = re.sub(r"DRM[\s‑-]?(free|frei|libre|liberi|livre|liber|без)\w*", "", translated, flags=re.I)
    if FREE.search(stripped):
        problems.append(f"says free: {translated[:90]}")
extra = [k for k in table if k not in english]
print(f"{language}: {len(english) - len([p for p in problems if p.startswith('missing')])}/{len(english)} translated, {len(problems)} problems, {len(extra)} unused keys")
for p in problems: print("  " + p)
sys.exit(1 if problems else 0)
