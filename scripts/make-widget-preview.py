#!/usr/bin/env python3
"""Renders the widget-picker preview (resources/android/res/drawable-nodpi/widget_preview.png).
Mirrors WalkWidgetProvider.draw(): 28dp corners, frosted glass pane, route, bold-italic text."""
import os, random
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageChops

W = H = 480; SS = 2
d = W / 160.0 * SS                      # px per dp on the supersampled canvas (160dp widget)
w, h = W * SS, H * SS
FONT = '/usr/share/fonts/truetype/freefont/FreeSansBoldOblique.ttf'
f = lambda dp: ImageFont.truetype(FONT, int(dp * d))

bg = Image.new('RGBA', (w, h)); px = bg.load()
stops = [(0, (168, 175, 191)), (.34, (182, 179, 192)), (.66, (214, 165, 150)), (1, (236, 155, 128))]
for y in range(h):
    t = y / (h - 1)
    for i in range(len(stops) - 1):
        if stops[i][0] <= t <= stops[i + 1][0]:
            k = (t - stops[i][0]) / (stops[i + 1][0] - stops[i][0])
            col = tuple(int(stops[i][1][j] + (stops[i + 1][1][j] - stops[i][1][j]) * k) for j in range(3)); break
    for x in range(w): px[x, y] = col + (255,)

sil = Image.new('RGBA', (w, h), (0, 0, 0, 0)); sd = ImageDraw.Draw(sil)
sd.rounded_rectangle((w * .38, -h * .06, w * .60, h * .42), 12 * d, fill=(21, 27, 39, 255))
sd.ellipse((w * .14, h * .50, w * .88, h * 1.12), fill=(21, 27, 39, 255))
bg.alpha_composite(sil.filter(ImageFilter.GaussianBlur(9 * d / 2)))

m = 7 * d; corner = 28 * d; gr = corner - m + 3 * d
glass_mask = Image.new('L', (w, h), 0); ImageDraw.Draw(glass_mask).rounded_rectangle((m, m, w - m, h - m), gr, fill=255)
glass = Image.new('RGBA', (w, h), (0, 0, 0, 0)); gp = glass.load()
for y in range(h):
    for x in range(w):
        t = ((x - m) / (w - 2 * m) + (y - m) / (h - 2 * m)) / 2
        a = int(0x6D + (0x22 - 0x6D) * min(t / .58, 1)) if t < .58 else int(0x22 + (0x3A - 0x22) * (t - .58) / .42)
        gp[x, y] = (255, 255, 255, max(0, min(255, a)))
glass.putalpha(ImageChops.multiply(glass.split()[3], glass_mask))
bg.alpha_composite(glass)
rim = Image.new('RGBA', (w, h), (0, 0, 0, 0)); rd = ImageDraw.Draw(rim)
for r in range(int(52 * d), 0, -2):
    rd.ellipse((m + 10 * d - r, h - m - 8 * d - r, m + 10 * d + r, h - m - 8 * d + r), fill=(60, 160, 230, int(0x66 * (1 - r / (52 * d)) ** 1.2)))
rim.putalpha(ImageChops.multiply(rim.split()[3], glass_mask)); bg.alpha_composite(rim)
def layer(fn):
    """Draw on a transparent layer, then alpha-composite (ImageDraw alone would replace pixels)."""
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0)); fn(ImageDraw.Draw(im)); return im

