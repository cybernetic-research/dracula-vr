#!/usr/bin/env python3
"""Builds game.json, the data the WebXR game runs on, from your own Dracula Unleashed disc (DOS CD).
Run it once on your computer; the output goes to your media folder and is never committed or uploaded.

usage: extract_game.py <disc.bin> <media_dir>          (needs: pip install capstone)

What it reads:
- ADDRESS / TELEGRAM / JOURNAL / TEXTS / SCENES .DTA: names, addresses, journal pages, telegram labels, scene videos.
- RESOURCE.DTA: the district of each address and the 8x8 carriage-time matrix.
- DRACULA.EXE: the game's rules. They are compiled C: lists of small functions, each a chain of tests (clock windows,
  story flags, the carried item, a random roll) ending in a few calls (set flag, queue a scene, add minutes, add a
  journal page, gain/lose an item, learn an address, ...). Each function is walked path by path into data. Only
  the format is described in this file; the schedule itself stays in your local game.json.
"""
import json, os, re, struct, sys
import capstone
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import dta, iso

# ---- rule format: helper functions in DRACULA.EXE and what they do -------------------------------------------
PRED = {0x236e8: 'flag', 0x1c12c: 'carry', 0x237ac: 'awake'}  # value-returning tests
ACT = {0x23700: 'set', 0x23718: 'scene', 0x237c4: 'death', 0x237e4: 'win', 0x130e4: 'min', 0x130fc: 'clock',
       0x1ec58: 'journal', 0x1c2b0: 'gain', 0x1c42c: 'lose', 0x1ed44: 'address', 0x28bc0: 'option', 0x237b8: 'wake'}
# dispatcher snapshots: each rule list compares its own copy of the clock (and a 0-99 random roll)
VARS = {0x73278: 't', 0x73280: 't', 0x73284: 't', 0x73288: 't', 0x73290: 't', 0x73274: 'rand', 0x7327c: 'rand'}
# rule lists in the data object (one per location, or global)
LISTS = {'arrive': (0x7108c, 13), 'travelGlobal': 0x7110c, 'travel': (0x71144, 13), 'sleep': 0x71178,
         'telegrams': 0x7118c, 'epilogue': 0x711b4}


def load_le(exe):
    le = struct.unpack('<I', exe[0x3c:0x40])[0]; h = exe[le:]
    u = lambda o: struct.unpack('<I', h[o:o + 4])[0]
    npages, last, objtab, nobj, fpt, frt, dp = u(0x14), u(0x2c), u(0x40), u(0x44), u(0x68), u(0x6c), u(0x80)
    objs = [struct.unpack('<6I', h[objtab + i * 24:objtab + i * 24 + 24]) for i in range(nobj)]
    page = lambda i: exe[dp + (i - 1) * 4096: dp + (i - 1) * 4096 + (4096 if i < npages else last)].ljust(4096, b'\0')
    mem = [bytearray(b''.join(page(o[3] + j) for j in range(o[4]))) for o in objs]
    for k, o in enumerate(objs):  # apply 32-bit offset fixups so data pointers resolve
        for j in range(o[4]):
            p = o[3] + j; s, e = struct.unpack('<II', h[fpt + (p - 1) * 4: fpt + (p - 1) * 4 + 8]); q = frt + s
            while q < frt + e:
                src, flg = h[q], h[q + 1]; q += 2
                if src & 0x20: cnt = h[q]; q += 1
                else: so = struct.unpack('<h', h[q:q + 2])[0]; q += 2
                if flg & 0x40: tobj = struct.unpack('<H', h[q:q + 2])[0]; q += 2
                else: tobj = h[q]; q += 1
                if (src & 0xf) == 2: toff = 0
                elif flg & 0x10: toff = struct.unpack('<I', h[q:q + 4])[0]; q += 4
                else: toff = struct.unpack('<H', h[q:q + 2])[0]; q += 2
                offs = [so] if not (src & 0x20) else [struct.unpack('<h', h[q + 2 * i:q + 2 * i + 2])[0] for i in range(cnt)]
                if src & 0x20: q += 2 * cnt
                for so in offs:
                    a = j * 4096 + so
                    if (src & 0xf) == 7 and 0 <= a <= len(mem[k]) - 4: mem[k][a:a + 4] = struct.pack('<I', objs[tobj - 1][1] + toff)
    return [(o[1], bytes(m)) for o, m in zip(objs, mem)]


