#!/usr/bin/env python3
"""Upscale Dracula Unleashed scene videos from your own disc, once, on your own computer (the Starblade port's method,
with a heavier model): Real-ESRGAN x4plus (RRDBNet; general-x4v3 = SRVGGNetCompact with --model general), both
re-implemented here from the public BSD-3-Clause architecture, weights downloaded separately. Each 160x100 frame
becomes 640x400. On a Mac the model runs on the Neural Engine through Core ML (converted once for 160x100, kept in
<media>/models, about 0.1 s a frame; larger frames go through it in overlapping tiles), otherwise with PyTorch. Output: H.264 + AAC MP4s.

usage: upscale.py <disc.bin> <media_dir> [--model x4plus|general] [--out <dir name>] [NAME ...]
       upscale.py <disc.bin> <media_dir> PICTURES        (the 13 street views)
  needs: torch, numpy, ffmpeg, <media>/models/RealESRGAN_x4plus.pth (or realesr-general-x4v3.pth); coremltools for
  the Neural Engine. Writes <media>/<out, default video>/<name>.mp4; skips files that already exist.
Nothing here is ever committed or uploaded: the videos belong to the rights holders."""
import os, sys, subprocess, time, tempfile
import numpy as np, torch, torch.nn as nn, torch.nn.functional as F
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import umv, iso

dev = 'mps' if torch.backends.mps.is_available() else ('cuda' if torch.cuda.is_available() else 'cpu')


class SRVGG(nn.Module):  # SRVGGNetCompact (Real-ESRGAN general-x4v3)
    def __init__(s, feat=64, conv=32, up=4):
        super().__init__(); s.up = up
        s.body = nn.ModuleList([nn.Conv2d(3, feat, 3, 1, 1), nn.PReLU(feat)])
        for _ in range(conv): s.body += [nn.Conv2d(feat, feat, 3, 1, 1), nn.PReLU(feat)]
        s.body.append(nn.Conv2d(feat, 3 * up * up, 3, 1, 1)); s.ps = nn.PixelShuffle(up)

    def forward(s, x):
        o = x
        for l in s.body: o = l(o)
        return s.ps(o) + F.interpolate(x, scale_factor=s.up, mode='nearest')


class RDB(nn.Module):  # residual dense block
    def __init__(s, f=64, g=32):
        super().__init__()
        s.conv1 = nn.Conv2d(f, g, 3, 1, 1); s.conv2 = nn.Conv2d(f + g, g, 3, 1, 1); s.conv3 = nn.Conv2d(f + 2 * g, g, 3, 1, 1)
        s.conv4 = nn.Conv2d(f + 3 * g, g, 3, 1, 1); s.conv5 = nn.Conv2d(f + 4 * g, f, 3, 1, 1); s.l = nn.LeakyReLU(0.2, True)

    def forward(s, x):
        x1 = s.l(s.conv1(x)); x2 = s.l(s.conv2(torch.cat((x, x1), 1))); x3 = s.l(s.conv3(torch.cat((x, x1, x2), 1)))
        x4 = s.l(s.conv4(torch.cat((x, x1, x2, x3), 1))); x5 = s.conv5(torch.cat((x, x1, x2, x3, x4), 1))
        return x5 * 0.2 + x


class RRDB(nn.Module):
    def __init__(s, f=64, g=32):
        super().__init__(); s.rdb1 = RDB(f, g); s.rdb2 = RDB(f, g); s.rdb3 = RDB(f, g)

    def forward(s, x): return s.rdb3(s.rdb2(s.rdb1(x))) * 0.2 + x


class RRDBNet(nn.Module):  # Real-ESRGAN x4plus
    def __init__(s, blocks=23, f=64, g=32):
        super().__init__()
        s.conv_first = nn.Conv2d(3, f, 3, 1, 1); s.body = nn.Sequential(*[RRDB(f, g) for _ in range(blocks)])
        s.conv_body = nn.Conv2d(f, f, 3, 1, 1); s.conv_up1 = nn.Conv2d(f, f, 3, 1, 1); s.conv_up2 = nn.Conv2d(f, f, 3, 1, 1)
        s.conv_hr = nn.Conv2d(f, f, 3, 1, 1); s.conv_last = nn.Conv2d(f, 3, 3, 1, 1); s.l = nn.LeakyReLU(0.2, True)

    def forward(s, x):
        fe = s.conv_first(x); fe = fe + s.conv_body(s.body(fe))
        fe = s.l(s.conv_up1(F.interpolate(fe, scale_factor=2, mode='nearest')))
        fe = s.l(s.conv_up2(F.interpolate(fe, scale_factor=2, mode='nearest')))
        return s.conv_last(s.l(s.conv_hr(fe)))


