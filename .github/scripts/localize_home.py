#!/usr/bin/env python3
"""Builds the translated home pages (de/, es/, fr/, it/, pt-br/, ro/, ru/) from index.html.

    python3 .github/scripts/localize_home.py extract   # writes .github/i18n/strings.json
    python3 .github/scripts/localize_home.py build     # writes <folder>/index.html per language

index.html stays the source. `extract` lists every piece of text a reader sees or hears there: a
paragraph, heading, list item or button with its inline markup (`<strong>`, `<a>`, `<span>`), the
loose text around them, and the alt, aria-label, title, data-chapter and meta texts. Each
`.github/i18n/<language>.json` maps those English pieces to translations, keeping the inline tags.
`build` swaps them in, points paths one folder up, and sets the language, canonical URL, social
card and current language link. It also gives every App Store link, the Smart App Banner and the
QR codes a campaign token of their own per language (ct=web-de-hero), redrawing each QR code for
its new URL; drawn codes are kept in qr-codes.json, and a new one is drawn with qr.swift (macOS).
Where `images/<folder>/` holds a screenshot taken in that language (an AVIF copy only), the
page's AVIF sources use it; the English PNGs stay as the fallback.
It marks links to the English-only subpages and guides hreflang="en", writes the App Store rating
in the language's number format, and gives the app's structured data the translated description.
A piece with no translation stays in English and is listed, so after
editing index.html run `extract`, add the new pieces to every language file, then `build`.
Anything inside an element marked translate="no" (quotes, the language list) stays as it is.
"""

import html
import json
import re
import subprocess
import sys
from pathlib import Path

from rating_format import neutral, shown as shown_rating, write as write_rating

SCRIPTS = Path(__file__).resolve().parent
SITE = SCRIPTS.parents[1]
I18N = SITE / ".github" / "i18n"
QR_CODES = SCRIPTS / "qr-codes.json"
LANGUAGES = {"de": "de", "es": "es", "fr": "fr", "it": "it", "pt-BR": "pt-br", "ro": "ro", "ru": "ru"}
OG_LOCALES = {"de": "de_DE", "es": "es_ES", "fr": "fr_FR", "it": "it_IT", "pt-BR": "pt_BR", "ro": "ro_RO", "ru": "ru_RU"}

UNIT_TAGS = "p|h1|h2|h3|li|dt|dd|figcaption|blockquote|title|button"
BLOCKING = UNIT_TAGS + "|div|ul|ol|section|picture|img|svg|nav|header|footer|main|figure|audio|source"
UNIT = re.compile(
    rf"<({UNIT_TAGS})(\s[^>]*)?>((?:(?!</?(?:{BLOCKING})\b).)*?)</\1>", re.S
)
ATTRIBUTES = re.compile(r'\s(alt|aria-label|title|data-chapter)="([^"]*[A-Za-z][^"]*)"')
META = re.compile(r'(<meta (?:name="description"|property="og:(?:title|description|image:alt)") content=")([^"]+)(")')


def normalize(text):
    return re.sub(r"\s+", " ", text).strip()


def skipped_ranges(source):
    """Script, style and svg contents, and every element marked translate="no".

    An svg's range starts after its opening tag, so a label on the svg itself (the QR codes'
    aria-label) is still translated while its drawing isn't read."""
    ranges = [(m.end(1) if m.group(1) else m.start(), m.end()) for m in re.finditer(r"(<svg\b[^>]*>).*?</svg>|<(?:script|style)\b.*?</(?:script|style)>", source, re.S)]
    for match in re.finditer(r'<(\w+)\b[^>]*\stranslate="no"[^>]*>', source):
        tag, depth, position = match.group(1), 1, match.end()
        pattern = re.compile(rf"<(/?){tag}\b[^>]*>")
        while depth:
            inner = pattern.search(source, position)
            if not inner:
                break
            depth += -1 if inner.group(1) else 1
            position = inner.end()
        ranges.append((match.start(), position))
    return ranges


def inside(position, ranges):
    return any(start <= position < end for start, end in ranges)


def pieces(source):
    """(start, end, english) for every translatable piece of text, in document order."""
    skip = skipped_ranges(source)
    found = []
    taken = []

    for match in UNIT.finditer(source):
        start, end = match.span(3)
        text = normalize(match.group(3))
        if inside(match.start(), skip) or not re.search(r"[A-Za-z]", re.sub(r"<[^>]+>", "", text)):
            continue
        found.append((start, end, text))
        taken.append((start, end))

    # Loose text that isn't part of a paragraph, heading or button above.
    for match in re.finditer(r">([^<>]*[A-Za-z][^<>]*)<", source):
        start, end = match.span(1)
        if inside(start, skip) or inside(start, taken):
            continue
        found.append((start, end, normalize(match.group(1))))

    for match in ATTRIBUTES.finditer(source):
        if inside(match.start(), skip):
            continue
        found.append((*match.span(2), match.group(2)))

    for match in META.finditer(source):
        found.append((*match.span(2), match.group(2)))

    strings = re.search(r'(<script type="application/json" id="page-strings">)(.*?)(</script>)', source, re.S)
    if strings:
        for key, value in json.loads(strings.group(2)).items():
            found.append((None, None, value))

    return sorted(found, key=lambda piece: piece[0] if piece[0] is not None else -1)