class Exe:
    def __init__(self, exe):
        self.objs = load_le(exe); self.md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_32); self.cache = {}

    def mem(self, a, n):
        for base, m in self.objs:
            if base <= a < base + len(m): return m[a - base:a - base + n]
        raise KeyError(hex(a))

    def dw(self, a): return struct.unpack('<I', self.mem(a, 4))[0]

    def plist(self, a):
        out = []
        while self.dw(a): out.append(self.dw(a)); a += 4
        return out

    def ins(self, a):
        if a not in self.cache:
            i = next(self.md.disasm(self.mem(a, 16), a)); self.cache[a] = (i.mnemonic, i.op_str, i.size)
        return self.cache[a]


NEG = {'jb': 'jae', 'jae': 'jb', 'je': 'jne', 'jne': 'je', 'ja': 'jbe', 'jbe': 'ja', 'jl': 'jge', 'jge': 'jl', 'jg': 'jle', 'jle': 'jg'}
OPS = {'jb': '<', 'jae': '>=', 'je': '==', 'jne': '!=', 'ja': '>', 'jbe': '<=', 'jl': '<', 'jge': '>=', 'jg': '>', 'jle': '<='}


def imm(s):
    try: return int(s, 0)
    except ValueError: return None


def walk(x, fn, found):
    """All paths through one rule function -> [{'c': conditions, 'a': actions, 'r': return}]"""
    paths = []; stack = [(fn, [], [], [], None, None)]
    while stack:
        pc, conds, acts, pushes, eax, cmpv = stack.pop(); steps = 0
        while True:
            steps += 1
            if steps > 4000: raise SystemExit(f'loop in rule {fn:#x}')
            m, o, sz = x.ins(pc); nxt = pc + sz
            if m == 'push':
                v = imm(o)
                if v is not None and 0x10000 <= v < 0x60000: found.add(v); v = ('fn', v)
                elif v is None: v = eax if o == 'eax' else ('?', o)
                pushes = pushes + [v]
            elif m == 'call':
                t = imm(o); args = list(reversed(pushes)); pushes = []
                if t in PRED: eax = ('pred', PRED[t], args[0] if args else None)
                elif t in ACT: acts = acts + [[ACT[t]] + args]; eax = None
                else: raise SystemExit(f'unknown call {o} in rule {fn:#x}')
            elif m == 'mov' and o.startswith('eax, ') and o != 'eax, eax': eax = imm(o[5:])
            elif m == 'xor' and o == 'eax, eax': eax = 0
            elif m == 'test' and o == 'eax, eax': cmpv = (eax, 0)
            elif m == 'cmp':
                a, b = [s.strip() for s in o.split(',', 1)]
                mm = re.match(r'dword ptr \[(0x7[0-9a-f]+)\]$', a)
                if mm: lhs = ('var', VARS[int(mm.group(1), 16)])
                elif a == 'eax': lhs = eax
                else: raise SystemExit(f'unknown cmp {o} in rule {fn:#x}')
                cmpv = (lhs, imm(b))
            elif m in OPS:
                # on the branch where a tested eax is known to be 0, it holds 0 (the compiler reuses it)
                known = lambda op: 0 if cmpv[0] is eax and cmpv[1] == 0 and op == '==' else eax
                stack.append((imm(o), conds + [(cmpv, OPS[m])], acts, pushes, known(OPS[m]), cmpv))
                conds = conds + [(cmpv, OPS[NEG[m]])]; eax = known(OPS[NEG[m]])
            elif m == 'jmp': nxt = imm(o)
            elif m == 'ret': paths.append((conds, acts, eax)); break
            elif (m == 'add' and o.startswith('esp')) or m in ('nop', 'lea', 'pop') or (m == 'mov' and o == 'eax, eax'): pass
            else: raise SystemExit(f'unknown instruction {m} {o} in rule {fn:#x}')
            pc = nxt
    out = []
    for conds, acts, r in paths:
        c = []
        for (lhs, val), op in conds:
            if lhs is None or isinstance(lhs, int): c.append(['const', lhs or 0, op, val]); continue
            if lhs[0] == 'var': c.append([lhs[1], op, val])
            elif lhs[0] == 'pred':  # flag/carry tests: == 0 / != 0; awake: minutes since waking
                c.append([lhs[1], op, val] if lhs[1] == 'awake' else [lhs[1], lhs[2], op == '!=' if val == 0 else None])
        # constant tests (compiler-known values) either always or never hold
        if any(k[0] == 'const' and not eval(f'{k[1]} {k[2]} {k[3]}') for k in c): continue
        c = [k for k in c if k[0] != 'const']
        a = [[k[0]] + [(['fn', f'{v[1]:x}'] if isinstance(v, tuple) and v[0] == 'fn' else v) for v in k[1:]] for k in acts]
        for k in a:
            for v in k[1:]:
                if isinstance(v, tuple): raise SystemExit(f'unresolved argument {v} in rule {fn:#x}')
        out.append({'c': c, 'a': a, 'r': 1 if r else 0})
    return out


