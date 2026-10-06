#!/usr/bin/env python3
"""Renders the widget-picker preview (resources/android/res/drawable-nodpi/widget_preview.png, dark)
and a white variant for reference. Mirrors WalkWidgetProvider.draw(): solid tile, 28dp corners, bold italic."""
import os
from PIL import Image, ImageDraw, ImageFont

W = H = 480; SS = 3
d = W / 160.0 * SS
w, h = W * SS, H * SS
FONT = '/usr/share/fonts/truetype/freefont/FreeSansBoldOblique.ttf'
f = lambda dp: ImageFont.truetype(FONT, int(dp * d))
DEMO = [(.10, .66), (.16, .50), (.28, .36), (.40, .30), (.48, .38), (.58, .20), (.80, .30), (.72, .52), (.58, .58), (.44, .70), (.26, .74), (.12, .68)]

def render(dark, state='idle'):
    bg = (18, 18, 20) if dark else (255, 255, 255)
    ink = (255, 255, 255) if dark else (17, 17, 20)
    dim = ink + (166,)
    hair = (255, 255, 255, 38) if dark else (0, 0, 0, 31)
    ring = (255, 227, 107) if dark else (229, 168, 0)
    dot = (255, 227, 107) if dark else (242, 182, 0)
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0)); g = ImageDraw.Draw(im)
    def blend(fn):
        # ImageDraw replaces pixels; draw translucent shapes on their own layer and composite them
        layer = Image.new('RGBA', (w, h), (0, 0, 0, 0)); fn(ImageDraw.Draw(layer)); im.alpha_composite(layer)
    corner = 28 * d
    g.rounded_rectangle((0, 0, w - 1, h - 1), corner, fill=bg + (255,), outline=hair, width=max(1, int(d)))
    pad = 17 * d; e = d
    # route
    left, top, right, bottom = pad, 34 * e, w - pad, h * .56
    aw, ah = right - left, bottom - top; rw = aw; rh = rw / 2.4
    if rh > ah: rh = ah; rw = rh * 2.4
    ox, oy = left + (aw - rw) / 2, top + (ah - rh) / 2
    pts = [(ox + x * rw, oy + y * rh) for x, y in DEMO]
    line = ink + (102,)
    def route(l):
        l.line(pts, fill=line, width=max(2, int(1.7 * e)), joint='curve')
        for p in pts: l.ellipse((p[0] - .85 * e, p[1] - .85 * e, p[0] + .85 * e, p[1] + .85 * e), fill=line)   # round joins
    blend(route)
    ex, ey = pts[-1]
    g.ellipse((ex - 7.5 * e, ey - 7.5 * e, ex + 7.5 * e, ey + 7.5 * e), outline=ring, width=max(2, int(1.5 * e)))
    g.ellipse((ex - 3.4 * e, ey - 3.4 * e, ex + 3.4 * e, ey + 3.4 * e), fill=dot)
    # chip + name
    chip = 'READY'; cw = g.textlength(chip, font=f(8.5)) + 12 * e
    blend(lambda l: l.rounded_rectangle((pad, 13 * e, pad + cw, 28 * e), 8 * e, fill=((255, 255, 255, 36) if dark else (0, 0, 0, 20))))
    g = ImageDraw.Draw(im)
    g.text((pad + 6 * e, 28 * e - 4.2 * e), chip, font=f(8.5), fill=ink, anchor='ls')
    g.text((w - pad, 25.5 * e), 'Morning Walk', font=f(10), fill=ink, anchor='rs')
    # time / pace
    row2 = h * .645
    blend(lambda l: (l.text((pad, row2), '41:10', font=f(11.5), fill=dim, anchor='ls'), l.text((w - pad, row2), '12:02 /Km', font=f(11.5), fill=dim, anchor='rs')))
    g = ImageDraw.Draw(im)
    # hero
    base = h - 19 * e; big = f(min(38, 160 * .235))
    g.text((pad, base), '3.42', font=big, fill=ink, anchor='ls')
    kw = g.textlength('3.42', font=big)
    blend(lambda l: l.text((pad + kw + 5 * e, base), 'KM', font=f(10), fill=dim, anchor='ls'))
    out = im.resize((W, H), Image.LANCZOS)
    mask = Image.new('L', (W * 4, H * 4), 0); ImageDraw.Draw(mask).rounded_rectangle((0, 0, W * 4 - 1, H * 4 - 1), 28 * (W / 160) * 4, fill=255)
    out.putalpha(Image.composite(out.split()[3], Image.new('L', (W, H), 0), mask.resize((W, H), Image.LANCZOS)))
    return out

res = os.path.join(os.path.dirname(__file__), '..', 'resources', 'android', 'res', 'drawable-nodpi', 'widget_preview.png')
render(True).save(res)
render(False).save('/tmp/widget-preview-white.png')
print('widget previews written')
