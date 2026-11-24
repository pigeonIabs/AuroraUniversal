"""Bake atmospheric artwork, including the continuous Northern Lights startup frame."""
import argparse
import json
import re
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets/themes'
W, H = 2560, 1440
X, Y = np.meshgrid(np.linspace(0, 1, W, dtype=np.float32), np.linspace(0, 1, H, dtype=np.float32))
RNG = np.random.default_rng(48117)


def noise(cols, rows, rng=RNG):
    field = rng.random((rows, cols), dtype=np.float32)
    return np.asarray(Image.fromarray(field).resize((W, H), Image.Resampling.BICUBIC)).clip(0, 1)


def fbm(rng=RNG):
    return sum(noise(5 * 2**i, 4 * 2**i, rng) * (.5**i) for i in range(6)) / 1.96875


def color(hex_value):
    return np.array([int(hex_value[i:i+2], 16) for i in (0, 2, 4)], dtype=np.float32) / 255


def mix(a, b, amount):
    return color(a)[None,None,:] * (1-amount[...,None]) + color(b)[None,None,:] * amount[...,None]


def screen(base, light):
    return 1-(1-base)*(1-np.clip(light, 0, 1))


def save(name, base, light, rng=RNG):
    OUT.mkdir(parents=True, exist_ok=True)
    # Blue-noise-like fine grain lives in the texture, never in a live SVG filter.
    grain = (rng.random((H,W,1), dtype=np.float32)-.5) / 255
    base = np.clip(base+grain,0,1)
    light = np.clip(light,0,1)
    for suffix, rgb in [('base',base),('light',light),('preview',screen(base,light))]:
        Image.fromarray(np.uint8(np.clip(rgb,0,1)*255)).save(OUT/f'{name}-{suffix}.webp',quality=94,method=6)
    print('Created '+name, flush=True)


