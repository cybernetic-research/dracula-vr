#!/usr/bin/env python3
"""Dracula Unleashed .DTA archive reader (RESOURCE, GRAPHICS, SOUNDS, TEXTS, JOURNAL, ...).
Layout (big-endian): u32 directory offset; items; directory = u16 nIds, u16 nItems, u16 n3, nIds x u16 id->item map
(0xffff = no item), then u32 item offsets (absolute, the last one equals the directory offset).
usage: dta.py file.DTA            -> list items (index, offset, size, first bytes)
       dta.py file.DTA outdir     -> write each item to outdir/NNNN.bin"""
import os, struct, sys


def read(path): return read_bytes(open(path, 'rb').read())


def read_bytes(b):
    d = struct.unpack('>I', b[:4])[0]
    n_ids, n_items, _ = struct.unpack('>3H', b[d:d + 6])
    ids = struct.unpack(f'>{n_ids}H', b[d + 6:d + 6 + n_ids * 2])
    p = d + 6 + n_ids * 2
    offs = []
    while True:
        o = struct.unpack('>I', b[p:p + 4])[0]; offs.append(o); p += 4
        if o == d: break
    items = [b[offs[i]:offs[i + 1]] for i in range(len(offs) - 1)]
    return items, ids


if __name__ == '__main__':
    items, ids = read(sys.argv[1])
    if len(sys.argv) > 2:
        os.makedirs(sys.argv[2], exist_ok=True)
        for i, it in enumerate(items): open(os.path.join(sys.argv[2], f'{i:04d}.bin'), 'wb').write(it)
    for i, it in enumerate(items): print(f'{i:4d} {len(it):8d}  {it[:24].hex(" ")}')