def strings(items):  # the texts were written on a Mac: Mac Roman, NUL-terminated
    return [it.strip(b'\0').decode('mac_roman') for it in items]


def by_id(archive):  # an archive's items in id order (ids are what the program asks for); None where an id is unused
    items, ids = archive
    return [items[i] if i != 0xffff and i < len(items) else None for i in ids]


def journal_pages(archive):  # a page: u16 n, n u16 references (pictures on the page), then the text
    out = []
    for it in by_id(archive):
        if it is None: out.append(None); continue
        n = struct.unpack('>H', it[:2])[0]
        out.append({'refs': list(struct.unpack(f'>{n}H', it[2:2 + 2 * n])), 'text': strings([it[2 + 2 * n:]])[0]})
    return out


def main():
    disc, media = sys.argv[1], sys.argv[2]
    img = iso.Image(disc); rd = lambda n: dta.read_bytes(img.read(n))
    x = Exe(img.read('DRACULA.EXE'))
    lists, found = {}, set()
    for k, v in LISTS.items():
        lists[k] = [[f'{f:x}' for f in x.plist(x.dw(v[0] + 4 * i))] for i in range(v[1])] if isinstance(v, tuple) else [f'{f:x}' for f in x.plist(v)]
        for f in (sum(lists[k], []) if isinstance(v, tuple) else lists[k]): found.add(int(f, 16))
    fns, done = {}, set()
    while found - done:
        f = min(found - done); done.add(f); fns[f'{f:x}'] = walk(x, f, found)
    # data files
    addr = strings(by_id(rd('ADDRESS.DTA'))); tele = strings(by_id(rd('TELEGRAM.DTA'))); jour = journal_pages(rd('JOURNAL.DTA'))
    texts = strings(rd('TEXTS.DTA')[0]); sc_items, sc_ids = rd('SCENES.DTA')
    scenes = [strings([sc_items[i]])[0].lower().replace('.umv', '') if i != 0xffff else None for i in sc_ids]
    res, _ = rd('RESOURCE.DTA')
    n_loc = struct.unpack('>H', res[9][:2])[0]; district = list(struct.unpack(f'>{n_loc}H', res[9][2:2 + 2 * n_loc]))
    n = struct.unpack('>H', res[10][:2])[0]; mtx = list(struct.unpack(f'>{n}H', res[10][2:2 + 2 * n])); side = int(n ** 0.5)
    travel = [mtx[i * side:(i + 1) * side] for i in range(side)]
    dnames = [re.match(r'(?:Within )?(.+?)(?: to |:)', texts[i * side + (1 if i == 0 else 0)]).group(1) for i in range(side)]
    dnames = [re.sub(r'^the ', 'The ', d) for d in dnames]
    game = {
        'source': 'Dracula Unleashed (DOS CD): built locally from your own disc by tools/extract_game.py',
        'locations': [{'name': a.split(' - ')[0].strip(), 'address': a.split(' - ', 1)[1].strip() if ' - ' in a else '', 'district': district[i]}
                      for i, a in enumerate(addr)],
        'districts': dnames, 'travel': travel, 'telegrams': tele, 'journal': jour, 'scenes': scenes,
        'opening': 'dopen', 'ending': 'dend',
        # new game (DRACULA.EXE): location 0, clock 28 Dec 07:00 (minutes since 1 Jan), first journal pages with
        # their dates, the six addresses you know, the four items you own
        'start': {'location': 0, 'clock': 0x7f044, 'journal': [[0, 0x1cbd3], [1, 0x1dd3a], [2, 0x450ec], [3, 0x6a847]],
                  'addresses': [0, 1, 3, 2, 4, 5], 'items': [4, 3, 1, 2]},
        'sleepHours': [[24, 5], [36, 8], [48, 10], [None, 15]],  # hours awake -> hours slept
        'lists': lists, 'rules': fns,
    }
    os.makedirs(media, exist_ok=True)
    json.dump(game, open(os.path.join(media, 'game.json'), 'w'), separators=(',', ':'))
    print(f'game.json: {len(fns)} rule functions, {sum(len(p) for p in fns.values())} paths, '
          f'{len(scenes)} scenes, {len(addr)} locations')


if __name__ == '__main__':
    main()
