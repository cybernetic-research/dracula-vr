"""ISO9660 reader for the disc image (MODE1/2352 raw or 2048-byte sectors): Image(path).files(), .read(path)"""
import os, struct


class Image:
    def __init__(self, path):
        self.f = open(path, 'rb'); self.raw = os.path.getsize(path) % 2352 == 0; self.dir = {}
        r = self.blk(16)[156:190]
        self._walk(struct.unpack('<I', r[2:6])[0], struct.unpack('<I', r[10:14])[0], '')

    def blk(self, n, count=1):
        if not self.raw:
            self.f.seek(n * 2048); return self.f.read(2048 * count)
        self.f.seek(n * 2352); d = self.f.read(2352 * count)
        return b''.join(d[i * 2352 + 16:i * 2352 + 16 + 2048] for i in range(count))

    def _walk(self, lba, size, path):
        data = self.blk(lba, (size + 2047) // 2048); off = 0
        while off < len(data):
            l = data[off]
            if l == 0: off = (off // 2048 + 1) * 2048; continue
            e = data[off:off + l]; ext, sz = struct.unpack('<I', e[2:6])[0], struct.unpack('<I', e[10:14])[0]
            nm = e[33:33 + e[32]]
            if nm not in (b'\0', b'\1'):
                p = f"{path}/{nm.decode('latin-1').split(';')[0]}"
                if e[25] & 2: self._walk(ext, sz, p)
                else: self.dir[p.upper()] = (ext, sz, p)
            off += l

    def files(self): return [v[2] for v in self.dir.values()]

    def read(self, path):
        ext, sz, _ = self.dir[('/' + path.lstrip('/')).upper()]
        return self.blk(ext, (sz + 2047) // 2048)[:sz]
