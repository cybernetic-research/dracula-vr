// Checks game.json without spoiling it: searches the game with a goal-directed player and reports only coverage
// (how many scenes can be reached, whether the game can be won, how many ways to die). Nothing about the route is
// printed. The player's moves are "go and trigger rule R": travel to R's address carrying the item R asks for and
// wait there for R's time window, offered only when R's flag and item requirements already hold; plus sleeping
// and the telegram tray at home. States are kept in an archive keyed by story progress (earliest
// clock wins) and extended at random (go-explore).
// usage: node tools/check.mjs <media_dir>/game.json [rounds]
import fs from 'node:fs';
import { Game } from '../src/engine.js';

const data = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const rounds = Number(process.argv[3] || 20000);
let seed = 7;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const pick = (a) => a[Math.floor(rnd() * a.length)];

// every firing path of every arrival rule, with its address, item, and time window
const goals = [];
data.lists.arrive.forEach((l, loc) =>
	l.forEach((id) =>
		data.rules[id].forEach((p) => {
			if (!p.r) return;
			const lo = Math.max(0, ...p.c.filter((c) => c[0] === 't' && c[1][0] === '>').map((c) => c[2] + (c[1] === '>' ? 1 : 0)));
			const hi = Math.min(1e9, ...p.c.filter((c) => c[0] === 't' && c[1][0] === '<').map((c) => c[2] + (c[1] === '<=' ? 1 : 0)));
			const carry = (p.c.find((c) => c[0] === 'carry' && c[2]) || [0, 0])[1];
			goals.push({ loc, lo, hi, carry, flags: p.c.filter((c) => c[0] === 'flag') });
		})
	)
);

const seen = new Set(), deaths = new Set(), wins = new Set();
const archive = new Map();
const key = (s) => s.flags.join('') + '|' + [...s.items].sort().join(',') + '|' + s.addresses.length;
const game = new Game(data, rnd);
const store = () => {
	const s = game.state, k = key(s), old = archive.get(k);
	if (!old || s.clock < old.clock) archive.set(k, { state: game.save(), clock: s.clock, visits: old ? old.visits : 0, score: s.flags.reduce((a, b) => a + b, 0) });
};
store();
let errors = 0;

function moves() {
	const s = game.state, out = [], other = [];
	for (const g of [...goals].sort((a, b) => a.hi - b.hi)) {
		if (!s.addresses.includes(g.loc) || (g.carry && !s.items.includes(g.carry))) continue;
		if (!g.flags.every((c) => !!s.flags[c[1]] === c[2])) continue;
		const there = s.clock + (s.location === g.loc ? 0 : game.travelMinutes(g.loc));
		if (there >= g.hi || g.lo - there > 1440) continue;
		out.push(() => {
			game.carry(g.carry);
			const res = s.location === g.loc ? [] : game.travel(g.loc);
			while (!game.state.over && game.state.clock < g.lo) res.push(...game.passTime(Math.min(720, g.lo - game.state.clock)));
			if (!game.state.over) res.push(game.arrive());
			return res;
		});
	}
	if (s.location !== 0) other.push(() => game.travel(0));
	else {
		other.push(() => [game.sleep()].filter(Boolean));
		for (const t of game.telegramOptions()) out.unshift(() => [game.readTelegram(t)]);
	}
	other.push(() => game.passTime(pick([30, 60, 180])));
	// mostly the most urgent goals (earliest closing window), sometimes anything
	const r = rnd();
	if (out.length && r < 0.5) return [out[Math.floor(rnd() * Math.min(3, out.length))]];
	if (out.length && r < 0.8) return out;
	return other;
}

for (let r = 0; r < rounds; r++) {
	const cells = [...archive.values()];
	let best = null, bw = -1;
	for (let k = 0; k < 6; k++) {
		const c = pick(cells), w = c.score * 3 - (c.clock - 519840) / 240 + 3 / (1 + c.visits) + rnd() * 2;
		if (w > bw) (bw = w), (best = c);
	}
	best.visits++;
	game.load(best.state);
	for (let step = 0; step < 30 && !game.state.over; step++) {
		let res;
		try {
			res = pick(moves())();
		} catch (e) {
			if (errors++ < 3) console.error(e);
			break;
		}
		for (const x of res) if (x && x.scene != null) {
			seen.add(x.scene);
			if (x.over === 'death') deaths.add(x.scene);
			if (x.over === 'win') wins.add(x.scene);
		}
		if (!game.state.over) store();
	}
}
const all = new Set();
for (const ps of Object.values(data.rules)) for (const p of ps) for (const a of p.a) if (['scene', 'death', 'win'].includes(a[0])) all.add(a[1]);
const most = Math.max(...[...archive.values()].map((c) => c.score));
console.log(`${rounds} rounds, ${archive.size} states: ${seen.size}/${all.size} scenes reached, ${deaths.size} death scenes, ` +
	`${wins.size} winning scenes, most flags in one game ${most}, ${errors} errors`);
console.log(`not reached: ${[...all].filter((x) => !seen.has(x)).length} scenes`);
if (process.env.DEBUG) {
	const { clockText } = await import('../src/engine.js');
	const best = [...archive.values()].sort((a, b) => b.score - a.score || a.clock - b.clock)[0];
	game.load(best.state);
	const s = game.state;
	console.log('best', best.score, clockText(s.clock), 'awake', Math.round((s.clock - s.wake) / 60), 'h');
	const block = {};
	for (const g of goals) {
		if (g.hi <= s.clock) continue;
		const why = [];
		if (!s.addresses.includes(g.loc)) why.push('addr' + g.loc);
		if (g.carry && !s.items.includes(g.carry)) why.push('item' + g.carry);
		for (const c of g.flags) if (!!s.flags[c[1]] !== c[2]) why.push((c[2] ? '+' : '-') + c[1]);
		const k = why.join(' ') || 'OPEN';
		block[k] = (block[k] || 0) + 1;
	}
	console.log(Object.entries(block).sort((a, b) => b[1] - a[1]).slice(0, 25));
	// deadlines ahead
	for (const id of data.lists.travelGlobal) for (const p of data.rules[id]) if (p.r && p.c.every((c) => c[0] !== 'flag' || !!s.flags[c[1]] === c[2] || true)) {
		const t = p.c.find((c) => c[0] === 't');
		if (t && t[2] > s.clock - 1440) console.log('deadline rule', id, clockText(t[2], true), p.c.filter((c) => c[0] === 'flag').map((c) => (c[2] ? '+' : '-') + c[1] + (!!s.flags[c[1]] === c[2] ? '✓' : '✗')).join(' '));
	}
}
