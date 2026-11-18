"""Draw the Internet window's pixel-art surf animations.

Writes public/surf/{loop,away}.{webp,gif} and still.png at 192x128; the page scales them up 3x
with `image-rendering: pixelated`. Run: python3 tools/make-surf.py [--sheet contact-sheet.png]
Timing must match AWAY_MS in src/scripts/internet-ui.ts.
"""

import argparse
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

W, H = 192, 128
SEA = 86  # sea level (y)
OUT = Path(__file__).resolve().parent.parent / "public" / "surf"
LOOP_FRAMES, LOOP_MS = 12, 120
AWAY_FRAMES, AWAY_MS = 14, 90

PAL = {
    "H": "#3a2416", "h": "#5c3b23",  # hair
    "S": "#f0c4a0", "s": "#d49a78",  # skin
    "E": "#1a1a1a",  # eye
    "B": "#4b2e1c",  # beard
    "N": "#1f2b52", "n": "#141d3b", "W": "#ffffff",  # navy hoodie with the Invisible School house logo
    "P": "#2d2f36",  # trousers
    "Y": "#ffd23f", "y": "#c99a12", "R": "#e2402c",  # surfboard
}

# Facing left (direction of travel), arms out for balance, knees bent.
SURFER = """
......HHHHH.........
.....HHHhHHH........
....HHHhhHHHH.......
....HHSSSSHHHH......
....HSESSSSHHH......
....HSSSSSsHHH......
....HBSSSSBHHH......
.....BBssBBHHH......
......BBBB.HH.......
......NNNN..........
.SSNNNNNNNNNNNSS....
...nNNNNWNNNNn......
.....NNWWWNN........
.....NNNNNNN........
.....nNNNNNn........
.....PPPPPPP........
....PPP...PPP.......
...PPP.....PPP......
...SS.......SS......
"""
BOARD = """
..YYYYYYYYYYYYYYYYYY..
.YYRRRRRRRRRRRRRRRRYYY
..yyyyyyyyyyyyyyyyyy..
"""


def sprite(art: str) -> Image.Image:
    rows = art.strip("\n").split("\n")
    img = Image.new("RGBA", (max(map(len, rows)), len(rows)))
    for y, row in enumerate(rows):
        for x, c in enumerate(row):
            if c != ".":
                img.putpixel((x, y), Image.new("RGB", (1, 1), PAL[c]).getpixel((0, 0)) + (255,))
    return img


def double(img: Image.Image) -> Image.Image:
    # an affine transform, because Image.resize(NEAREST) fails in some Pillow 12 builds
    return img.transform((img.width * 2, img.height * 2), Image.Transform.AFFINE, (0.5, 0, 0, 0, 0.5, 0), resample=Image.Resampling.NEAREST)


MAN, DECK = double(sprite(SURFER)), double(sprite(BOARD))
FONT = ImageFont.load_default_imagefont()  # crisp bitmap font, no anti-aliasing


def background(d: ImageDraw.ImageDraw, f: int, shift: int = 0) -> None:
    for y0, y1, col in [(0, 22, "#7ec8ff"), (22, 44, "#95d4ff"), (44, 66, "#aee0ff"), (66, SEA, "#c7ecff")]:
        d.rectangle([0, y0, W, y1], fill=col)
    for i, (gx, gy) in enumerate([(118, 44), (132, 52)]):  # two seagulls drifting
        x, y = gx - (f * 2 + i * 7) % 60 + 20, gy + (1 if (f + i) % 4 < 2 else 0)
        d.point([(x, y), (x + 1, y + 1), (x + 2, y), (x + 3, y + 1), (x + 4, y)], fill="#4a5a6a")
    d.rectangle([0, SEA, W, H], fill="#1c6fbf")
    for row, period in [(92, 24), (100, 30), (110, 22), (120, 34)]:
        for x in range(-period, W + period, period):
            x0 = x - (f * 2) % period
            d.line([x0, row, x0 + 7, row], fill="#3d8fdc")
    wave(d, f, shift)


def wave(d: ImageDraw.ImageDraw, f: int, shift: int) -> None:
    def p(points):  # the right edge stays put so no sky shows behind the wave
        return [(x if x >= W else x - shift, y) for x, y in points]

    swell = round(math.sin(f / LOOP_FRAMES * 2 * math.pi) * 2)  # the wave breathes in and out
    d.polygon(p([(78, SEA), (108, 72 + swell), (128, 52 + swell), (144, 34), (160, 20), (178, 12), (W, 14), (W, SEA), (78, SEA)]), fill="#2b8fe3")
    d.polygon(p([(152, 40), (160, 32), (172, 28), (182, 32), (184, 50), (172, 58), (160, 52)]), fill="#13589e")  # the tube
    d.polygon(p([(160, 20), (178, 12), (W, 14), (W, 24), (182, 22), (170, 24), (158, 32), (150, 42), (146, 38)]), fill="#4aa8f0")
    for i in range(6):  # streaks running up the face
        t = ((f * 3 + i * 9) % 40) / 40
        x, y = 92 + t * 50, SEA - 6 - t * 44
        d.line(p([(x, y), (x + 5, y - 3)]), fill="#5fb4f2")
    crest = [(146, 38), (150, 32), (156, 24), (164, 18), (172, 14), (180, 12), (188, 12), (W, 13)]
    d.line(p(crest), fill="#ffffff", width=2)
    for i, (x, y) in enumerate(crest):  # foam and spray off the lip
        if (i + f) % 3 == 0:
            d.point(p([(x - 2, y - 2), (x - 3, y - 4)]), fill="#ffffff")
        if (i + f) % 4 == 1:
            d.point(p([(x + 1, y - 3)]), fill="#d9f2ff")
    d.line(p([(78, SEA), (W, SEA)]), fill="#d9f2ff")


