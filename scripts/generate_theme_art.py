"""Bake Aurora's atmospheric artwork. Runtime motion uses compositor transforms."""
from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets/themes'
W, H = 2560, 1440
X, Y = np.meshgrid(np.linspace(0, 1, W, dtype=np.float32), np.linspace(0, 1, H, dtype=np.float32))
RNG = np.random.default_rng(48117)


def noise(cols, rows):
    field = RNG.random((rows, cols), dtype=np.float32)
    return np.asarray(Image.fromarray(field).resize((W, H), Image.Resampling.BICUBIC)).clip(0, 1)


def fbm():
    return sum(noise(5 * 2**i, 4 * 2**i) * (.5**i) for i in range(6)) / 1.96875


def color(hex_value):
    return np.array([int(hex_value[i:i+2], 16) for i in (0, 2, 4)], dtype=np.float32) / 255


def mix(a, b, amount):
    return color(a)[None,None,:] * (1-amount[...,None]) + color(b)[None,None,:] * amount[...,None]


def screen(base, light):
    return 1-(1-base)*(1-np.clip(light, 0, 1))


def save(name, base, light):
    OUT.mkdir(parents=True, exist_ok=True)
    # Blue-noise-like fine grain lives in the texture, never in a live SVG filter.
    grain = (RNG.random((H,W,1), dtype=np.float32)-.5) / 255
    base = np.clip(base+grain,0,1)
    light = np.clip(light,0,1)
    for suffix, rgb in [('base',base),('light',light),('preview',screen(base,light))]:
        Image.fromarray(np.uint8(np.clip(rgb,0,1)*255)).save(OUT/f'{name}-{suffix}.webp',quality=94,method=6)
    print('Created '+name, flush=True)


def northern_lights():
    base = mix('03080f','09172b',np.clip(1-Y,0,1)*.7)
    glow = np.zeros((H,W,3),np.float32)
    for index, (level, phase, strength) in enumerate([(.60,.4,.85),(.37,2.4,.5),(.76,4.2,.35)]):
        edge = level+.13*np.sin(X*6+phase)+.045*np.sin(X*18+phase*2)
        depth = edge-Y
        vertical = np.where(depth>0,np.exp(-np.maximum(depth,0)/.16)*(1-np.exp(-np.maximum(depth,0)/.008)),0)
        strands = .55+.2*np.sin(X*245+4*np.sin(X*23))+.12*np.sin(X*533+3*np.sin(X*61))
        folds = .55+.45*np.sin(X*19+phase)**2
        fade = np.clip(1-np.abs(X-.52)*1.1,.2,1)
        radiance = vertical*strands*folds*fade*strength
        hue = np.clip(depth/.3,0,1)
        tint = mix('38e6a5','7163d9',hue)
        glow += radiance[...,None]*tint
        rim = np.exp(-(depth/.008)**2)*.26*strength*folds
        glow += rim[...,None]*color('78ffd7')
    stars = RNG.random((H,W))>.99992
    base += stars[...,None]*RNG.uniform(.1,.4,(H,W,1)).astype(np.float32)
    save('northern-lights',base,glow)


def dawn():
    n = fbm()
    vertical = np.clip(Y*1.25,0,1)
    base = mix('645f91','e8ac9b',vertical)
    sunlight = np.exp(-(((X-.69)/.32)**2+((Y-.48)/.23)**2))
    base = screen(base,sunlight[...,None]*color('a76a3d')*.48)
    cloud_field = noise(12,5)*.6+noise(32,10)*.28+noise(90,25)*.12
    cloud_level = .58+.07*np.sin(X*7)+.035*np.sin(X*19)
    body = np.clip((Y-cloud_level+(cloud_field-.5)*.28)*9,0,1)
    cloud_color = mix('b9a6c9','e9c8c8',np.clip((cloud_field-.2)*1.5,0,1))
    base = base*(1-body[...,None]*.75)+cloud_color*body[...,None]*.75
    ridge = np.exp(-((Y-cloud_level+(cloud_field-.5)*.28)/.027)**2)
    rays = np.exp(-np.abs(X-.68+(Y-.4)*.2)*9)*(1-Y)*.12
    light = (ridge*(.11+sunlight*.16)+rays)[...,None]*color('ffd6a3')
    light += np.clip(n-.5,0,1)[...,None]*color('e2bfd7')*.16
    save('dawn',base,light)


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
    n=fbm()
    base=mix('082a3c','020913',np.clip(Y*.95+X*.2,0,1))
    light=np.zeros((H,W,3),np.float32)
    # Refracted shafts separate as they descend from a small surface opening.
    for origin,width,brightness in [(.12,.032,.42),(.20,.055,.27),(.31,.028,.31),(.39,.075,.19),(.51,.033,.12)]:
        center=origin+Y*.30
        shaft=np.exp(-((X-center)/(width*(.4+Y)))**2)*np.exp(-Y*2.4)*brightness
        shaft*=.65+.35*n
        light+=shaft[...,None]*color('66cbd3')
    warped_x=X*9+(n-.5)*1.5
    warped_y=Y*11+(noise(11,9)-.5)*1.4
    caustic=np.exp(-np.abs(np.sin(warped_x+np.sin(warped_y)*1.2)+np.sin(warped_y+np.sin(warped_x)*.6))*15)
    surface=np.exp(-((Y-.05)/.18)**2)
    light+=caustic[...,None]*surface[...,None]*color('8edcda')*.28
    aperture=np.exp(-(((X-.25)/.4)**2+(Y/.16)**2))
    light+=aperture[...,None]*color('398d99')*.22
    dust=(RNG.random((H,W))>.99993)*(Y>.15)
    light+=dust[...,None]*color('80b8ba')*.22
    save('deep-ocean',base,light)


if __name__=='__main__':
    northern_lights()
    dawn()
    ember()
    deep_ocean()
