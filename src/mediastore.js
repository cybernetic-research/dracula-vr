// The media folder made from your own disc, kept in this browser's storage so the game runs with no computer serving
// it (on a Quest: copy the zip made by tools/pack-media.sh to the headset, then "Add media" on the page). The service
// worker (sw.js) answers the game's media/... requests from this cache. Nothing here is ever uploaded anywhere.
//
// The zip is read in slices straight from the file (never whole into memory), so multi-gigabyte zips are fine:
// stored entries (zip -0, the usual) and deflated ones, ZIP64 included. Only game.json, img/, sound/ and video/ are
// taken, wherever they sit in the zip; everything else (a Python environment, models, __MACOSX) is skipped.
// tools/pack-media.sh splits the media into parts (one big file tends to fail when copied to a Quest); each part holds
// a marker parts/part-<i>-of-<n>, so the status can name the parts still missing.
export const MEDIA_CACHE = 'dracula-media';
const TYPES = { mp4: 'video/mp4', m4a: 'audio/mp4', jpg: 'image/jpeg', png: 'image/png', json: 'application/json' };

const mediaUrl = (rel) => new URL('media/' + rel, document.baseURI).href;

export async function registerWorker() {
	if (!('serviceWorker' in navigator)) return null;
	try {
		return await navigator.serviceWorker.register(new URL('sw.js', document.baseURI).href);
	} catch {
		return null;
	}
}

// what is stored: { files, bytes (estimate of all this site's storage), quota, game (game.json present), videos,
// videos3d, parts: { of, missing: [part numbers] } or null when the media was not packed in parts }
export async function mediaStatus() {
	if (!('caches' in self)) return { files: 0, game: false, videos: 0, videos3d: 0, bytes: 0, parts: null };
	const keys = await (await caches.open(MEDIA_CACHE)).keys();
	const names = keys.map((r) => r.url);
	const est = (await navigator.storage?.estimate?.()) || {};
	const marks = names.map((u) => /\/media\/parts\/part-(\d+)-of-(\d+)$/.exec(u)).filter(Boolean);
	const of = Math.max(0, ...marks.map((m) => Number(m[2])));
	const have = new Set(marks.filter((m) => Number(m[2]) === of).map((m) => Number(m[1])));
	return {
		files: names.length,
		game: names.some((u) => u.endsWith('/media/game.json')),
		videos: names.filter((u) => u.endsWith('.mp4') && !u.endsWith('.3d.mp4')).length,
		videos3d: names.filter((u) => u.endsWith('.3d.mp4')).length,
		bytes: est.usage || 0,
		quota: est.quota || 0,
		parts: of ? { of, missing: Array.from({ length: of }, (_, i) => i + 1).filter((i) => !have.has(i)) } : null
	};
}

export async function clearMedia() {
	await caches.delete(MEDIA_CACHE);
}

