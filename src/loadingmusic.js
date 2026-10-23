// Music while the media is copied in ("Add media": a few minutes on a Quest for all the scenes): an original gothic
// piece, synthesized live with Web Audio, so it needs no file and nothing in it is from the disc. A church organ in a
// stone hall plays the opening of Bach's Toccata and Fugue in D minor (the composition is long out of copyright; this
// rendering is our own), then the hall broods: soft organ chords, a tolling bell, wind, a slow glass-harmonica tune,
// distant thunder and a heartbeat that quickens, and the toccata comes round again (about a minute and a half a turn).

const freq = (n) => 440 * 2 ** ((n - 69) / 12);
// 'A5', 'C#4', 'Bb2' -> midi note number
function note(name) {
	const m = /^([A-G])([#b]?)(\d)$/.exec(name);
	return 12 * (Number(m[3]) + 1) + { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}

// organ stops as [harmonic, level]: a bright principal for the toccata, a soft flute for the chords
const PRINCIPAL = [[0.5, 0.35], [1, 1], [2, 0.55], [3, 0.2], [4, 0.3], [6, 0.08], [8, 0.1]];
const FLUTE = [[1, 1], [2, 0.25], [3, 0.08]];
// a church bell's partials as [ratio to the strike note, level, seconds to die away]
const BELL = [[0.5, 0.5, 7], [1, 0.8, 5], [1.19, 0.45, 4], [1.5, 0.3, 3], [2, 0.6, 3.5], [2.51, 0.2, 2], [2.66, 0.18, 2], [3.01, 0.15, 1.5], [4.17, 0.1, 1]];

// The score for one turn: [seconds from the start of the turn, (music, time) => void], in time order
function score() {
	const ev = [];
	const at = (t, f) => ev.push([t, f]);
	let t = 0.3;
	// the toccata's famous phrase, three times, an octave lower each time
	for (const o of [5, 4, 3]) {
		for (const [n, d] of [['A', 0.11], ['G', 0.11], ['A', 1.5], [null, 0.45], ['G', 0.13], ['F', 0.13], ['E', 0.13], ['D', 0.13], ['C#', 0.85], ['D', 1.7]]) {
			if (n) at(t, (m, s) => m.organ(s, note(n + o), d - 0.01));
			t += d;
		}
		t += 0.5;
	}
	// the low pedal D, the diminished chord rolling up over it, held, then resolving to D minor
	at(t, (m, s) => m.organ(s, note('D2'), 6.2, { level: 0.08 }));
	t += 1.6;
	const roll = ['C#3', 'E3', 'G3', 'Bb3', 'C#4', 'E4', 'G4', 'Bb4', 'C#5', 'E5'];
	roll.forEach((n, i) => at(t + i * 0.09, (m, s) => m.organ(s, note(n), 2.6 - i * 0.09, { level: 0.04 })));
	t += 2.7;
	for (const n of ['D3', 'F3', 'A3', 'D4', 'F4', 'A4', 'D5']) at(t, (m, s) => m.organ(s, note(n), 3.6, { level: 0.04, release: 1.5 }));
	at(t, (m, s) => m.organ(s, note('D2'), 3.6, { level: 0.07, release: 1.5 }));
	t += 6;

	// the hall broods: eight chords of eight seconds, the bell tolling each one in
	const start = t;
	const chords = [
		['D3', 'F3', 'A3'],
		['Bb2', 'D3', 'F3'],
		['G2', 'Bb2', 'D3'],
		['A2', 'C#3', 'E3', 'G3'],
		['D3', 'F3', 'A3'],
		['Eb3', 'G3', 'Bb3'],
		['C#3', 'E3', 'G3', 'Bb3'],
		['A2', 'C#3', 'E3', 'G3']
	];
	at(start, (m, s) => m.wind(s, 68));
	at(start, (m, s) => m.organ(s, note('D2'), 63, { stops: FLUTE, level: 0.05, attack: 4, release: 3 }));
	chords.forEach((c, i) => {
		const s0 = start + i * 8;
		at(s0, (m, s) => m.bell(s, note('D3')));
		for (const n of c) at(s0, (m, s) => m.organ(s, note(n), 7.6, { stops: FLUTE, level: 0.035, attack: 1.5, release: 1.2 }));
	});
	let u = start + 2;
	for (const [n, d] of [['A4', 4], ['D5', 4], ['F5', 3], ['E5', 1], ['D5', 4], ['Bb4', 4], ['D5', 4], ['C#5', 4], ['A4', 4], ['D5', 4], ['F5', 4], ['G5', 4], ['Eb5', 4], ['C#5', 4], ['Bb4', 4], ['A4', 6]]) {
		at(u, (m, s) => m.harmonica(s, note(n), d));
		u += d;
	}
	at(start + 21, (m, s) => m.thunder(s, 0.7));
	at(start + 51, (m, s) => m.thunder(s, 1));
	// a heartbeat for the last 24 seconds, quickening
	for (let h = start + 40, gap = 1.05; h < start + 64; h += gap, gap = Math.max(0.72, gap - 0.015)) at(h, (m, s) => m.heartbeat(s));
	ev.sort((a, b) => a[0] - b[0]);
	return { ev, length: start + 66 };
}

export class LoadingMusic {
	// ctx: an AudioContext of your own (an OfflineAudioContext to render it); by default one is made on first use
	constructor(ctx = null) {
		this.ctx = ctx;
		this.timer = null;
		this.score = score();
	}

	get playing() {
		return !!this.timer;
	}

	// call from a click or tap: browsers only let sound start after one
	unlock() {
		this.ctx ||= new (window.AudioContext || window.webkitAudioContext)();
		if (this.ctx.state === 'suspended') this.ctx.resume();
	}

	start() {
		if (this.timer) return;
		this.unlock();
		this.begin();
		// schedule a little ahead, in small steps, so a busy page (the import) does not make it stutter
		this.timer = setInterval(() => this.pump(this.ctx.currentTime + 1), 200);
		this.pump(this.ctx.currentTime + 1);
	}

	stop(fade = 2) {
		if (!this.timer) return;
		clearInterval(this.timer);
		this.timer = null;
		const g = this.master.gain, t = this.ctx.currentTime;
		g.cancelScheduledValues(t);
		g.setValueAtTime(g.value, t);
		g.linearRampToValueAtTime(0, t + fade);
		// what was already scheduled plays on into a silent, unplugged output
		const master = this.master;
		setTimeout(() => master.disconnect(), fade * 1000 + 100);
	}

	// a fresh output (organ hall reverb, a compressor) and the score from the top
	begin() {
		const c = this.ctx, t = c.currentTime;
		this.master = c.createGain();
		this.master.gain.setValueAtTime(0, t);
		this.master.gain.linearRampToValueAtTime(0.8, t + 1.5);
		const comp = c.createDynamicsCompressor();
		comp.threshold.value = -18;
		comp.ratio.value = 6;
		this.master.connect(comp).connect(c.destination);
		this.bus = c.createGain();
		const reverb = c.createConvolver();
		reverb.buffer = this.hall(4.5);
		const wet = c.createGain();
		wet.gain.value = 0.55;
		this.bus.connect(this.master);
		this.bus.connect(reverb).connect(wet).connect(this.master);
		this.noiseBuf ||= this.makeNoise();
		this.i = 0;
		this.turn = t + 0.1;
	}

	// plays every event that falls before the horizon (seconds on the audio clock)
	pump(horizon) {
		const { ev, length } = this.score;
		for (;;) {
			const [et, f] = ev[this.i];
			const s = this.turn + et;
			if (s > horizon) break;
			f(this, Math.max(s, this.ctx.currentTime));
			if (++this.i === ev.length) (this.i = 0), (this.turn += length);
		}
	}

	// a stone hall's echo: noise dying away over a few seconds, the highs fading first
	hall(seconds) {
		const c = this.ctx, n = Math.floor(c.sampleRate * seconds);
		const buf = c.createBuffer(2, n, c.sampleRate);
		for (let ch = 0; ch < 2; ch++) {
			const d = buf.getChannelData(ch);
			let lp = 0;
			for (let i = 0; i < n; i++) {
				const k = Math.min(0.9, 0.2 + i / n);
				lp = lp * k + (Math.random() * 2 - 1) * (1 - k);
				d[i] = lp * Math.exp(-i / (c.sampleRate * 0.65)) * 2;
			}
		}
		return buf;
	}

	makeNoise() {
		const c = this.ctx, buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
		const d = buf.getChannelData(0);
		for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
		return buf;
	}

	noise(t, dur, type, f, q, level, attack = 0.005) {
		const c = this.ctx;
		const src = c.createBufferSource();
		src.buffer = this.noiseBuf;
		src.loop = true;
		const fl = c.createBiquadFilter();
		fl.type = type;
		fl.frequency.value = f;
		fl.Q.value = q;
		const g = c.createGain();
		g.gain.setValueAtTime(0.0001, t);
		g.gain.exponentialRampToValueAtTime(level, t + attack);
		g.gain.exponentialRampToValueAtTime(0.0001, t + attack + dur);
		src.connect(fl).connect(g).connect(this.bus);
		src.start(t, Math.random());
		src.stop(t + attack + dur + 0.05);
		return { fl, g };
	}

	organ(t, n, dur, { stops = PRINCIPAL, level = 0.06, attack = 0.03, release = 0.25 } = {}) {
		const c = this.ctx, f = freq(n);
		const g = c.createGain();
		g.gain.setValueAtTime(0, t);
		g.gain.linearRampToValueAtTime(level, t + attack);
		g.gain.setValueAtTime(level, t + Math.max(attack, dur));
		g.gain.linearRampToValueAtTime(0, t + Math.max(attack, dur) + release);
		g.connect(this.bus);
		for (const [r, a] of stops) {
			if (f * r > 9000) continue;
			const o = c.createOscillator();
			o.frequency.value = f * r;
			const og = c.createGain();
			og.gain.value = a;
			o.connect(og).connect(g);
			o.start(t);
			o.stop(t + Math.max(attack, dur) + release + 0.05);
		}
		// the pipe's breathy "chiff" as it speaks
		if (stops === PRINCIPAL) this.noise(t, 0.05, 'bandpass', Math.min(8000, f * 3), 3, level * 0.6);
	}

	bell(t, n, level = 0.09) {
		const c = this.ctx, f = freq(n);
		for (const [r, a, d] of BELL) {
			const o = c.createOscillator();
			o.frequency.value = f * r;
			const g = c.createGain();
			g.gain.setValueAtTime(0.0001, t);
			g.gain.exponentialRampToValueAtTime(level * a, t + 0.004);
			g.gain.exponentialRampToValueAtTime(0.0001, t + d);
			o.connect(g).connect(this.bus);
			o.start(t);
			o.stop(t + d + 0.05);
		}
		this.noise(t, 0.04, 'highpass', 2500, 0.7, level * 0.5, 0.002);
	}

	// wind round the tower: two bands of noise, gusting and whistling at random
	wind(t, dur) {
		for (const [lo, hi, level, q] of [[250, 700, 0.06, 1.2], [900, 1800, 0.018, 6]]) {
			const { fl, g } = this.noise(t, dur, 'bandpass', lo, q, level, 3);
			g.gain.cancelScheduledValues(t);
			g.gain.setValueAtTime(0.0001, t);
			for (let s = t; s < t + dur - 3; s += 1.5 + Math.random() * 2.5) {
				fl.frequency.linearRampToValueAtTime(lo + Math.random() * (hi - lo), s);
				g.gain.linearRampToValueAtTime(level * (0.3 + Math.random() * 0.7), s);
			}
			g.gain.linearRampToValueAtTime(0.0001, t + dur);
		}
	}

	// a slow, wavering glass tone
	harmonica(t, n, dur, level = 0.05) {
		const c = this.ctx, f = freq(n);
		const g = c.createGain();
		g.gain.setValueAtTime(0, t);
		g.gain.linearRampToValueAtTime(level, t + 0.3);
		g.gain.setValueAtTime(level, t + dur - 0.2);
		g.gain.linearRampToValueAtTime(0, t + dur + 0.6);
		g.connect(this.bus);
		const lfo = c.createOscillator();
		lfo.frequency.value = 5.2;
		const depth = c.createGain();
		depth.gain.value = 8;
		lfo.connect(depth);
		for (const [r, a] of [[1, 1], [2, 0.12], [3, 0.05]]) {
			const o = c.createOscillator();
			o.frequency.value = f * r;
			depth.connect(o.detune);
			const og = c.createGain();
			og.gain.value = a;
			o.connect(og).connect(g);
			o.start(t);
			o.stop(t + dur + 0.7);
		}
		lfo.start(t);
		lfo.stop(t + dur + 0.7);
	}

	// far-off thunder: a slow low rumble that rolls a few times and dies away
	thunder(t, level) {
		const { fl, g } = this.noise(t, 7, 'lowpass', 160, 0.8, 0.25 * level, 0.4);
		g.gain.cancelScheduledValues(t);
		g.gain.setValueAtTime(0.0001, t);
		let s = t;
		for (const [d, v] of [[0.4, 1], [0.6, 0.55], [0.5, 0.9], [1, 0.4], [1.2, 0.6], [3.3, 0.0001]]) {
			s += d;
			g.gain.exponentialRampToValueAtTime(0.25 * level * v, s);
		}
		fl.frequency.setValueAtTime(260, t);
		fl.frequency.exponentialRampToValueAtTime(90, t + 7);
	}

	// lub-dub: low thumps, with a little more body than a speaker's bass alone
	heartbeat(t, level = 0.22) {
		for (const [d, v] of [[0, 1], [0.27, 0.7]]) {
			for (const [f0, f1, a] of [[70, 40, 1], [140, 80, 0.35]]) {
				const o = this.ctx.createOscillator();
				o.frequency.setValueAtTime(f0, t + d);
				o.frequency.exponentialRampToValueAtTime(f1, t + d + 0.15);
				const g = this.ctx.createGain();
				g.gain.setValueAtTime(0.0001, t + d);
				g.gain.exponentialRampToValueAtTime(level * v * a, t + d + 0.01);
				g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.25);
				o.connect(g).connect(this.bus);
				o.start(t + d);
				o.stop(t + d + 0.3);
			}
		}
	}
}
