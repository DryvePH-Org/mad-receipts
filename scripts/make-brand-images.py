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
# inside the app: a small wide tile for the phone header (the car), and the whole logo for the side menu and the login page
def wide(art, w, h, fill):
    out = Image.new("RGB", (w, h), BG)
    aw = round(w * fill); ah = round(art.height * aw / art.width)
    out.paste(art.resize((aw, ah), Image.LANCZOS), ((w - aw) // 2, (h - ah) // 2))
    return out
save(wide(CAR, 168, 108, 0.9), "public/brand/mad-mark.png")
save(wide(LOGO, 480, 200, 0.88), "public/brand/mad-badge.png")
save(wide(LOGO, 900, 420, 0.87), "public/brand/mad-logo.png")
