#!/usr/bin/env python3
"""3D versions of the upscaled scenes (as tested in the Starblade port): for every frame of video/<name>.mp4, estimate
depth with Depth Anything V2 Small (Apache-2.0, depth-anything/Depth-Anything-V2-Small-hf) and write
video/<name>.3d.mp4: the picture on top, its depth below (white = near), with the same sound. The game shows it on a
mesh pushed back by the depth, so the scene opens up behind the screen's frame (a "window"); flat stays the default.

usage: depth3d.py <media_dir> [--dir <video folder, default video>] [NAME ...]   (needs torch, transformers, numpy,
ffmpeg; skips files that exist and unfinished .part files)
Depth is relative, so it is normalised against levels that follow the picture slowly (no pumping) and start again
at cuts; then smoothed a little over time. Made on your computer, for you only, like the upscaled videos."""
import os, sys, glob, subprocess, time
os.environ.setdefault('HF_HOME', os.path.join(sys.argv[1], 'hf'))  # before transformers is imported
import numpy as np, torch
import torch.nn.functional as F
from transformers import AutoModelForDepthEstimation

media = sys.argv[1]
dev = 'mps' if torch.backends.mps.is_available() else ('cuda' if torch.cuda.is_available() else 'cpu')
model = AutoModelForDepthEstimation.from_pretrained('depth-anything/Depth-Anything-V2-Small-hf').to(dev).eval()
MEAN = torch.tensor([0.485, 0.456, 0.406], device=dev).view(1, 3, 1, 1)
STD = torch.tensor([0.229, 0.224, 0.225], device=dev).view(1, 3, 1, 1)


def probe(path):
    out = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate',
                          '-of', 'csv=p=0', path], capture_output=True, text=True).stdout.strip().split(',')
    n, d = out[2].split('/')
    return int(out[0]), int(out[1]), out[2]


def depth_batch(frames, w, h):
    x = torch.from_numpy(np.stack(frames)).to(dev).permute(0, 3, 1, 2).float() / 255
    # the model works in multiples of 14 pixels; keep the picture's shape
    ih = 322 if h <= w * 0.66 else 364
    iw = int(round(ih * w / h / 14)) * 14
    x = F.interpolate(x, size=(ih, iw), mode='bicubic', align_corners=False)
    with torch.no_grad():
        d = model(pixel_values=(x - MEAN) / STD).predicted_depth  # relative inverse depth: bigger = nearer
    d = F.interpolate(d[:, None], size=(h, w), mode='bilinear', align_corners=False)[:, 0]
    return d.cpu().numpy()


def convert(src, dst):
    w, h, rate = probe(src)
    dec = subprocess.Popen(['ffmpeg', '-v', 'error', '-i', src, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], stdout=subprocess.PIPE)
    tmp = dst + '.part.mp4'
    enc = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{w}x{h * 2}', '-framerate', rate, '-i', '-',
                            '-i', src, '-map', '0:v', '-map', '1:a?', '-c:a', 'copy', '-c:v', 'libx264', '-crf', '17', '-preset', 'medium',
                            '-g', '15', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', tmp], stdin=subprocess.PIPE)
    lo = hi = None; prev = None; last = None; n = 0
    while True:
        batch = []
        while len(batch) < 8:
            raw = dec.stdout.read(w * h * 3)
            if len(raw) < w * h * 3: break
            batch.append(np.frombuffer(raw, np.uint8).reshape(h, w, 3))
        if not batch: break
        for f, d in zip(batch, depth_batch(batch, w, h)):
            small = f[::8, ::8].astype(np.float32)
            cut = last is not None and np.abs(small - last).mean() > 40  # a cut: start the levels again
            last = small
            p2, p98 = np.percentile(d, 2), np.percentile(d, 98)
            if lo is None or cut: lo, hi, prev = p2, p98, None
            else: lo, hi = lo * 0.92 + p2 * 0.08, hi * 0.92 + p98 * 0.08
            z = np.clip((d - lo) / max(hi - lo, 1e-6), 0, 1)
            z = z if prev is None else prev * 0.3 + z * 0.7
            prev = z
            zi = (z * 255 + 0.5).astype(np.uint8)
            enc.stdin.write(np.ascontiguousarray(np.concatenate([f, np.repeat(zi[..., None], 3, 2)], 0)).tobytes())
            n += 1
    enc.stdin.close(); enc.wait(); dec.wait()
    if enc.returncode: raise SystemExit(f'ffmpeg failed for {dst}')
    os.replace(tmp, dst)
    return n


if __name__ == '__main__':
    args = sys.argv[2:]; vdir = 'video'
    if '--dir' in args: i = args.index('--dir'); vdir = args[i + 1]; del args[i:i + 2]
    names = [n.lower() for n in args]
    files = sorted(f for f in glob.glob(os.path.join(media, vdir, '*.mp4')) if not f.endswith('.3d.mp4') and '.part.' not in f)
    if names: files = [f for f in files if os.path.basename(f)[:-4] in names]
    t0 = time.time()
    for k, f in enumerate(files):
        dst = f[:-4] + '.3d.mp4'
        if os.path.exists(dst): continue
        n = convert(f, dst)
        print(f'{k + 1}/{len(files)} {os.path.basename(f)} {n} frames, {time.time() - t0:.0f}s elapsed', flush=True)
    print('DONE', flush=True)
