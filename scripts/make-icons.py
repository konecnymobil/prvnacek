#!/usr/bin/env python3
"""Zástupné ikony PWA (M0). Kreslí „Aa“-styl ikonu: krémové pozadí, modrý kruh, bílé písmeno A, žlutá hvězdička.
Text se rasterizuje písmem Andika (soubor fontu se nemění). Spuštění: npm run icons (potřebuje Pillow)."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
FONT = ROOT / "src/design/fonts/Andika-Bold.woff2"
OUT = ROOT / "public/icons"
BG, PRIMARY, ACCENT, WHITE = "#FFF6E5", "#1D58C2", "#FFC53D", "#FFFFFF"


def star(d, cx, cy, r, fill):
    import math
    pts = []
    for i in range(10):
        a = -math.pi / 2 + i * math.pi / 5
        rr = r if i % 2 == 0 else r * 0.45
        pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
    d.polygon(pts, fill=fill)


def icon(size, safe=1.0):
    s = size * 4  # supersampling
    img = Image.new("RGB", (s, s), BG)
    d = ImageDraw.Draw(img)
    r = s * 0.40 * safe
    c = s / 2
    d.ellipse((c - r, c - r, c + r, c + r), fill=PRIMARY)
    font = ImageFont.truetype(str(FONT), int(r * 1.25))
    d.text((c, c + r * 0.04), "A", font=font, fill=WHITE, anchor="mm")
    star(d, c + r * 0.78, c - r * 0.78, r * 0.30, ACCENT)
    return img.resize((size, size), Image.LANCZOS)


OUT.mkdir(parents=True, exist_ok=True)
icon(180).save(OUT / "apple-touch-icon.png")
icon(192).save(OUT / "icon-192.png")
icon(512).save(OUT / "icon-512.png")
icon(512, safe=0.78).save(OUT / "icon-maskable-512.png")
icon(64).save(OUT / "favicon-64.png")
print("ikony hotové:", sorted(p.name for p in OUT.iterdir()))
