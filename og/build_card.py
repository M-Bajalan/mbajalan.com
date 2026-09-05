"""
Builds the social share cards (og:image) for mbajalan.com.

Why this exists as a script rather than a design file: the cards have to match the
site's own tokens exactly, and those tokens live in oklch() in tokens.css. Anything
hand-drawn drifts the first time a colour changes. This reads like the site because
it is drawn from the same numbers.

Three things about og:image that decide the whole design:

  1. SVG is not accepted as an og:image by any major platform. The rest of this site
     is SVG all the way down; the share card cannot be. It has to be a raster PNG.
  2. No platform re-themes the image for dark mode. The pixels you export are the
     pixels everyone sees, on every theme. So the background is flattened onto the
     light-theme cream deliberately - a transparent card would disappear into the
     dark chat UIs that make up half of where these links get pasted.
  3. Facebook caches by URL essentially forever. The output filenames carry a
     version suffix so a future card can bust the cache by changing the URL, which
     is the only mechanism that reliably works.

Fonts: the site serves Newsreader (a variable woff2 in /fonts). Pillow can only read
TTF/OTF and unpacking woff2 needs a brotli build this machine does not have, so the
cards are drawn in Georgia - the site's own declared fallback face, and what a reader
sees for the first fraction of a second before Newsreader swaps in. Close cousin,
same warmth; a Newsreader TTF dropped into FONT_DIR would be picked up by swapping
the three names below.

Run:  python og/build_card.py
Out:  og/card-home-v1.png, og/card-demo-v1.png, og/card-margin-v1.png, og/card-kibsu-v1.png
"""

from __future__ import annotations

import math
import pathlib
import sys

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:  # pragma: no cover
    sys.exit("Pillow is required:  python -m pip install Pillow")

HERE = pathlib.Path(__file__).resolve().parent

WIDTH, HEIGHT = 1200, 630          # 1.91:1, the ratio every platform accepts uncropped
MARGIN = 84


# --------------------------------------------------------------------------
# Colour. tokens.css is authored in oklch(); Pillow speaks 8-bit sRGB. This is
# the standard OKLab -> linear sRGB -> gamma path, so the card cannot drift from
# the stylesheet: the values below are copied verbatim from tokens.css.
# --------------------------------------------------------------------------

def oklch(lightness_pct: float, chroma: float, hue_deg: float) -> tuple[int, int, int]:
    """Convert an oklch() triple to an 8-bit sRGB tuple, clipped to gamut."""
    L = lightness_pct / 100.0
    h = math.radians(hue_deg)
    a = chroma * math.cos(h)
    b = chroma * math.sin(h)

    l_ = L + 0.3963377774 * a + 0.2158037573 * b
    m_ = L - 0.1055613458 * a - 0.0638541728 * b
    s_ = L - 0.0894841775 * a - 1.2914855480 * b
    l, m, s = l_ ** 3, m_ ** 3, s_ ** 3

    lin = (
        +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
    )

    def encode(u: float) -> int:
        u = min(1.0, max(0.0, u))
        srgb = 12.92 * u if u <= 0.0031308 else 1.055 * (u ** (1 / 2.4)) - 0.055
        return int(round(min(1.0, max(0.0, srgb)) * 255))

    return tuple(encode(c) for c in lin)


# Light theme, verbatim from tokens.css. The card is always light: see note 2 above.
PAPER    = oklch(97,   0.011, 75)
INK      = oklch(21,   0.014, 55)
INK_2    = oklch(15,   0.012, 50)
NEUTRAL  = oklch(45,   0.014, 65)
RULE     = oklch(80,   0.015, 70)
RULE_STR = oklch(70,   0.018, 65)
ACCENT   = oklch(37,   0.128, 32)


# --------------------------------------------------------------------------
# Type. The site builds hierarchy from small-caps and letter-spacing rather than
# from size and colour, so the card has to do the same or it stops looking related.
# Pillow has neither, so both are drawn by hand.
# --------------------------------------------------------------------------

FONT_DIR = pathlib.Path("C:/Windows/Fonts")


def font(name: str, size: int) -> ImageFont.FreeTypeFont:
    for candidate in (FONT_DIR / name, pathlib.Path("/Library/Fonts") / name, pathlib.Path(name)):
        try:
            return ImageFont.truetype(str(candidate), size)
        except OSError:
            continue
    raise SystemExit(f"font not found: {name}")


REGULAR, BOLD, ITALIC = "georgia.ttf", "georgiab.ttf", "georgiai.ttf"


def text_width(draw: ImageDraw.ImageDraw, s: str, f, tracking: float = 0.0) -> float:
    if not tracking:
        return draw.textlength(s, font=f)
    return sum(draw.textlength(ch, font=f) for ch in s) + tracking * max(0, len(s) - 1)


