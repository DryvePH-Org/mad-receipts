"""Makes every icon and logo image of the app from the one source logo (Docs/brand/mad-logo-source.jpg).
Run: python3 scripts/make-brand-images.py   (needs Pillow). The app's icons, the home-screen icons and the in-app logo all come from here."""
from PIL import Image

SRC = "Docs/brand/mad-logo-source.jpg"
BG = (22, 22, 22)
im = Image.open(SRC).convert("RGB")
LOGO = im.crop((329, 744, 1678, 1257))   # the whole logo, tight
CAR = im.crop((329, 744, 1678, 990))     # the car line only (readable when tiny)

def tile(art, size, fill, pad=None, bg=BG):
    """The art centred on a square of the background colour, `fill` = share of the width it takes."""
    out = Image.new("RGB", (size, size), bg)
    w = round(size * fill)
    h = round(art.height * w / art.width)
    out.paste(art.resize((w, h), Image.LANCZOS), ((size - w) // 2, (size - h) // 2))
    return out

def save(img, path, size=None):
    img.save(path, optimize=True)
    print(path, img.size)

# home-screen and install icons: the whole logo; maskable keeps it inside the safe circle
save(tile(LOGO, 512, 0.86), "public/icons/icon-512.png")
save(tile(LOGO, 192, 0.88), "public/icons/icon-192.png")
save(tile(LOGO, 512, 0.62), "public/icons/maskable-512.png")
save(tile(LOGO, 180, 0.88), "src/app/apple-icon.png")
# browser tab: only the car, so it can be seen at 16 px
save(tile(CAR, 256, 0.9), "src/app/icon.png")
# inside the app: the logo on a transparent background in two colourings, so it shows on a white page and on a dark one.
# The brightness of the source becomes the opacity: "light" art is white (for dark surfaces), "dark" art is near-black (for light surfaces).
from PIL import ImageChops

def transparent(art, colour):
    r, g, b = art.split()
    bright = ImageChops.lighter(ImageChops.lighter(r, g), b)
    alpha = bright.point(lambda v: 0 if v < 30 else min(255, round((v - 30) * 255 / (235 - 30))))
    out = Image.new("RGBA", art.size, colour + (0,))
    out.putalpha(alpha)
    return out

def fit(art, w, h, fill):
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    aw = round(w * fill); ah = round(art.height * aw / art.width)
    out.paste(art.resize((aw, ah), Image.LANCZOS), ((w - aw) // 2, (h - ah) // 2))
    return out

for name, colour in (("light", (255, 255, 255)), ("dark", (22, 22, 22))):
    save(fit(transparent(LOGO, colour), 900, 380, 0.98), f"public/brand/mad-logo-{name}.png")
    save(fit(transparent(CAR, colour), 336, 108, 0.98), f"public/brand/mad-mark-{name}.png")
    save(fit(transparent(CAR, colour), 64, 64, 0.96), f"public/icons/favicon-{name}.png")