def extract():
    source = (SITE / "index.html").read_text()
    english = []
    for _, _, text in pieces(source):
        if text not in english:
            english.append(text)
    I18N.mkdir(parents=True, exist_ok=True)
    (I18N / "strings.json").write_text(json.dumps(english, ensure_ascii=False, indent=2) + "\n")
    print(f"{len(english)} pieces of text in .github/i18n/strings.json")


def relocate(source):
    """Points relative paths one folder up, since each language has its own folder."""

    def up(url):
        url = url.strip()
        if not url or re.match(r"^(?:[a-z]+:|/|#)", url):
            return url
        if url in ("./", "."):
            return "./"
        if url.startswith("./#"):
            return url[1:]
        return "../" + url

    source = re.sub(r'(\s(?:src|href)=")([^"]*)(")', lambda m: m.group(1) + up(m.group(2)) + m.group(3), source)
    source = re.sub(
        r'(\s(?:srcset|imagesrcset)=")([^"]*)(")',
        lambda m: m.group(1) + ", ".join(" ".join([up(part.split()[0])] + part.split()[1:]) for part in m.group(2).split(",")) + m.group(3),
        source,
    )
    return source


def localize_shots(page, folder):
    """Points the AVIF screenshots at this language's captures in images/<folder>/, where they exist."""
    shots = SITE / "images" / folder

    def swap(url):
        prefix = "../images/"
        if url.startswith(prefix) and url.endswith(".avif") and (shots / url[len(prefix):]).exists():
            return f"{prefix}{folder}/{url[len(prefix):]}"
        return url

    page = re.sub(
        r'(<source\s[^>]*?srcset=")([^"]*)(")',
        lambda m: m.group(1) + ", ".join(" ".join([swap(part.split()[0])] + part.split()[1:]) for part in m.group(2).split(",")) + m.group(3),
        page,
    )
    return page


def qr_code(url, codes):
    """The `viewBox|path` drawing of a QR code for url, drawn once and then kept in qr-codes.json."""
    if url not in codes:
        result = subprocess.run(["swift", str(SCRIPTS / "qr.swift"), url], capture_output=True, text=True, check=True)
        codes[url] = result.stdout.strip()
        QR_CODES.write_text(json.dumps(codes, indent=1) + "\n")
    return codes[url]


def tag_campaigns(page, folder, codes):
    """Gives each App Store link, the Smart App Banner and each QR code a token per language, so
    App Store Connect tells a German download from an English one, and redraws the QR codes."""
    page = page.replace("ct=web-", f"ct=web-{folder}-")

    def redraw(match):
        view_box, path = qr_code(html.unescape(match.group(2)), codes).split("|")
        return f'{match.group(1)}viewBox="{view_box}"{match.group(3)}d="{path}"'

    return re.sub(r'(<svg class="qr-code"[^>]*\sdata-qr="([^"]+)"[^>]*\s)viewBox="[^"]+"([^>]*><path [^>]*?)d="[^"]+"', redraw, page)


def mark_english_links(page):
    """Marks links to the subpages and guides, which are English only, so browsers and readers
    know the language changes; the stylesheet adds a visible "EN" to the ones inside <main>."""
    return re.sub(r'(<a\b(?![^>]*\shreflang=)[^>]*?\shref="\.\./[^"]+\.html(?:#[^"]*)?")', r'\1 hreflang="en"', page)


def describe_app(page):
    """Gives the MobileApplication node the page's translated meta description. The WebSite and
    Organization nodes and the app's url stay on the site root, since they describe the whole site."""
    description = re.search(r'<meta name="description" content="([^"]+)"', page)
    if not description:
        return page
    text = json.dumps(html.unescape(description.group(1)), ensure_ascii=False)
    return re.sub(
        r'("@type": "MobileApplication".*?"description": )"(?:[^"\\]|\\.)*"',
        lambda m: m.group(1) + text,
        page,
        count=1,
        flags=re.S,
    )


# A heading's eyebrow and a caption's bold title are followed by a space, so their words stay apart
# when the stylesheet doesn't apply (reader views, copied text). Translations keyed without that
# space still match, and get it back, until the translator updates their keys.
RUN_IN = re.compile(r'^(<(?:span class="eyebrow"|strong)>[^<]*</(?:span|strong)>) ')
RUN_IN_JOINED = re.compile(r'^(<(?:span class="eyebrow"|strong)>[^<]*</(?:span|strong)>)(?=\S)')