rnd = random.Random(7)
def grain(g):
    for _ in range(w * h // 70):
        x, y = rnd.random() * w, rnd.random() * h
        if glass_mask.getpixel((int(x), int(y))): g.rectangle((x, y, x + d * .7, y + d * .7), fill=(255, 255, 255, 0x16) if rnd.random() < .5 else (0, 0, 0, 0x10))
bg.alpha_composite(layer(grain))
bg.alpha_composite(layer(lambda g: g.rounded_rectangle((m, m, w - m, h - m), gr, outline=(255, 255, 255, 0x9A), width=max(1, int(1.1 * d)))))

DEMO = [(.10, .66), (.16, .50), (.28, .36), (.40, .30), (.48, .38), (.58, .20), (.80, .30), (.72, .52), (.58, .58), (.44, .70), (.26, .74), (.12, .68)]
pad = 17 * d; left, top, right, bottom = pad, 36 * d, w - pad, h * .56
aw, ah = right - left, bottom - top; rw = aw; rh = rw / 2.4
if rh > ah: rh = ah; rw = rh * 2.4
ox, oy = left + (aw - rw) / 2, top + (ah - rh) / 2
pts = [(ox + x * rw, oy + y * rh) for x, y in DEMO]
bg.alpha_composite(layer(lambda g: g.line(pts, fill=(255, 255, 255, 120), width=int(4 * d), joint='curve')).filter(ImageFilter.GaussianBlur(3 * d)))
bg.alpha_composite(layer(lambda g: g.line(pts, fill=(255, 255, 255, 140), width=max(2, int(1.5 * d)), joint='curve')))  # demo outline is dimmer, like on the phone
ex, ey = pts[-1]
bg.alpha_composite(layer(lambda g: g.ellipse((ex - 7.5 * d, ey - 7.5 * d, ex + 7.5 * d, ey + 7.5 * d), outline=(255, 225, 120, 217), width=max(2, int(1.4 * d)))))
dot = lambda g: g.ellipse((ex - 3.2 * d, ey - 3.2 * d, ex + 3.2 * d, ey + 3.2 * d), fill=(255, 227, 107, 255))
bg.alpha_composite(layer(dot).filter(ImageFilter.GaussianBlur(2.5 * d))); bg.alpha_composite(layer(dot))

# row 1: chip left, name right
dm = ImageDraw.Draw(Image.new('RGBA', (1, 1)))
cw = dm.textlength('READY', font=f(8.5)) + 12 * d
bg.alpha_composite(layer(lambda g: g.rounded_rectangle((pad, 15 * d, pad + cw, 30 * d), 8 * d, fill=(255, 255, 255, 0x38))))
def row1(g):
    g.text((pad + 6 * d, 25.8 * d), 'READY', font=f(8.5), fill=(255, 255, 255, 242), anchor='ls')
    g.text((w - pad, 27 * d), 'Morning Walk', font=f(10), fill=(255, 255, 255, 242), anchor='rs')
bg.alpha_composite(layer(row1))
# row 2: time left, pace right
row2 = h * .655
def row2f(g):
    g.text((pad, row2), '41:10', font=f(11.5), fill=(255, 255, 255, 242), anchor='ls')
    g.text((w - pad, row2), '12:02 /Km', font=f(11.5), fill=(255, 255, 255, 242), anchor='rs')
bg.alpha_composite(layer(row2f))
# hero distance with glow
base = h - 21 * d; big = f(min(38, 160 * .25))
hero = lambda g: g.text((pad, base), '3.42', font=big, fill=(255, 255, 255, 255), anchor='ls')
bg.alpha_composite(layer(hero).filter(ImageFilter.GaussianBlur(5 * d)).point(lambda v: int(v * .6)))
bg.alpha_composite(layer(hero))
dw = dm.textlength('3.42', font=big)
bg.alpha_composite(layer(lambda g: g.text((pad + dw + 5 * d, base), 'KM', font=f(10), fill=(255, 255, 255, 184), anchor='ls')))

out = bg.resize((W, H), Image.LANCZOS)
cm = Image.new('L', (W * 4, H * 4), 0); ImageDraw.Draw(cm).rounded_rectangle((0, 0, W * 4 - 1, H * 4 - 1), 28 * (W / 160) * 4, fill=255)
out.putalpha(cm.resize((W, H), Image.LANCZOS))
dst = os.path.join(os.path.dirname(__file__), '..', 'resources', 'android', 'res', 'drawable-nodpi', 'widget_preview.png')
out.save(dst); print('widget preview written')
