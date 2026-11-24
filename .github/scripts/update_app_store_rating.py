"""Updates the App Store rating shown on the site.

Apple reports ratings per storefront, so this adds up every storefront's count and weights each
average by it, then writes the average into every element marked data-app-rating, and the count into
the home's hidden data-app-rating-total attribute (and any data-app-rating-count element). It
leaves the pages alone when too many lookups fail, or when the total drops sharply, since both point
at a bad fetch rather than lost ratings. Each page gets the numbers in its own language's format
(rating_format.py): "4,8" on the German home.
"""

import concurrent.futures
import json
import pathlib
import sys
import urllib.request

from rating_format import shown as shown_rating, write as write_rating

APP_ID = "6720100886"
SITE = pathlib.Path(__file__).resolve().parents[2]
STOREFRONTS = """
ae ag ai al am ao ar at au az ba bb be bf bg bh bj bm bn bo br bs bt bw by bz ca cd cg ch ci cl cm
cn co cr cv cy cz de dk dm do dz ec ee eg es fi fj fm fr ga gb gd ge gh gm gr gt gw gy hk hn hr hu
id ie il in iq is it jm jo jp ke kg kh kn kr kw ky kz la lb lc lk lr lt lu lv ly ma md me mg mk ml
mm mn mo mr ms mt mu mv mw mx my mz na ne ng ni nl no np nz om pa pe pg ph pk pl pt pw py qa ro rs
ru rw sa sb sc se sg si sk sl sn sr st sv sz tc td th tj tm tn tr tt tw tz ua ug us uy uz vc ve vg
vn xk ye za zm zw
""".split()


def lookup(storefront):
    url = f"https://itunes.apple.com/lookup?id={APP_ID}&country={storefront}"
    try:
        with urllib.request.urlopen(url, timeout=30) as response:
            results = json.load(response).get("results", [])
    except Exception:
        return None
    if not results:
        return (0, 0.0)
    return (results[0].get("userRatingCount", 0), results[0].get("averageUserRating", 0.0))


def main():
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        answers = list(pool.map(lookup, STOREFRONTS))

    failed = sum(answer is None for answer in answers)
    rated = [answer for answer in answers if answer and answer[0]]
    total = sum(count for count, _ in rated)

    if failed > len(STOREFRONTS) // 10 or total == 0:
        sys.exit(f"Skipped: {failed} of {len(STOREFRONTS)} lookups failed, {total} ratings found.")

    average = sum(count * rating for count, rating in rated) / total
    pages = sorted(SITE.glob("*.html")) + sorted(SITE.glob("*/index.html"))
    # The English home's count (kept out of sight in data-app-rating-total), the one every other
    # page copies.
    shown = (shown_rating((SITE / "index.html").read_text(encoding="utf-8")) or (0, 0))[1]

    if shown and total < shown * 0.9:
        sys.exit(f"Skipped: found {total} ratings, but the site shows {shown}.")

    for page in pages:
        text = page.read_text(encoding="utf-8")
        updated = write_rating(text, average, total)
        if updated != text:
            page.write_text(updated, encoding="utf-8")

    print(f"{average:.1f} from {total:,} ratings in {len(rated)} storefronts.")


if __name__ == "__main__":
    main()
