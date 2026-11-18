"""Make the public copy of the CV: the phone number becomes "Tel: on request".

Re-sets the whole contact line of the moderncv header, centred, in the same fonts (Latin Modern
Sans/Roman from TeX Live), keeps the e-mail and LinkedIn links and removes the tel: link.
Run: python3 tools/make-public-cv.py ~/Downloads/KK-CV-20261115.pdf
Writes public/Kristof-Kovacs-CV.pdf and checks that no phone number is left in it.
"""

import re
import sys
from pathlib import Path

import fitz  # PyMuPDF


def has_phone(text: str) -> bool:
    """A run of digits and separators with 9+ digits: the same rule as tools/check-public-pdfs.sh."""
    return any(len(re.sub(r"\D", "", m)) >= 9 for m in re.findall(r"[+(0-9][0-9 ()/.+-]{7,}[0-9]", text))

OUT = Path(__file__).resolve().parent.parent / "public" / "Kristof-Kovacs-CV.pdf"
LM = "/usr/share/texmf/fonts/opentype/public/lm/"
FONTS = {"b": LM + "lmsans10-bold.otf", "r": LM + "lmsans10-regular.otf", "rom": LM + "lmroman10-regular.otf"}
SIZE, BASELINE, GAP = 10.91, 118.33, 10.9  # measured from the original header line
LINE = (128, 108.8, 468, 121.2)  # area of the original contact line (below "Budapest, Hungary")
BLACK, BLUE = (0, 0, 0), (0, 0, 1)
EMAIL, LINKEDIN = "kristofkovacs25@gmail.com", "https://www.linkedin.com/in/kkristof"

# (text, font, colour, link) pieces; None = gap, "•" pieces use the roman font like the original
PIECES = [
    ("Tel:", "b", BLACK, None), (" on request", "r", BLACK, None), None,
    ("•", "rom", BLACK, None), None,
    ("E", "b", BLACK, None), (" ", "r", BLUE, None), (EMAIL, "r", BLUE, "mailto:" + EMAIL), None,
    ("•", "rom", BLACK, None), None,
    ("LinkedIn", "r", BLUE, LINKEDIN),
]


def main(src: str) -> None:
    doc = fitz.open(src)
    page = doc[0]
    assert has_phone(page.get_text()), "expected the original CV with the phone number on page 1"

    for link in page.get_links():
        if link["from"].intersects(fitz.Rect(LINE)):
            page.delete_link(link)
    page.add_redact_annot(fitz.Rect(LINE))
    page.apply_redactions(images=fitz.PDF_REDACT_IMAGE_NONE, graphics=fitz.PDF_REDACT_LINE_ART_NONE)

    fonts = {k: fitz.Font(fontfile=f) for k, f in FONTS.items()}
    width = sum(GAP if p is None else fonts[p[1]].text_length(p[0], SIZE) for p in PIECES)
    x = page.rect.width / 2 - width / 2
    for piece in PIECES:
        if piece is None:
            x += GAP
            continue
        text, font, colour, link = piece
        w = fonts[font].text_length(text, SIZE)
        page.insert_text((x, BASELINE), text, fontsize=SIZE, fontname=f"lm{font}", fontfile=FONTS[font], color=colour)
        if link:
            page.insert_link({"kind": fitz.LINK_URI, "from": fitz.Rect(x, BASELINE - 12.6, x + w, BASELINE + 3.4), "uri": link})
        x += w

    doc.subset_fonts()  # embed only the glyphs used, so the added fonts don't bloat the file
    doc.save(OUT, garbage=4, deflate=True)

    check = fitz.open(OUT)
    text = "".join(p.get_text() for p in check)
    uris = [link.get("uri") for p in check for link in p.get_links()]
    assert not has_phone(text), "phone number still in the text"
    assert not any(u and u.startswith("tel:") for u in uris), "tel: link still present"
    assert "Tel: on request" in text and EMAIL in text and check.page_count == doc.page_count
    print(f"wrote {OUT} ({OUT.stat().st_size // 1024} KB); links: {uris}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else str(Path.home() / "Downloads" / "KK-CV-20261115.pdf"))