def northern_lights():
    # The same continuous field as northern-lights-painter.js, evaluated once for startup.
    # The noise lattice has identical deterministic values on CPU and GPU.
    # A blue nocturnal sky brightens slightly towards the mountain horizon.
    sky_rng = np.random.default_rng(72819)
    base = mix('030914','102338',np.exp(-((Y-.74)/.45)**2)*.72)
    grid = np.empty(256*256,dtype=np.uint8)
    seed = 48117
    for i in range(len(grid)):
        seed ^= (seed << 13) & 0xffffffff
        seed ^= seed >> 17
        seed ^= (seed << 5) & 0xffffffff
        grid[i] = seed >> 24
    grid = grid.reshape(256,256).astype(np.float32)/255
    def smooth(a,b,v):
        p = np.clip((v-a)/(b-a),0,1)
        return p*p*(3-2*p)
    def field(a,b):
        ix,iy = np.floor(a).astype(np.int32),np.floor(b).astype(np.int32)
        u,v = a-ix,b-iy
        u = u*u*u*(u*(u*6-15)+10)
        v = v*v*v*(v*(v*6-15)+10)
        return (grid[iy&255,ix&255]*(1-u)+grid[iy&255,(ix+1)&255]*u)*(1-v)+(grid[(iy+1)&255,ix&255]*(1-u)+grid[(iy+1)&255,(ix+1)&255]*u)*v
    t = 18
    px = (X-.5)/max(1,1.65/(W/H))+.5
    py = (Y-.4)/max(1,(W/H)/1.65)+.4
    glow = np.zeros((H,W,3),np.float32)
    for k in [0,1]:
        billow = field(px*3.1-t*.024,py*2.7+t*.018+k*19)
        x = px+.085*(billow-.5)+(py-.4)*.055
        arc = .64-k*.22-(.14+k*.02)*x
        arc += (.09-k*.015)*np.sin(x*(8.5-k*1.4)-.9+k*2.7+.22*np.sin(t*.065+k))
        arc += .10*(field(x*7-t*.055,k*13+t*.025)-.5)
        depth = arc-py+.035*(billow-.5)
        spread = .12+.075*field(x*4.6+k*17,t*.032)
        veil = np.exp(-((depth-.07)/spread)**2)*smooth(-.15,.025,depth)
        core = np.exp(-((depth-.015)/.048)**2)*.13
        warp = x*43+billow*3.5+depth*7
        wisps = .74+.18*field(warp,depth*5-t*.12+k*21)+.08*field(warp*1.93+billow,depth*9+t*.09)
        pockets = .32+.68*field(x*6-t*.045+k*11,t*.035)
        energy = (veil*.66+core)*wisps*pockets*(1-k*.34)
        tint = smooth(.015,.21,depth+k*.035)[...,None]
        drift = field(x*2.3+k*7,t*.021)[...,None]
        lower = np.array([.19,.48,.56])+np.array([.14,.06,-.10])*drift*.48
        upper = np.array([.32,.28,.56])+np.array([.11,-.03,-.08])*drift
        glow += ((lower*(1-tint)+upper*tint)*energy[...,None]).astype(np.float32)
    # Deterministic stars with varied brightness and a handful of soft halos.
    for i in range(860):
        sx = int(sky_rng.uniform(2,W-2))
        sy = int(sky_rng.uniform(2,H*.88))
        brightness = sky_rng.uniform(.13,.42) if i < 820 else sky_rng.uniform(.45,.7)
        tint = np.array([.8,.89,1.0]) if i % 5 else np.array([1.0,.91,.79])
        base[sy,sx] += tint*brightness
        if i >= 820:
            base[sy-1:sy+2,sx-1:sx+2] += tint*brightness*.08
    # Terrain is a near-invisible tonal suggestion, not an illustrated foreground.
    terrain = Image.new('RGBA',(W,H))
    pen = ImageDraw.Draw(terrain)
    def polygon(points,fill):
        pen.polygon([(round(x*W),round(y*H)) for x,y in points],fill=fill)
    far = [(0,.77),(.035,.73),(.075,.745),(.12,.68),(.15,.71),(.185,.655),(.21,.69),(.24,.675),(.29,.735),(.33,.72),(.38,.765),(.43,.75),(.49,.79),(.54,.755),(.58,.77),(.63,.72),(.68,.74),(.72,.685),(.755,.71),(.79,.66),(.82,.69),(.86,.645),(.90,.70),(.94,.675),(1,.735)]
    polygon(far+[(1,1),(0,1)],(6,13,20,10))
    left = [(0,.72),(.04,.685),(.075,.63),(.098,.652),(.13,.59),(.15,.615),(.174,.65),(.20,.67),(.235,.705),(.28,.74),(.34,.79),(.41,.83),(0,.94)]
    polygon(left,(6,13,20,14))
    right = [(.53,.85),(.59,.81),(.64,.78),(.68,.735),(.72,.715),(.76,.66),(.79,.685),(.825,.625),(.85,.65),(.89,.70),(.925,.68),(.96,.72),(1,.69),(1,1)]
    polygon(right,(6,13,20,14))
    polygon([(0,.845),(.08,.825),(.17,.85),(.25,.875),(.34,.88),(.42,.895),(.51,.88),(.59,.895),(.69,.86),(.78,.84),(.86,.85),(.94,.81),(1,.83),(1,1),(0,1)],(6,13,20,18))
    polygon([(0,.94),(.09,.905),(.19,.935),(.31,.96),(.44,.952),(.57,.975),(.69,.945),(.78,.91),(.88,.90),(1,.87),(1,1),(0,1)],(6,13,20,20))
    # Uneven conifers cluster at the edges, leaving the distant valley readable.
    for i in range(175):
        x = float(sky_rng.uniform(-.015,1.015))
        edge = abs(x-.5)*2
        ground = .97-.075*edge + .012*np.sin(x*27)
        height = float(sky_rng.uniform(.018,.065))*(.35+edge)
        if i % 19 == 0 and edge > .55:
            height *= 1.65
        width = height*.21
        polygon([(x-width*.08,ground),(x-width*.06,ground-height),(x+width*.06,ground-height),(x+width*.08,ground)],(6,13,20,22))
        for branch in range(6):
            f = branch/6
            tip = ground-height+f*height*.72
            reach = width*(.22+.78*f)
            polygon([(x,tip),(x-reach,tip+height*.29),(x-reach*.18,tip+height*.25),(x,tip+height*.31),(x+reach,tip+height*.29)],(6,13,20,22))
    # Four to nine percent opacity, with softly feathered silhouettes. Bake this
    # into the asset so startup, live scenes, and thumbnails have identical restraint.
    terrain = terrain.filter(ImageFilter.GaussianBlur(3))
    grain = (sky_rng.random((H,W,1),dtype=np.float32)-.5)/255
    OUT.mkdir(parents=True,exist_ok=True)
    terrain.resize((1280,720),Image.Resampling.LANCZOS).save(OUT/'northern-lights-landscape.webp',lossless=True,method=6)
    for suffix,rgb in [('base',base),('light',glow),('preview',screen(base,glow))]:
        image = Image.fromarray(np.uint8(np.clip(rgb+grain,0,1)*255+.5))
        if suffix == 'preview':
            image = Image.alpha_composite(image.convert('RGBA'),terrain).convert('RGB')
        size = (384,216) if suffix == 'preview' else (1280,720)
        image = image.resize(size,Image.Resampling.LANCZOS)
        image.save(OUT/f'northern-lights-{suffix}.webp',lossless=True,quality=94,method=6)
        if suffix in ['base','light']:
            image.resize((384,216),Image.Resampling.LANCZOS).save(OUT/f'northern-lights-{suffix}-thumb.webp',lossless=True,method=6)
    print('Created northern-lights',flush=True)