// the entries of a zip File: [{ name, method, csize, usize, offset (of the local header) }]
export async function zipEntries(file) {
	const tailLen = Math.min(file.size, 65557 + 20);
	const tailStart = file.size - tailLen;
	const tail = new DataView(await file.slice(tailStart).arrayBuffer());
	let e = -1;
	for (let i = tailLen - 22; i >= 0; i--)
		if (tail.getUint32(i, true) === 0x06054b50) {
			e = i;
			break;
		}
	if (e < 0) throw new Error('This file is not a zip.');
	let count = tail.getUint16(e + 10, true), cdSize = tail.getUint32(e + 12, true), cdOff = tail.getUint32(e + 16, true);
	if (count === 0xffff || cdSize === 0xffffffff || cdOff === 0xffffffff) {
		// ZIP64: the locator sits just before the end record and points at the ZIP64 end record
		if (e < 20 || tail.getUint32(e - 20, true) !== 0x07064b50) throw new Error('This zip is damaged (no ZIP64 record).');
		const at = Number(tail.getBigUint64(e - 20 + 8, true));
		const z = new DataView(await file.slice(at, at + 56).arrayBuffer());
		if (z.getUint32(0, true) !== 0x06064b50) throw new Error('This zip is damaged (bad ZIP64 record).');
		count = Number(z.getBigUint64(32, true));
		cdSize = Number(z.getBigUint64(40, true));
		cdOff = Number(z.getBigUint64(48, true));
	}
	const cd = new DataView(await file.slice(cdOff, cdOff + cdSize).arrayBuffer());
	const utf8 = new TextDecoder('utf-8'), latin = new TextDecoder('latin1');
	const out = [];
	for (let p = 0, k = 0; k < count; k++) {
		if (cd.getUint32(p, true) !== 0x02014b50) throw new Error('This zip is damaged (bad directory).');
		const flags = cd.getUint16(p + 8, true), method = cd.getUint16(p + 10, true);
		let csize = cd.getUint32(p + 20, true), usize = cd.getUint32(p + 24, true);
		const nlen = cd.getUint16(p + 28, true), xlen = cd.getUint16(p + 30, true), clen = cd.getUint16(p + 32, true);
		let offset = cd.getUint32(p + 42, true);
		const nameBytes = new Uint8Array(cd.buffer, cd.byteOffset + p + 46, nlen);
		const name = (flags & 0x800 ? utf8 : latin).decode(nameBytes);
		// the ZIP64 extra field holds whichever of the three did not fit, in this order
		for (let x = p + 46 + nlen; x < p + 46 + nlen + xlen; ) {
			const id = cd.getUint16(x, true), len = cd.getUint16(x + 2, true);
			if (id === 1) {
				let q = x + 4;
				if (usize === 0xffffffff) (usize = Number(cd.getBigUint64(q, true))), (q += 8);
				if (csize === 0xffffffff) (csize = Number(cd.getBigUint64(q, true))), (q += 8);
				if (offset === 0xffffffff) offset = Number(cd.getBigUint64(q, true));
			}
			x += 4 + len;
		}
		out.push({ name, method, csize, usize, offset });
		p += 46 + nlen + xlen + clen;
	}
	return out;
}

// where an entry goes under media/, or null to skip it
export function mediaPath(name) {
	const n = name.replace(/\\/g, '/');
	if (n.endsWith('/') || n.includes('__MACOSX/') || /(^|\/)\._/.test(n)) return null;
	const m = /(?:^|\/)(game\.json|(?:video|img|sound|parts)\/[^/]+)$/.exec(n);
	return m ? m[1] : null;
}

// copies the media out of one or more zip Files into the cache. onProgress({ done, total, file }) in bytes.
export async function importZips(files, onProgress = () => {}) {
	const jobs = [];
	for (const file of files) for (const en of await zipEntries(file)) {
		const rel = mediaPath(en.name);
		if (rel) jobs.push({ file, en, rel });
	}
	if (!jobs.length) throw new Error('No game media in this zip (it should hold game.json, img/, sound/ and video/ from the media folder: make it with tools/pack-media.sh).');
	const total = jobs.reduce((t, j) => t + j.en.usize, 0);
	const est = (await navigator.storage?.estimate?.()) || {};
	if (est.quota && est.usage + total > est.quota)
		throw new Error(`Not enough storage: this needs ${gb(total)}, the browser allows ${gb(est.quota - est.usage)} more.`);
	await navigator.storage?.persist?.();
	const cache = await caches.open(MEDIA_CACHE);
	// game.json last, so an interrupted import never looks complete
	jobs.sort((a, b) => (a.rel === 'game.json') - (b.rel === 'game.json'));
	let done = 0;
	for (const { file, en, rel } of jobs) {
		onProgress({ done, total, file: rel });
		const head = new DataView(await file.slice(en.offset, en.offset + 30).arrayBuffer());
		if (head.getUint32(0, true) !== 0x04034b50) throw new Error(`This zip is damaged (${rel}).`);
		const start = en.offset + 30 + head.getUint16(26, true) + head.getUint16(28, true);
		const raw = file.slice(start, start + en.csize);
		let body;
		if (en.method === 0) body = raw;
		else if (en.method === 8 && 'DecompressionStream' in self) body = raw.stream().pipeThrough(new DecompressionStream('deflate-raw'));
		else throw new Error(`${rel} is packed in a way this browser cannot read; make the zip with tools/pack-media.sh.`);
		const type = TYPES[rel.split('.').pop().toLowerCase()] || 'application/octet-stream';
		await cache.put(mediaUrl(rel), new Response(body, { headers: { 'Content-Type': type, 'Content-Length': String(en.usize) } }));
		done += en.usize;
	}
	onProgress({ done, total, file: null });
	return { files: jobs.length, bytes: total };
}

export const gb = (b) => (b >= 1e9 ? (b / 1e9).toFixed(1) + ' GB' : Math.round(b / 1e6) + ' MB');