WEIGHTS = {'x4plus': 'RealESRGAN_x4plus.pth', 'general': 'realesr-general-x4v3.pth'}


class Upscaler:
    B = 4  # frames per Core ML call

    def __init__(self, media, model='x4plus'):
        self.media, self.model = media, model
        net = RRDBNet() if model == 'x4plus' else SRVGG()
        sd = torch.load(os.path.join(media, 'models', WEIGHTS[model]), map_location='cpu')
        net.load_state_dict(sd.get('params_ema', sd.get('params', sd)), strict=True)
        self.net = net.eval()
        self.coreml = {}
        try:
            import coremltools  # noqa: F401  (the Neural Engine, if this is a Mac)
            self.use_coreml = sys.platform == 'darwin'
        except ImportError:
            self.use_coreml = False
        if not self.use_coreml: self.net = self.net.to(dev)

    def _coreml(self, h, w):
        import coremltools as ct
        key = (h, w)
        if key not in self.coreml:
            path = os.path.join(self.media, 'models', f'{self.model}_{self.B}x{w}x{h}.mlpackage')
            if not os.path.exists(path):
                ex = torch.rand(self.B, 3, h, w)
                m = ct.convert(torch.jit.trace(self.net.float(), ex), inputs=[ct.TensorType(name='x', shape=ex.shape)],
                               compute_precision=ct.precision.FLOAT16, convert_to='mlprogram', minimum_deployment_target=ct.target.macOS13)
                m.save(path)
            self.coreml[key] = ct.models.MLModel(path, compute_units=ct.ComputeUnit.CPU_AND_NE)
        return self.coreml[key]

    TILE = (100, 160)  # the one Core ML model size: larger frames go through it in overlapping tiles

    def run(self, frames):  # list of HxWx3 uint8 -> list of 4x
        h, w = frames[0].shape[:2]
        th, tw = self.TILE
        if self.use_coreml and (h, w) != self.TILE and h >= th and w >= tw:
            return self._tiled(frames, h, w)
        x = np.stack(frames).transpose(0, 3, 1, 2).astype(np.float32) / 255
        if self.use_coreml:
            m = self._coreml(h, w); out = []
            for i in range(0, len(x), self.B):
                part = x[i:i + self.B]; n = len(part)
                if n < self.B: part = np.concatenate([part, np.repeat(part[-1:], self.B - n, 0)])
                y = list(m.predict({'x': part}).values())[0][:n]
                out.append(y)
            y = np.concatenate(out)
        else:
            with torch.no_grad(): y = self.net(torch.from_numpy(x).to(dev)).cpu().numpy()
        return list((np.clip(y, 0, 1).transpose(0, 2, 3, 1) * 255 + 0.5).astype(np.uint8))

    def _tiled(self, frames, h, w):
        # converting a model per frame size takes ~10 GB for x4plus; instead cut each frame into overlapping
        # 160x100 tiles and blend them back with weights falling off towards each tile's edges (no seams)
        th, tw = self.TILE
        ys = np.linspace(0, h - th, -(-h // (th - 16))).round().astype(int) if h > th else [0]
        xs = np.linspace(0, w - tw, -(-w // (tw - 16))).round().astype(int) if w > tw else [0]
        ramp = lambda n: np.minimum(np.arange(n) + 1, np.arange(n)[::-1] + 1).astype(np.float32)
        wt = np.outer(ramp(th * 4), ramp(tw * 4))[..., None]
        acc = np.zeros((len(frames), h * 4, w * 4, 3), np.float32); tot = np.zeros((h * 4, w * 4, 1), np.float32)
        for y in ys:
            for x in xs:
                outs = self.run([np.ascontiguousarray(f[y:y + th, x:x + tw]) for f in frames])
                acc[:, y * 4:(y + th) * 4, x * 4:(x + tw) * 4] += np.stack(outs).astype(np.float32) * wt
                tot[y * 4:(y + th) * 4, x * 4:(x + tw) * 4] += wt
        return list((acc / tot + 0.5).clip(0, 255).astype(np.uint8))


def upscale(up, data, out):
    v = umv.decode(data); w, h = v['w'], v['h']
    with tempfile.TemporaryDirectory() as td:
        wav = os.path.join(td, 'a.u8'); open(wav, 'wb').write(v['audio'])
        tmp = out + '.part.mp4'
        ff = subprocess.Popen(['ffmpeg', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{w * 4}x{h * 4}',
                               '-framerate', str(v['fps']), '-i', '-', '-f', 'u8', '-ar', str(v['rate']), '-ac', '1', '-i', wav,
                               '-c:v', 'libx264', '-crf', '16', '-preset', 'slow', '-g', str(v['fps']), '-pix_fmt', 'yuv420p',
                               '-c:a', 'aac', '-b:a', '96k', '-shortest', '-movflags', '+faststart', tmp], stdin=subprocess.PIPE)
        cache = {}; frames = v['frames']; B = 16
        uniq = [f for i, f in enumerate(frames) if i == 0 or f != frames[i - 1]]
        for i in range(0, len(uniq), B):
            chunk = [f for f in dict.fromkeys(uniq[i:i + B]) if f not in cache]
            if chunk:
                for f, y in zip(chunk, up.run([np.frombuffer(f, np.uint8).reshape(h, w, 3) for f in chunk])): cache[f] = y.tobytes()
        for f in frames: ff.stdin.write(cache[f])
        ff.stdin.close(); ff.wait()
        if ff.returncode: raise SystemExit(f'ffmpeg failed for {out}')
        os.replace(tmp, out)
    return len(frames), v['fps']


def location_pictures(up, img, media):
    """The 13 street views (GRAPHICS.DTA: a palette item, then the 640x480 screen, every 24 items). Only the picture
    inside the original's window frame is kept (our own UI replaces the frame), upscaled 4x. The pictures are stored
    Home first, then alphabetically by short name (Annisette, Asylum, Bookstore, Cemetery, Hades, Harker, Holmwood,
    Newsstand, Office, Pub, Telegraph, University); they are saved as img/loc<address number>.jpg."""
    import struct
    from PIL import Image
    import dta
    items, _ = dta.read_bytes(img.read('GRAPHICS.DTA'))
    os.makedirs(os.path.join(media, 'img'), exist_ok=True)
    group_of_address = [0, 1, 7, 5, 8, 11, 2, 12, 4, 10, 9, 6, 3]
    for k in range(13):
        g = group_of_address[k]; pal_item, pic = items[91 + 24 * g], items[92 + 24 * g]
        n = struct.unpack('>H', pal_item[:2])[0]  # palette: u16 count, 3 bytes, then count RGB triplets from index 0
        pal = np.zeros((256, 3), np.uint8); pal[:n] = np.frombuffer(pal_item[5:5 + 3 * n], np.uint8).reshape(n, 3)
        st, w, h, _ = struct.unpack('>4H', pic[:8])
        rgb = pal[np.frombuffer(pic[8:8 + st * h], np.uint8).reshape(h, st)[:, :w]][84:352, 112:478]  # inside the frame, clear of its corner ornaments
        Image.fromarray(up.run([np.ascontiguousarray(rgb)])[0]).save(os.path.join(media, 'img', f'loc{k}.jpg'), quality=92)
    print('location pictures done', flush=True)


if __name__ == '__main__':
    args = sys.argv[1:]
    model, outdir = 'x4plus', 'video'
    if '--model' in args: i = args.index('--model'); model = args[i + 1]; del args[i:i + 2]
    if '--out' in args: i = args.index('--out'); outdir = args[i + 1]; del args[i:i + 2]
    disc, media = args[0], args[1]; names = [n.upper() for n in args[2:]]
    os.makedirs(os.path.join(media, outdir), exist_ok=True)
    img = iso.Image(disc); files = [f for f in img.files() if f.upper().endswith('.UMV')]
    up = Upscaler(media, model)
    if names == ['PICTURES']:
        location_pictures(up, img, media); sys.exit()
    if names: files = [f for f in files if os.path.basename(f).upper().split('.')[0] in names]
    t0 = time.time()
    for k, f in enumerate(sorted(files)):
        out = os.path.join(media, outdir, os.path.basename(f).lower().replace('.umv', '.mp4'))
        if os.path.exists(out): continue
        n, fps = upscale(up, img.read(f), out)
        print(f'{k + 1}/{len(files)} {os.path.basename(f)} {n / fps:.0f}s of video, {time.time() - t0:.0f}s elapsed', flush=True)
    print('DONE', flush=True)
