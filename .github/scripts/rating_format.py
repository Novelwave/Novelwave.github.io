"""Writes the App Store rating the way each page's language writes numbers.

update_app_store_rating.py and localize_home.py both fill the elements marked data-app-rating (the
average) and data-app-rating-count (a visible count), so a German page reads "4,8" and "1.234", and
a French one "4,8" and "1 234", rather than the English "4.8" and "1,234".

The pages show only the average now: the worldwide count read higher than the storefront's own on
the App Store page a visitor lands on. The count stays out of sight in the home's
data-app-rating-total attribute (plain digits), which the daily update still needs to tell a bad
fetch from lost ratings.
"""

import re

# (thousands separator, decimal separator) per <html lang>. French and Russian group thousands
# with a narrow no-break space, so a count never breaks across lines.
SEPARATORS = {
    "en": (",", "."),
    "de": (".", ","),
    "es": (".", ","),
    "it": (".", ","),
    "pt-BR": (".", ","),
    "ro": (".", ","),
    "fr": (" ", ","),
    "ru": (" ", ","),
}

AVERAGE = re.compile(r"(data-app-rating>)[^<]*(<)")
COUNT = re.compile(r"(data-app-rating-count>)[^<]*(<)")
TOTAL = re.compile(r'(data-app-rating-total=")[^"]*(")')


def language(page):
    match = re.search(r'<html lang="([^"]+)"', page)
    return match.group(1) if match and match.group(1) in SEPARATORS else "en"


def average_text(average, lang):
    return f"{average:.1f}".replace(".", SEPARATORS[lang][1])


def count_text(count, lang):
    return f"{count:,}".replace(",", SEPARATORS[lang][0])


def shown(page):
    """The (average, count) a page shows, whatever its separators, or None."""
    average = re.search(r"data-app-rating>([^<]+)<", page)
    count = re.search(r"data-app-rating-count>([^<]+)<", page) or re.search(r'data-app-rating-total="([^"]+)"', page)
    if not (average and count):
        return None
    digits = re.sub(r"\D", "", count.group(1))
    return float(average.group(1).replace(",", ".")), int(digits) if digits else 0


def write(page, average, count):
    """The page with the rating written in its own language's number format."""
    lang = language(page)
    page = AVERAGE.sub(lambda m: m.group(1) + average_text(average, lang) + m.group(2), page)
    page = TOTAL.sub(lambda m: m.group(1) + str(count) + m.group(2), page)
    return COUNT.sub(lambda m: m.group(1) + count_text(count, lang) + m.group(2), page)


def neutral(text):
    """Text with the rating's numbers taken out, so a translation keeps matching its English piece
    after the daily update changes the numbers."""
    return TOTAL.sub(r"\g<1>#\g<2>", COUNT.sub(r"\g<1>#\g<2>", AVERAGE.sub(r"\g<1>#\g<2>", text)))