def draw_tracked(draw, xy, s: str, f, fill, tracking: float = 0.0) -> float:
    """Draw with manual letter-spacing. Returns the advance width."""
    x, y = xy
    if not tracking:
        draw.text((x, y), s, font=f, fill=fill)
        return draw.textlength(s, font=f)
    start = x
    for ch in s:
        draw.text((x, y), ch, font=f, fill=fill)
        x += draw.textlength(ch, font=f) + tracking
    return x - start - tracking


def wrap(draw, s: str, f, max_w: float) -> list[str]:
    words, lines, line = s.split(), [], ""
    for w in words:
        trial = f"{line} {w}".strip()
        if draw.textlength(trial, font=f) <= max_w or not line:
            line = trial
        else:
            lines.append(line)
            line = w
    if line:
        lines.append(line)
    return lines


# --------------------------------------------------------------------------
# The card. One chassis, three sets of words: a masthead nameplate, a double rule,
# a small-caps standfirst in the rust accent, the standing text, and a footer row
# closed by a hairline - the same devices the page itself is built from.
# --------------------------------------------------------------------------

def build(headline: str, standfirst: str, body: str, foot_left: str,
          kicker: str | None = None, headline_size: int = 92) -> Image.Image:
    img = Image.new("RGB", (WIDTH, HEIGHT), PAPER)
    d = ImageDraw.Draw(img)

    f_kicker = font(REGULAR, 22)
    f_head = font(BOLD, headline_size)
    f_stand = font(REGULAR, 25)
    f_body = font(REGULAR, 33)
    f_foot = font(REGULAR, 22)

    inner = WIDTH - 2 * MARGIN
    y = MARGIN

    if kicker:
        draw_tracked(d, (MARGIN, y), kicker.upper(), f_kicker, NEUTRAL, tracking=3.2)
        y += 46

    # Nameplate.
    d.text((MARGIN, y), headline, font=f_head, fill=INK_2)
    y += headline_size + 26

    # The double rule under the masthead - .mast-rule, in two weights.
    d.line([(MARGIN, y), (WIDTH - MARGIN, y)], fill=RULE_STR, width=3)
    d.line([(MARGIN, y + 7), (WIDTH - MARGIN, y + 7)], fill=RULE, width=1)
    y += 40

    # Standfirst: small-caps, tracked, rust. The one pop of colour on the card.
    draw_tracked(d, (MARGIN, y), standfirst.upper(), f_stand, ACCENT, tracking=3.6)
    y += 58

    for line in wrap(d, body, f_body, inner):
        d.text((MARGIN, y), line, font=f_body, fill=INK)
        y += 48

    # Footer, pinned to the base so every card closes on the same line.
    fy = HEIGHT - MARGIN - 30
    d.line([(MARGIN, fy - 26), (WIDTH - MARGIN, fy - 26)], fill=RULE, width=1)
    draw_tracked(d, (MARGIN, fy), foot_left.upper(), f_foot, NEUTRAL, tracking=3.0)

    right = "ERBIL, IRAQ"
    rw = text_width(d, right.upper(), f_foot, tracking=3.0)
    draw_tracked(d, (WIDTH - MARGIN - rw, fy), right, f_foot, NEUTRAL, tracking=3.0)

    return img


CARDS = {
    "card-home-v1.png": dict(
        headline="Mohammed Bajalan",
        standfirst="IT & Business Intelligence Lead",
        body="Nineteen years across networks, SAP and data. I build and run the data "
             "platforms behind sales and distribution.",
        foot_left="mbajalan.com",
    ),
    "card-demo-v1.png": dict(
        kicker="Mohammed Bajalan",
        headline="Sales & distribution",
        headline_size=80,
        standfirst="Demo dashboard — synthetic data",
        body="KPI tiles, monthly trend, top movers and outlet coverage. No chart "
             "library, no build step, no external requests.",
        foot_left="mbajalan.com/demo/sales",
    ),
    "card-margin-v1.png": dict(
        kicker="Mohammed Bajalan",
        headline="Margin & mix",
        headline_size=84,
        standfirst="Demo what-if — synthetic data",
        body="Push volume on one product and watch the top line and the bottom "
             "line move in different directions. The verdict is a sentence.",
        foot_left="mbajalan.com/demo/margin",
    ),
    "card-kibsu-v1.png": dict(
        kicker="Mohammed Bajalan",
        headline="kibsu",
        standfirst="Open source — Python, no dependencies, MIT",
        body="Reads the instructions you have written for coding agents and reports "
             "which of them anyone could actually verify were followed.",
        foot_left="mbajalan.com/kibsu",
    ),
}


def main() -> None:
    for name, spec in CARDS.items():
        out = HERE / name
        build(**spec).save(out, "PNG", optimize=True)
        kb = out.stat().st_size / 1024
        # WhatsApp degrades well below its documented cap; 300 KB is the real ceiling.
        flag = "" if kb < 300 else "   <-- OVER 300 KB, WhatsApp will drop it"
        print(f"{name:22} {WIDTH}x{HEIGHT}  {kb:6.1f} KB{flag}")


if __name__ == "__main__":
    main()
