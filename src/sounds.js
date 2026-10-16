// The original's sound bank (sound/s<id>.m4a, made from SOUNDS.DTA by tools/extract_sounds.py), played through Web
// Audio. Which clip plays for what is in SOUND_EVENTS (see NOTES.md, "Sounds"); a missing file is simply silent.
const cache = new Map();
let ctx = null;

function audio() {
	ctx ||= new (window.AudioContext || window.webkitAudioContext)();
	if (ctx.state === 'suspended') ctx.resume();
	return ctx;
}

async function buffer(base, id) {
	if (!cache.has(id))
		cache.set(
			id,
			fetch(`${base}sound/s${id}.m4a`)
				.then((r) => (r.ok ? r.arrayBuffer() : Promise.reject()))
				.then((b) => audio().decodeAudioData(b))
				.catch(() => null)
		);
	return cache.get(id);
}

export class Sounds {
	constructor(base) {
		this.base = base;
		this.current = null;
		this.volume = 0.9;
	}

	// plays one clip; resolves when it ends (or at once if it is missing). Only one clip at a time.
	async play(id, { volume = 1, keepList = false } = {}) {
		if (id == null) return;
		if (!keepList) this.list = null;
		const buf = await buffer(this.base, id);
		if (!buf) return;
		this.stopClip();
		const c = audio();
		const src = c.createBufferSource();
		src.buffer = buf;
		const g = c.createGain();
		g.gain.value = this.volume * volume;
		src.connect(g).connect(c.destination);
		this.current = src;
		return new Promise((resolve) => {
			src.onended = () => {
				if (this.current === src) this.current = null;
				resolve();
			};
			src.start();
		});
	}

	// plays clips one after another (a new play or stop() cuts the list short)
	async playList(ids) {
		const token = (this.list = {});
		for (const id of ids) {
			if (this.list !== token) return;
			await this.play(id, { keepList: true });
		}
	}

	stop() {
		this.list = null;
		this.stopClip();
	}

	stopClip() {
		try {
			this.current?.stop();
		} catch {}
		this.current = null;
	}

	preload(ids) {
		for (const id of ids) buffer(this.base, id);
	}
}

// Background music: the five ~2-minute pieces at the start of the bank (s0-s4). As the original's main screen does
// (0x13c96: base + a random one of the range, when music is on), a random piece starts each time you come back to the
// desk; it plays through once. Lowered while someone speaks; faded out during scenes.
export class Music {
	constructor(base) {
		this.base = base;
		this.el = new Audio();
		this.el.loop = false;
		this.el.volume = 0;
		this.track = null;
		this.want = 0;
		this.level = 0.22;
		this.enabled = true;
	}

	// a new random piece (when coming back to the desk)
	start() {
		if (!this.enabled) return;
		this.track = Math.floor(Math.random() * 5);
		this.el.src = `${this.base}sound/s${this.track}.m4a`;
		this.el.volume = 0;
		this.want = 1;
		this.el.play().catch(() => {});
	}

	fadeOut() {
		this.want = 0;
	}

	// call every frame: fades towards the wanted level (ducked while a voice clip plays)
	update(dt, ducked) {
		const target = this.want * this.level * (ducked ? 0.35 : 1);
		const v = this.el.volume + Math.sign(target - this.el.volume) * Math.min(Math.abs(target - this.el.volume), dt * 0.25);
		this.el.volume = Math.max(0, Math.min(1, v));
		if (!this.want && this.el.volume === 0 && !this.el.paused) this.el.pause();
	}
}
