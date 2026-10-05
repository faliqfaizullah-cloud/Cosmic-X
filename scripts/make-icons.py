#!/usr/bin/env python3
"""Regenerates the Android launcher icons (resources/android/res/**) from the vector-ish spec below.
Design: concentric blue circles + hairline ring + white arrow on a light grid. Needs: pip install pillow"""
import math, os
from PIL import Image, ImageDraw, ImageChops

S, SS = 1080, 4                                  # master size, supersampling
C1, C2, C3, C4 = (195, 215, 242), (120, 172, 240), (58, 134, 238), (6, 107, 237)
BG, GRID, ARROW, RING = (243, 244, 248), (235, 236, 240), (244, 244, 244), (122, 164, 206)
R4, R3, R2, R1, RR = 334, 275, 219, 161, 423
ADAPTIVE_SCALE = 0.74                            # ring diameter ~ 58% of the 108dp canvas (safe zone is 66%)

def art(layer, k=1.0):
    W = S * SS
    im = Image.new('RGBA', (W, W), (0, 0, 0, 0)); d = ImageDraw.Draw(im); c = W / 2
    def circ(r, fill=None, outline=None, width=1):
        r *= k * SS; d.ellipse((c - r, c - r, c + r, c + r), fill=fill, outline=outline, width=width)
    if layer == 'mono':
        for r, a in ((R4, 70), (R3, 120), (R2, 180), (R1, 255)): circ(r, fill=(255, 255, 255, a))
    else:
        circ(RR, outline=RING + (255,), width=max(2, int(2.0 * k * SS)))
        for r, col in ((R4, C1), (R3, C2), (R2, C3), (R1, C4)): circ(r, fill=col + (255,))
    # arrow, measured on the reference (centre 540,540): 15px stroke, rounded chevron tip
    tgt = Image.new('RGBA', (W, W), (0, 0, 0, 0)); td = ImageDraw.Draw(tgt)
    P = lambda x, y: ((540 + (x - 540) * k) * SS, (540 + (y - 540) * k) * SS)
    w = int(round(15 * k * SS)); V = (586, 539); R = 20.6
    T1 = (V[0] - R * .7071, V[1] - R * .7071); T2 = (V[0] - R * .7071, V[1] + R * .7071)
    cx = V[0] - R * 1.4142
    arc = [(cx + R * math.cos(math.radians(-45 + 90 * i / 30)), 539 + R * math.sin(math.radians(-45 + 90 * i / 30))) for i in range(31)]
    td.line([P(*p) for p in [(537.5, 490.5), T1] + arc + [T2, (537.5, 587.5)]], fill=(255, 255, 255, 255), width=w, joint='curve')
    td.line([P(498, 539), P(578, 539)], fill=(255, 255, 255, 255), width=w)
    if layer == 'mono':
        im.putalpha(ImageChops.subtract(im.split()[3], tgt.split()[3]))   # arrow is a cut-out
    else:
        im.paste(Image.new('RGBA', (W, W), ARROW + (255,)), (0, 0), tgt.split()[3])
    return im.resize((S, S), Image.LANCZOS)

def background(px):
    im = Image.new('RGB', (S * 2, S * 2), BG); d = ImageDraw.Draw(im)
    for v in range(15, S * 2, 32):
        d.line([(v, 0), (v, S * 2)], fill=GRID, width=2); d.line([(0, v), (S * 2, v)], fill=GRID, width=2)
    return im.resize((px, px), Image.LANCZOS)

def full(px):
    bg = background(S).convert('RGBA'); bg.alpha_composite(art('all', 1.0))
    return bg.resize((px, px), Image.LANCZOS)

def rounded(im, rad):
    m = Image.new('L', im.size, 0); ImageDraw.Draw(m).rounded_rectangle((0, 0) + im.size, rad, fill=255); o = im.copy(); o.putalpha(m); return o
def circle(im):
    m = Image.new('L', im.size, 0); ImageDraw.Draw(m).ellipse((0, 0) + im.size, fill=255); o = im.copy(); o.putalpha(m); return o

if __name__ == '__main__':
    base = os.path.join(os.path.dirname(__file__), '..', 'resources', 'android', 'res')
    fg, mono = art('all', ADAPTIVE_SCALE), art('mono', ADAPTIVE_SCALE)
    for n, k in {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}.items():
        d = f'{base}/mipmap-{n}'; os.makedirs(d, exist_ok=True)
        l, f = int(48 * k), int(108 * k)
        im = full(l * 4).resize((l, l), Image.LANCZOS)
        rounded(im, int(l * .22)).save(f'{d}/ic_launcher.png'); circle(im).save(f'{d}/ic_launcher_round.png')
        fg.resize((f, f), Image.LANCZOS).save(f'{d}/ic_launcher_foreground.png')
        mono.resize((f, f), Image.LANCZOS).save(f'{d}/ic_launcher_mono.png')
        background(f).save(f'{d}/ic_launcher_bg.png')
    os.makedirs(f'{base}/mipmap-anydpi-v26', exist_ok=True)
    xml = ('<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
           '    <background android:drawable="@mipmap/ic_launcher_bg"/>\n    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>\n'
           '    <monochrome android:drawable="@mipmap/ic_launcher_mono"/>\n</adaptive-icon>\n')
    for n in ('ic_launcher', 'ic_launcher_round'): open(f'{base}/mipmap-anydpi-v26/{n}.xml', 'w').write(xml)
    open(f'{base}/values/ic_launcher_background.xml', 'w').write('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#F3F4F8</color>\n</resources>\n')
    full(512).convert('RGB').save(os.path.join(base, '..', '..', 'icon-512.png'))
    print('icons written')
