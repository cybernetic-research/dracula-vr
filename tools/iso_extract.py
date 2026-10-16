#!/usr/bin/env python3
"""ISO9660 lister/extractor for MODE1/2352 or 2048 images. usage: iso_extract.py image [outdir] [glob]"""
import os, struct, sys, fnmatch
img = sys.argv[1]; out = sys.argv[2] if len(sys.argv) > 2 else None; pat = sys.argv[3] if len(sys.argv) > 3 else '*'
f = open(img, 'rb'); raw = os.path.getsize(img) % 2352 == 0
def blk(n, count=1):
    if not raw:
        f.seek(n * 2048); return f.read(2048 * count)
    f.seek(n * 2352); d = f.read(2352 * count)
    return b''.join(d[i*2352+16:i*2352+16+2048] for i in range(count))
pvd = blk(16)
def walk(lba, size, path):
    data = blk(lba, (size + 2047) // 2048); off = 0
    while off < len(data):
        l = data[off]
        if l == 0: off = (off // 2048 + 1) * 2048; continue
        e = data[off:off+l]; ext, sz = struct.unpack('<I', e[2:6])[0], struct.unpack('<I', e[10:14])[0]
        nm = e[33:33+e[32]]
        if nm not in (b'\0', b'\1'):
            n = nm.decode('latin-1').split(';')[0]; p = f'{path}/{n}'
            if e[25] & 2: walk(ext, sz, p)
            else:
                if out and fnmatch.fnmatch(n, pat):
                    dst = os.path.join(out, p.lstrip('/')); os.makedirs(os.path.dirname(dst), exist_ok=True)
                    open(dst, 'wb').write(blk(ext, (sz + 2047)//2048)[:sz])
                print(f'{ext:>8} {sz:>10} {p}')
        off += l
r = pvd[156:190]; walk(struct.unpack('<I', r[2:6])[0], struct.unpack('<I', r[10:14])[0], '')
