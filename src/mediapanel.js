// The media panel on the page (flat view, before entering VR): shows whether this browser holds the media made from
// your disc, imports it from a zip, removes it. Small in a corner when the game has its media; in the middle, with the
// instructions, when it has none.
import { registerWorker, mediaStatus, importZips, clearMedia, gb } from './mediastore.js';

const $ = (id) => document.getElementById(id);
const panel = $('media'), status = $('media-status'), help = $('media-help'), bar = $('media-progress');
const clearBtn = $('media-clear'), addLabel = $('media-add'), fileInput = $('media-file');

async function servedByComputer() {
	// HEAD bypasses the service worker, so this asks the server itself (tools/serve.mjs --media)
	try {
		return (await fetch('media/game.json', { method: 'HEAD', cache: 'no-store' })).ok;
	} catch {
		return false;
	}
}

async function refresh() {
	const [s, served] = await Promise.all([mediaStatus(), servedByComputer()]);
	panel.hidden = false;
	clearBtn.hidden = !s.files;
	clearBtn.textContent = 'Remove from this device';
	delete clearBtn.dataset.armed;
	if (s.parts?.missing.length) {
		const have = s.parts.of - s.parts.missing.length;
		status.textContent = `Added ${have} of ${s.parts.of} parts. Still to add: ${s.parts.missing.map((i) => `dracula-media-${i}-of-${s.parts.of}.zip`).join(', ')}.`;
		panel.classList.add('open');
		help.hidden = false;
	} else if (s.game) {
		status.textContent = `Media on this device: ${s.videos} scenes${s.videos3d ? `, ${s.videos3d} in 3D` : ', flat only'} (${gb(s.bytes)}).`;
		panel.classList.remove('open');
		help.hidden = true;
	} else if (served) {
		status.textContent = 'Media served by your computer.';
		panel.classList.remove('open');
		help.hidden = true;
	} else {
		status.textContent = s.files ? 'The media on this device is incomplete (no game.json): add the zip again.' : 'This device has no game media yet.';
		panel.classList.add('open');
		help.hidden = false;
	}
	if (!('caches' in self) || !navigator.serviceWorker) {
		status.textContent += ' This browser cannot keep the media (it needs https).';
		addLabel.hidden = true;
	}
}

fileInput.addEventListener('change', async () => {
	const files = [...fileInput.files];
	fileInput.value = '';
	if (!files.length) return;
	addLabel.hidden = clearBtn.hidden = true;
	bar.hidden = false;
	try {
		const r = await importZips(files, ({ done, total, file }) => {
			bar.value = total ? done / total : 0;
			status.textContent = file ? `Copying ${file}… ${gb(done)} of ${gb(total)}` : 'Done.';
		});
		status.textContent = `Added ${r.files} files (${gb(r.bytes)}).`;
		// reload so the game starts with its media (and under the service worker, if it was not yet)
		setTimeout(() => location.reload(), 800);
	} catch (e) {
		status.textContent = `Could not add the media: ${e.message || e}`;
		addLabel.hidden = false;
		bar.hidden = true;
	}
});

clearBtn.addEventListener('click', async () => {
	if (!clearBtn.dataset.armed) {
		clearBtn.dataset.armed = '1';
		clearBtn.textContent = 'Really remove? Click again';
		return;
	}
	await clearMedia();
	location.reload();
});

registerWorker();
refresh();