def translate(table, text):
    """The translation of text, or None. A piece whose only change is a no-break space keeps its old
    translation until the translator updates it, and so does one that only gained a run-in's space."""
    for key in (text, neutral(text), neutral(text).replace("&nbsp;", " ")):
        if key in table:
            return table[key]
    joined = RUN_IN.sub(r"\1", text, count=1)
    if joined != text:
        translation = translate(table, joined)
        if translation is not None:
            return RUN_IN_JOINED.sub(r"\1 ", translation, count=1)
    return None


# A spaced dash ("gehören – samt", "CarPlay — а") stays on the line of the word before it in every
# language, so no line starts with a dash. Russian also keeps a one-letter preposition or conjunction
# ("в", "и", "с", "у"…) on the line of the word after it, as Russian typesetting does, so no line ends
# on "у" or "с". Only text that's read on the page gets the no-break spaces, not attributes, meta texts
# or the scripts' strings.
NO_BREAK_BEFORE_DASH = re.compile(r" ([–—]) ")
NO_BREAK_AFTER = {"ru": re.compile(r"(?<!\w)([авикосуяАВИКОСУЯ]) ")}


def keep_together(language, text):
    text = NO_BREAK_BEFORE_DASH.sub(r"&nbsp;\1 ", text)
    pattern = NO_BREAK_AFTER.get(language)
    return pattern.sub(r"\1&nbsp;", text) if pattern else text


def build():
    source = (SITE / "index.html").read_text()
    found = pieces(source)
    codes = json.loads(QR_CODES.read_text()) if QR_CODES.exists() else {}
    rating = shown_rating(source)
    exit_code = 0

    for language, folder in LANGUAGES.items():
        table = json.loads((I18N / f"{language}.json").read_text())
        # Matched without the rating's numbers, which the daily update changes in index.html.
        table.update({neutral(english): translation for english, translation in table.items()})
        missing = []
        page = source

        for start, end, text in reversed([piece for piece in found if piece[0] is not None]):
            translation = translate(table, text)
            if translation is None:
                missing.append(text)
                continue
            # Keeps the spaces around a piece, which separate it from the markup next to it.
            original = page[start:end]
            # Attribute and meta texts sit right after their opening quote.
            if source[start - 1] != '"':
                translation = keep_together(language, translation)
            lead = original[: len(original) - len(original.lstrip())]
            trail = original[len(original.rstrip()):]
            page = page[:start] + lead + translation + trail + page[end:]

        strings = re.search(r'(<script type="application/json" id="page-strings">)(.*?)(</script>)', page, re.S)
        if strings:
            values = json.loads(strings.group(2))
            for key, value in values.items():
                if value in table:
                    values[key] = table[value]
                else:
                    missing.append(value)
            page = page[: strings.start(2)] + "\n    " + json.dumps(values, ensure_ascii=False) + "\n    " + page[strings.end(2):]

        page = relocate(page)
        page = localize_shots(page, folder)
        page = page.replace('<html lang="en" data-page="home">', f'<html lang="{language}" data-page="home">')
        page = page.replace(
            '<link rel="canonical" href="https://www.novelwave.app/">',
            f'<link rel="canonical" href="https://www.novelwave.app/{folder}/">',
        )
        page = page.replace(
            '<meta property="og:url" content="https://www.novelwave.app/">',
            f'<meta property="og:url" content="https://www.novelwave.app/{folder}/">',
        )
        # This language becomes og:locale, and English one of the alternates.
        page = page.replace(
            f'<meta property="og:locale:alternate" content="{OG_LOCALES[language]}">',
            '<meta property="og:locale:alternate" content="en_US">',
        )
        page = page.replace('<meta property="og:locale" content="en_US">', f'<meta property="og:locale" content="{OG_LOCALES[language]}">')
        # The social card in this language, with its headline, when one has been made.
        if (SITE / "images" / f"social-card-{folder}.jpg").exists():
            page = page.replace("/images/social-card.jpg", f"/images/social-card-{folder}.jpg")
        page = tag_campaigns(page, folder, codes)
        if rating:
            page = write_rating(page, *rating)
        page = mark_english_links(page)
        page = describe_app(page)
        page = page.replace('<a href="/" aria-current="page" hreflang="en"', '<a href="/" hreflang="en"')
        page = page.replace(f'<a href="/{folder}/" hreflang="{language}"', f'<a href="/{folder}/" aria-current="page" hreflang="{language}"')

        (SITE / folder).mkdir(exist_ok=True)
        (SITE / folder / "index.html").write_text(page)

        if missing:
            exit_code = 1
            print(f"{language}: {len(missing)} pieces still in English:")
            for text in dict.fromkeys(missing):
                print(f"  {text[:110]}")
        else:
            print(f"{language}: {folder}/index.html")

    return exit_code


if __name__ == "__main__":
    command = sys.argv[1] if len(sys.argv) > 1 else ""
    if command == "extract":
        extract()
    elif command == "build":
        sys.exit(build())
    else:
        print(__doc__)
        sys.exit(2)