def surfer(img: Image.Image, d: ImageDraw.ImageDraw, x: int, bob: int, f: int, wake: bool = True) -> None:
    y = SEA - 2 - DECK.height - MAN.height + 1 + bob
    img.alpha_composite(MAN, (x + 2, y))
    img.alpha_composite(DECK, (x - 4, y + MAN.height - 2))
    if wake:  # spray trailing behind the board
        for i in range(6):
            wx = x + 40 + i * 3 + (f % 2)
            d.point([(wx, SEA - 1 - (i % 2)), (wx + 1, SEA - 2 - ((i + f) % 3))], fill="#ffffff")


def bubble(d: ImageDraw.ImageDraw, lines: list[str], tail_to: tuple[int, int]) -> None:
    w = max(FONT.getbbox(t)[2] for t in lines) + 10
    h = len(lines) * 11 + 6
    d.rounded_rectangle([4, 4, 4 + w, 4 + h], radius=4, fill="#ffffff", outline="#000000")
    d.polygon([(44, 4 + h), (54, 4 + h), tail_to], fill="#ffffff", outline="#000000")
    d.line([45, 4 + h, 53, 4 + h], fill="#ffffff")
    for i, t in enumerate(lines):
        d.text((9, 7 + i * 11), t, font=FONT, fill="#000000")


def loop_frame(f: int) -> Image.Image:
    img = Image.new("RGBA", (W, H))
    d = ImageDraw.Draw(img)
    background(d, f)
    surfer(img, d, 36, [0, 1, 2, 1][f % 4], f)
    bubble(d, ["Surfing the internet?", "Surf with me!"], (58, 38))
    if f % 6 < 4:  # blinking hint
        d.text((5, H - 14), "CLICK TO SURF >", font=FONT, fill="#000000")
        d.text((4, H - 15), "CLICK TO SURF >", font=FONT, fill="#ffff66")
    return img


def away_frame(f: int) -> Image.Image:
    img = Image.new("RGBA", (W, H))
    d = ImageDraw.Draw(img)
    background(d, f, shift=f * 5)  # the wave catches up as he rides off
    x = 36 - round(2.2 * f * f)
    if x > -50:
        surfer(img, d, x, -1 if f % 2 else 0, f)
        for i in range(3):  # speed lines
            d.line([x + 46 + i * 4, SEA - 36 + i * 10, x + 62 + i * 6, SEA - 36 + i * 10], fill="#ffffff")
    if f >= 8:  # whitewater wipes the screen
        edge = W - (f - 7) * 34
        for y in range(H):
            ragged = edge + round(math.sin(y / 5 + f) * 6)
            d.line([ragged, y, W, y], fill="#eaf7ff")
            d.point((ragged - 2, y), fill="#ffffff")
    return img


def save(name: str, frames: list[Image.Image], ms: int, loop: bool) -> None:
    rgb = [im.convert("RGB") for im in frames]
    rgb[0].save(OUT / f"{name}.webp", save_all=True, append_images=rgb[1:], duration=ms, lossless=True, **({"loop": 0} if loop else {"loop": 1}))
    if not loop:
        return  # only the loop needs a GIF (the page's <img>); the wipe is played from the WebP alone
    gif = [im.convert("P", palette=Image.Palette.ADAPTIVE, colors=64) for im in rgb]
    gif[0].save(OUT / f"{name}.gif", save_all=True, append_images=gif[1:], duration=ms, disposal=1, loop=0)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--sheet", help="also write a contact sheet of every frame to this path")
    args = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    loop = [loop_frame(f) for f in range(LOOP_FRAMES)]
    away = [away_frame(f) for f in range(AWAY_FRAMES)]
    save("loop", loop, LOOP_MS, loop=True)
    save("away", away, AWAY_MS, loop=False)
    loop[0].convert("RGB").save(OUT / "still.png")

    for name in ["loop.webp", "loop.gif", "away.webp", "still.png"]:
        size = (OUT / name).stat().st_size
        assert size < 200_000, f"{name} is {size} bytes"
        print(f"{name:10} {size / 1024:6.1f} KB")
    with Image.open(OUT / "away.webp") as im:
        assert (im.size, im.n_frames) == ((W, H), AWAY_FRAMES)

    if args.sheet:
        frames = loop + away
        cols, scale = 6, 2
        sheet = Image.new("RGB", (cols * W * scale + (cols + 1) * 4, math.ceil(len(frames) / cols) * (H * scale + 4) + 4), "#333")
        for i, fr in enumerate(frames):
            sheet.paste(double(fr.convert("RGB")), (4 + (i % cols) * (W * scale + 4), 4 + (i // cols) * (H * scale + 4)))
        sheet.save(args.sheet)
        print("sheet:", args.sheet)


if __name__ == "__main__":
    main()
