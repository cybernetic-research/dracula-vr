// Tiny zero-dependency static server for the game.
//
//   node tools/serve.mjs            -> http://localhost:8080  (WebXR works on localhost)
//   node tools/serve.mjs --https    -> https://<lan-ip>:8443  (self-signed, for a Quest on your LAN)
//
// WebXR needs a "secure context": either localhost or HTTPS. For a Quest you can
// either use --https (accept the certificate warning in the Quest browser) or
// keep plain http and run `adb reverse tcp:8080 tcp:8080` with the headset
// plugged in, then open http://localhost:8080 on the headset.
//
//   --open              opens http://localhost:8080 in the default browser once the server is up (the launchers use it).
//   --media <dir>       serves the folder you prepared from your own disc (game.json, video/, img/) at /media/.
//                       Only run this on your own network: it shares that folder with anyone who can reach it.

import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Serves the game folder, or another folder given with --root <dir> (used by add-ons
// that include this repo as a submodule)
const rootArg = process.argv.indexOf('--root');
const root = rootArg > 0 ? path.resolve(process.argv[rootArg + 1]) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const useHttps = process.argv.includes('--https');
// --media <dir>: serves that folder at /media/ (what tools/prepare.sh made from your disc, kept outside the repo)
const mediaArg = process.argv.indexOf('--media');
const media = mediaArg > 0 ? path.resolve(process.argv[mediaArg + 1]) : null;
const port = Number(process.env.PORT) || (useHttps ? 8443 : 8080);

const types = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.mjs': 'text/javascript; charset=utf-8',
	'.json': 'application/json',
	'.webmanifest': 'application/manifest+json',
	'.css': 'text/css',
	'.woff2': 'font/woff2',
	'.png': 'image/png',
	'.webp': 'image/webp',
	'.jpg': 'image/jpeg',
	'.svg': 'image/svg+xml',
	'.glb': 'model/gltf-binary',
	'.ogg': 'audio/ogg',
	'.mp3': 'audio/mpeg',
	'.m4a': 'audio/mp4',
	'.mp4': 'video/mp4',
	'.wasm': 'application/wasm'
};

function handler(req, res) {
	// POST /log: lines from the page (the game sends its input and state log here when run with ?log=1), printed
	// here so a headset's behaviour can be followed from the computer
	if (req.method === 'POST' && req.url.startsWith('/log')) {
		let body = '';
		req.on('data', (d) => (body.length < 65536 ? (body += d) : null));
		req.on('end', () => {
			for (const line of body.split('\n')) if (line) console.log(`[page] ${line}`);
			res.writeHead(204);
			res.end();
		});
		return;
	}
	let urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
	if (urlPath.endsWith('/')) urlPath += 'index.html';
	let file = path.join(root, urlPath);
	const inMedia = media && urlPath.startsWith('/media/');
	if (inMedia) file = path.join(media, urlPath.slice(7));
	if (!file.startsWith(inMedia ? media + path.sep : root)) {
		res.writeHead(403).end();
		return;
	}
	fs.stat(file, (err, stat) => {
		if (err || !stat.isFile()) {
			res.writeHead(404).end('not found');
			return;
		}
		const type = types[path.extname(file).toLowerCase()] || 'application/octet-stream';
		const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || '');
		if (range) {
			const start = Number(range[1]);
			const end = Math.min(range[2] ? Number(range[2]) : stat.size - 1, stat.size - 1);
			if (start > end) {
				res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` }).end();
				return;
			}
			res.writeHead(206, {
				'Content-Type': type,
				'Content-Length': end - start + 1,
				'Content-Range': `bytes ${start}-${end}/${stat.size}`,
				'Accept-Ranges': 'bytes',
				'Cache-Control': 'no-cache'
			});
			if (req.method === 'HEAD') res.end();
			else fs.createReadStream(file, { start, end }).pipe(res);
			return;
		}
		res.writeHead(200, {
			'Content-Type': type,
			'Content-Length': stat.size,
			'Accept-Ranges': 'bytes',
			'Cache-Control': 'no-cache'
		});
		if (req.method === 'HEAD') {
			res.end();
			return;
		}
		fs.createReadStream(file).pipe(res);
	});
}

function lanAddresses() {
	return Object.values(os.networkInterfaces())
		.flat()
		.filter((a) => a && a.family === 'IPv4' && !a.internal)
		.map((a) => a.address);
}

function openBrowser(url) {
	if (!process.argv.includes('--open')) return;
	const cmd = process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
	try {
		execSync(cmd, { stdio: 'ignore' });
	} catch {}
}

// a self-signed certificate, made once with openssl (on Windows, Git for Windows brings one)
function makeCert(key, cert) {
	const tries = ['openssl'];
	if (process.platform === 'win32')
		for (const base of [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA + '\\Programs'])
			if (base) tries.push(path.join(base, 'Git', 'usr', 'bin', 'openssl.exe'));
	for (const bin of tries) {
		try {
			execSync(`"${bin}" req -x509 -newkey rsa:2048 -nodes -days 825 -subj "/CN=dracula-vr" -keyout "${key}" -out "${cert}"`, {
				stdio: 'ignore',
				env: { ...process.env, MSYS_NO_PATHCONV: '1' }
			});
			if (fs.existsSync(cert)) return true;
		} catch {}
	}
	return false;
}

// plain http on localhost (flat play on this computer; WebXR also counts localhost as secure)
const httpPort = useHttps ? 8080 : port;
http.createServer(handler).listen(httpPort, () => {
	console.log(`Serving ${root}`);
	if (media) console.log(`Media folder: ${media} (at /media/)`);
	console.log(`On this computer:  http://localhost:${httpPort}/`);
	openBrowser(`http://localhost:${httpPort}/`);
});

if (useHttps) {
	const certDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '.cert');
	const key = path.join(certDir, 'key.pem');
	const cert = path.join(certDir, 'cert.pem');
	let ok = fs.existsSync(key) && fs.existsSync(cert);
	if (!ok) {
		fs.mkdirSync(certDir, { recursive: true });
		console.log('Generating self-signed certificate...');
		ok = makeCert(key, cert);
	}
	if (ok)
		https.createServer({ key: fs.readFileSync(key), cert: fs.readFileSync(cert) }, handler).listen(port, () => {
			console.log('On the Quest (accept the certificate warning once):');
			for (const ip of lanAddresses()) console.log(`  https://${ip}:${port}/`);
		});
	else
		console.log(
			'No openssl found, so no https for the Quest. Install Git for Windows (it includes openssl) and run this again,\n' +
				'or plug the Quest in and run `adb reverse tcp:8080 tcp:8080`, then open http://localhost:8080 on the Quest.'
		);
}