def dawn():
    # Preserve the original cloud field independently of other theme generation.
    # Its initial stream followed two full float64 fields and one float32 field.
    rng = np.random.default_rng(48117)
    rng.bit_generator.advance(2560 * 1440 * 5 // 2)
    n = fbm(rng)
    vertical = np.clip(Y*1.25,0,1)
    # The original shapes are unchanged. A multi-hue palette avoids the grey
    # midpoint produced by interpolating purple directly into pale peach.
    def smooth(low, high, value):
        amount = np.clip((value-low)/(high-low),0,1)
        return amount*amount*(3-2*amount)

    base = mix('79549b','b779a4',smooth(0,.48,vertical))
    rose = smooth(.24,.72,vertical)[...,None]
    base = base*(1-rose)+color('d68d96')*rose
    apricot = smooth(.52,1,vertical)[...,None]
    base = base*(1-apricot)+color('e7ad7d')*apricot
    sunlight = np.exp(-(((X-.69)/.32)**2+((Y-.48)/.23)**2))
    # Tint the existing diffuse illumination instead of screening toward white.
    warmth = sunlight[...,None]*.32
    base = base*(1-warmth)+color('edb57e')*warmth
    cloud_field = noise(12,5,rng)*.6+noise(32,10,rng)*.28+noise(90,25,rng)*.12
    cloud_level = .58+.07*np.sin(X*7)+.035*np.sin(X*19)
    body = np.clip((Y-cloud_level+(cloud_field-.5)*.28)*9,0,1)
    # More chroma, not hard luminance contrast. The same noise field now carries
    # lavender shadows, orchid midtones and warm rose-peach highlights.
    cloud_color = mix('9570b2','b47daa',smooth(.18,.58,cloud_field))
    cloud_warmth = smooth(.38,.82,cloud_field)[...,None]
    cloud_color = cloud_color*(1-cloud_warmth)+color('dfa18e')*cloud_warmth
    base = base*(1-body[...,None]*.75)+cloud_color*body[...,None]*.75
    ridge = np.exp(-((Y-cloud_level+(cloud_field-.5)*.28)/.027)**2)
    rays = np.exp(-np.abs(X-.68+(Y-.4)*.2)*9)*(1-Y)*.12
    light = (ridge*(.11+sunlight*.16)+rays)[...,None]*color('f3b875')
    light += np.clip(n-.5,0,1)[...,None]*color('cf8bb9')*.16
    save('dawn',base,light,rng)
    for part in ('base','light'):
        with Image.open(OUT/f'dawn-{part}.webp') as image:
            image.resize((384,216),Image.Resampling.LANCZOS).save(
                OUT/f'dawn-{part}-thumb.webp',quality=94,method=6)


def ember():
    n = fbm()
    base = mix('070609','21100d',np.clip((1-Y)*.22+n*.22,0,1))
    light = np.zeros((H,W,3),np.float32)
    for phase, strength, offset in [(0,.8,.2),(2.1,.42,.53),(4,.30,.86)]:
        arc = offset+.18*np.sin(X*4+phase)+.045*np.sin(X*13+phase)
        distance=Y-arc+(n-.5)*.09
        vein=np.exp(-np.abs(distance)*35)*(.4+.6*noise(18,7))*strength
        halo=np.exp(-np.abs(distance)*9)*strength*.18
        light += vein[...,None]*color('d77935')+halo[...,None]*color('963821')
    motes=(RNG.random((H,W))>.99993)*(Y>.2)*(Y<.9)
    light+=motes[...,None]*color('e9a16c')*.6
    vignette=np.clip(1-((X-.55)**2*.9+(Y-.5)**2*.6),.3,1)
    save('ember',base,light*vignette[...,None])


def deep_ocean():
    # The exact t=18 field from deep-ocean-painter.js, rendered deterministically for
    # startup, reduced-resource fallback, and gallery thumbnails. No image input.
    t = 18
    x = (np.arange(W, dtype=np.float32) + .5) / W
    y = (np.arange(H, dtype=np.float32) + .5) / H
    px, py = np.meshgrid(x, y)
    skylight = .90 + .06*np.sin(px*4.3+.8)
    depth = np.exp(-py * 2.8) * skylight
    low = np.array([.008, .027, .049], dtype=np.float32)
    high = np.array([.025, .115, .159], dtype=np.float32)
    water = low + (high - low) * depth[..., None]
    light = np.zeros((H, W), dtype=np.float32)
    field_source = (ROOT / 'modules/aurora/deep-ocean-painter.js').read_text(encoding='utf-8')
    field_match = re.search(r'const beams = (\[.*?\]);', field_source, re.S)
    if not field_match:
        raise ValueError('Deep Ocean surface samples are missing')
    beams = json.loads(field_match.group(1))
    for origin, slope, width, power, phase in beams:
        sweep = .014*np.sin(t*.43+phase) + .006*np.sin(t*.71+phase*1.7)
        angle = slope + .040*np.sin(t*.27+phase) + .018*np.sin(t*.49+phase*2.1)
        focus = 1 + .18*np.sin(t*.46+phase*1.3)
        spread = width * focus * (.65 + py * .72)
        q = (px - origin - sweep - py * angle) / spread
        feather = np.exp(-q*q) * .72 + np.exp(-q*q*.18) * .28
        illumination = .86 + .19*np.sin(t*.51+phase) + .07*np.sin(t*.89+phase*2.3)
        striation = .90 + .13*np.sin(q*2.7-t*.70+phase) + .05*np.sin(q*6.1+t*.94+phase*1.8)
        light += feather * illumination * striation * power * np.exp(-py*2.7)
    radiance = light[..., None] * np.array([.28, .62, .68], dtype=np.float32)
    radiance += (skylight*np.exp(-py*5))[..., None] * np.array([.018, .047, .052], dtype=np.float32)
    rgb = 1 - (1-water)*(1-radiance)
    frac = lambda value: value - np.floor(value)
    grain = frac(52.9829189 * frac((px*W)*.06711056 + (H-py*H)*.00583715)) - .5
    rgb = np.clip(rgb + grain[..., None]/255, 0, 1)
    artwork = Image.fromarray(np.uint8(rgb*255 + .5))
    OUT.mkdir(parents=True, exist_ok=True)
    # Lossless storage retains the dither in these very smooth dark gradients.
    artwork.save(OUT / 'deep-ocean-base.webp', lossless=True, method=6)
    thumb = artwork.resize((384, 216), Image.Resampling.LANCZOS)
    for suffix in ('preview', 'base-thumb'):
        thumb.save(OUT / f'deep-ocean-{suffix}.webp', lossless=True, method=6)
    for suffix in ('light', 'light-thumb'):
        obsolete = OUT / f'deep-ocean-{suffix}.webp'
        if obsolete.exists():
            obsolete.unlink()
    print('Rendered deep-ocean from the authored light-field equations', flush=True)


if __name__=='__main__':
    themes = {'northern-lights':northern_lights,'dawn':dawn,'ember':ember,'deep-ocean':deep_ocean}
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--theme',choices=list(themes),help='Regenerate only the selected theme')
    args = parser.parse_args()
    for name in ([args.theme] if args.theme else themes):
        themes[name]()
