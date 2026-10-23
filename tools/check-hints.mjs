// Spoiler-free check of the clues (src/hints.js): plays the game by doing what the clues say, as a player would,
// from the start and from many states reached by wandering about at random first. Prints only counts.
// usage: node tools/check-hints.mjs <media_dir>/game.json [trials]
import fs from 'node:fs';
import { Game } from '../src/engine.js';
import { nextStep } from '../src/hints.js';

const data = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const trials = Number(process.argv[3]) || 200;
let rs = 12345;
const rnd = () => (rs = (rs * 1103515245 + 12345) % 2147483648) / 2147483648;

const waitUntil = (g, t) => {
	while (!g.state.over && g.state.clock < t) g.passTime(Math.min(720, t - g.state.clock));
};
const goHome = (g) => g.state.location !== 0 && g.travel(0);

// what a player does with the clue's three levels
function follow(g, h) {
	if (h.slept) {
		goHome(g);
		if (!g.state.over) g.sleep();
	}
	g.carry(h.carry);
	if (h.how === 'visit') {
		if (g.state.location !== h.loc) g.travel(h.loc);
		else if (g.state.clock >= h.lo) g.passTime(5);
		waitUntil(g, h.lo);
	} else if (h.how === 'travel') {
		waitUntil(g, h.lo);
		if (h.loc == null) g.travel(g.state.location === 0 ? 5 : 0);
		else {
			if (g.state.location === h.loc) g.travel(h.loc === 0 ? 5 : 0);
			if (!g.state.over) g.travel(h.loc);
		}
	} else {
		goHome(g);
		waitUntil(g, h.lo);
		if (g.state.over) return;
		if (h.how === 'sleep') g.sleep();
		else {
			const t = g.telegramOptions().find((o) => o.label === h.telegram);
			if (t) g.readTelegram(t);
		}
	}
}

// follows the clues to the end: 'won', 'died', 'lost' (the clues saw no way), or 'stuck' (a clue changed nothing)
function play(g) {
	let same = 0, clues = 0;
	while (!g.state.over && clues < 400) {
		const h = nextStep(data, g.state);
		if (h.lost) return { end: 'lost', clues };
		const before = g.save();
		follow(g, h);
		clues++;
		same = g.save() === before ? same + 1 : 0;
		if (same >= 3) return { end: 'stuck', clues };
	}
	return { end: g.state.over === 'win' ? 'won' : g.state.over === 'death' ? 'died' : 'stuck', clues };
}

const t0 = Date.now();
const fromStart = play(new Game(data, rnd));
console.log(`from the start: ${fromStart.end} after ${fromStart.clues} clues (${((Date.now() - t0) / Math.max(1, fromStart.clues)).toFixed(0)} ms a clue)`);

// wander first: random rides to known addresses, waits, nights at home
const tally = {};
for (let i = 0; i < trials; i++) {
	const g = new Game(data, rnd);
	const n = Math.floor(rnd() * 25);
	for (let k = 0; k < n && !g.state.over; k++) {
		const r = rnd();
		if (r < 0.5) g.travel(g.state.addresses[Math.floor(rnd() * g.state.addresses.length)]);
		else if (r < 0.8) g.passTime(15 + Math.floor(rnd() * 12) * 15);
		else {
			goHome(g);
			if (!g.state.over) g.sleep();
		}
		if (rnd() < 0.3 && g.state.items.length) g.carry(g.state.items[Math.floor(rnd() * g.state.items.length)]);
	}
	const end = g.state.over ? 'died while wandering' : play(g).end;
	tally[end] = (tally[end] || 0) + 1;
}
console.log(`after wandering (${trials} games):`, JSON.stringify(tally));
