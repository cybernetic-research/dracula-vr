// Service worker: lets the game run on a headset with no computer serving it.
//
// - media/... (the folder made from your own disc) is answered from the "dracula-media" cache, which the page fills
//   when you import the media zip (src/mediastore.js); videos get byte ranges, so seeking works. What is not in the
//   cache goes to the network as before (the local server, tools/serve.mjs --media).
// - the game itself (this repo's files, with three.js and the font in vendor/) is kept in the "dracula-app" cache so it
//   also starts offline, network-first (updates arrive when online).
const APP = 'dracula-app-v3';
const MEDIA = 'dracula-media';
const PRECACHE = [
	'./',
	'index.html',
	'manifest.webmanifest',
	'icons/icon-192.png',
	'icons/icon-512.png',
	'src/main.js',
	'src/engine.js',
	'src/panel.js',
	'src/icons.js',
	'src/study.js',
	'src/input.js',
	'src/depthscreen.js',
	'src/sounds.js',
	'src/londonmap.js',
	'src/mediastore.js',
	'src/mediapanel.js',
	'src/loadingmusic.js',
	'vendor/three/build/three.module.js',
	'vendor/three/build/three.core.js',
	'vendor/three/examples/jsm/webxr/VRButton.js',
	'vendor/fonts/im-fell-english.css',
	'vendor/fonts/im-fell-english.woff2',
	'vendor/fonts/im-fell-english-italic.woff2'
];

self.addEventListener('install', (e) => {
	// one by one, so a file that cannot be fetched (offline, renamed) does not stop the install
	e.waitUntil(caches.open(APP).then((c) => Promise.all(PRECACHE.map((u) => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
	e.waitUntil(
		caches
			.keys()
			.then((keys) => Promise.all(keys.filter((k) => k.startsWith('dracula-app-') && k !== APP).map((k) => caches.delete(k))))
			.then(() => self.clients.claim())
	);
});

self.addEventListener('fetch', (e) => {
	const req = e.request;
	if (req.method !== 'GET') return;
	const url = new URL(req.url);
	const scope = new URL(self.registration.scope);
	if (url.origin === scope.origin && url.pathname.startsWith(scope.pathname + 'media/')) e.respondWith(media(req, url));
	else if (url.origin === scope.origin) e.respondWith(networkFirst(req));
});

async function media(req, url) {
	const cache = await caches.open(MEDIA);
	const hit = await cache.match(url.origin + url.pathname);
	if (!hit) return fetch(req);
	const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get('range') || '');
	if (!range) return hit;
	// a video asking for part of the file (seeking, or the browser reading the index at the end)
	const blob = await hit.blob();
	const size = blob.size;
	let start, end;
	if (range[1] === '') (start = Math.max(0, size - Number(range[2]))), (end = size - 1);
	else (start = Number(range[1])), (end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1);
	if (start >= size || start > end) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
	return new Response(blob.slice(start, end + 1), {
		status: 206,
		headers: {
			'Content-Type': hit.headers.get('Content-Type') || 'application/octet-stream',
			'Content-Range': `bytes ${start}-${end}/${size}`,
			'Content-Length': String(end - start + 1),
			'Accept-Ranges': 'bytes'
		}
	});
}

async function networkFirst(req) {
	const cache = await caches.open(APP);
	try {
		const res = await fetch(req);
		if (res.ok && !req.url.includes('/log')) cache.put(req, res.clone());
		return res;
	} catch (err) {
		const hit = (await cache.match(req, { ignoreSearch: true })) || (req.mode === 'navigate' && (await cache.match('index.html')));
		if (hit) return hit;
		throw err;
	}
}

