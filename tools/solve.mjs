// Spoiler-free solvability check for game.json: a backward-chaining planner looks for a way to reach each ending
// using the engine (src/engine.js) and prints only whether it got there, how many steps it took and which kinds of
// step (never where, when or what). Use it after changing the extractor or the engine.
// usage: node tools/solve.mjs <media_dir>/game.json [-v]
import fs from 'node:fs';
import { Game } from '../src/engine.js';

const data = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const verbose = process.argv.includes('-v');
const L = data.lists;

// every rule path that fires, with how the player makes it happen
const sources = [];
const add = (how, ids, loc = null) =>
	ids.forEach((id) =>
		data.rules[id].forEach((p) => {
			if (!p.r && !p.a.some((a) => a[0] === 'option')) return;
			if (p.a.some((a) => a[0] === 'death')) return;
			const lo = Math.max(0, ...p.c.filter((c) => c[0] === 't' && c[1][0] === '>').map((c) => c[2]));
			const hi = Math.min(1e9, ...p.c.filter((c) => c[0] === 't' && c[1][0] === '<').map((c) => c[2]));
			const carry = (p.c.find((c) => c[0] === 'carry' && c[2]) || [0, 0])[1];
			let acts = p.a;
			const opt = p.a.find((a) => a[0] === 'option');
			if (opt) acts = data.rules[opt[2][1]][0].a; // a telegram: its effects come when it is read
			sources.push({ how, id, loc, p, lo, hi, carry, acts, rand: p.c.some((c) => c[0] === 'rand') });
		})
	);
L.arrive.forEach((ids, loc) => add('visit', ids, loc));
add('travel', L.travelGlobal);
L.travel.forEach((ids, loc) => add('travel', ids, loc));
add('sleep', L.sleep, 0);
add('telegram', L.telegrams, 0);

const start = new Game(data).state;
function plan(goal) {
	const order = [], have = { set: new Set(), gain: new Set(start.items), address: new Set(start.addresses) };
	const provides = (s, kind, n) => s.acts.some((a) => a[0] === kind && a[1] === n);
	const need = (kind, n, depth) => {
		if (have[kind].has(n)) return true;
		if (depth > 60) return false;
		const cands = sources.filter((s) => provides(s, kind, n) && !s.rand).sort((a, b) => a.lo - b.lo);
		for (const s of cands) {
			const ok =
				s.p.c.every((c) => c[0] !== 'flag' || !c[2] || need('set', c[1], depth + 1)) &&
				(!s.carry || need('gain', s.carry, depth + 1)) &&
				(s.loc == null || s.how !== 'visit' || need('address', s.loc, depth + 1));
			if (ok) {
				order.push(s);
				for (const a of s.acts) if (have[a[0]]) have[a[0]].add(a[1]);
				return true;
			}
		}
		return false;
	};
	return need(...goal, 0) ? order : null;
}

function execute(order, rnd) {
	const g = new Game(data, rnd);
	order = [...order].sort((a, b) => a.lo - b.lo);
	const kinds = {};
	const bed = () => {
		if (g.state.location !== 0) g.travel(0);
		if (!g.state.over) g.sleep();
	};
	let step = 0;
	for (const s of order) {
		step++;
		if (g.state.over) break;
		if (s.acts.every((a) => a[0] !== 'set' || g.state.flags[a[1]])) continue; // already happened on the way
		// sleep when it is late or the next step is tomorrow
		const awake = (g.state.clock - g.state.wake) / 60;
		if (s.lo - g.state.clock > 8 * 60 || awake > 40) bed();
		g.carry(s.carry);
		if (s.how === 'visit' || (s.how === 'travel' && s.loc != null)) {
			if (g.state.location !== s.loc) g.travel(s.loc);
		} else if (s.how === 'travel') {
			while (!g.state.over && g.state.clock < s.lo) g.passTime(Math.min(720, s.lo - g.state.clock));
			g.travel(g.state.location === 0 ? 5 : 0);
		} else if (g.state.location !== 0) g.travel(0);
		while (!g.state.over && g.state.clock < s.lo) g.passTime(Math.min(720, s.lo - g.state.clock));
		if (g.state.over) break;
		if (s.how === 'visit') g.arrive();
		else if (s.how === 'sleep') g.sleep();
		else if (s.how === 'telegram') {
			const t = g.telegramOptions().find((o) => o.fn === s.p.a.find((a) => a[0] === 'option')[2][1]);
			if (t) g.readTelegram(t);
		}
		kinds[s.how] = (kinds[s.how] || 0) + 1;
	}
	if (verbose && g.state.over === 'death') {
		const missing = [];
		for (const id of L.travelGlobal) for (const p of data.rules[id]) if (p.a.some((a) => a[0] === 'death') && p.c.every((c) => c[0] === 'rand' || c[0] === 't' || g.test(c, { t: g.state.clock, rand: 0 })))
			missing.push(id + ':' + p.c.filter((c) => c[0] === 'flag').map((c) => (c[2] ? '+' : '-') + c[1]).join(''));
		console.log(`  died at step ${step}/${order.length}, day ${Math.floor((g.state.clock - 519840) / 1440)} ${Math.floor((g.state.clock % 1440) / 60)}h, awake ${Math.round((g.state.clock - g.state.wake) / 60)}h; deadline rules matching: ${missing.join(' ')}`);
		const next = order.filter((s) => s.acts.some((a) => a[0] === 'set' && !g.state.flags[a[1]]));
		console.log('  not done:', next.map((s) => `${s.how}@${s.loc}[${Math.floor((s.lo - 519840) / 1440)}d${Math.floor((s.lo % 1440) / 60)}-${Math.floor((s.hi % 1440) / 60)}h]`).join(' '));
	}
	return { g, kinds };
}

const wins = new Set();
for (const ps of Object.values(data.rules)) for (const p of ps) for (const a of p.a) if (a[0] === 'win') wins.add(a[1]);
let rs = 3;
const rnd = () => (rs = (rs * 1103515245 + 12345) % 2147483648) / 2147483648;
for (const w of wins) {
	const sources_ = sources.filter((s) => s.acts.some((a) => a[0] === 'win' && a[1] === w));
	sources.push(...sources_.map((s) => ({ ...s, acts: [...s.acts, ['set', 1000 + w]] })));
	// the deadlines: "after time T, if scene X has not happened, you die" makes X part of every route
	const deadlines = new Set();
	for (const id of L.travelGlobal) for (const p of data.rules[id]) if (p.a.some((a) => a[0] === 'death'))
		for (const c of p.c) if (c[0] === 'flag' && !c[2] && !p.a.some((a) => a[1] === c[1])) deadlines.add(c[1]);
	sources.push({ how: 'goal', p: { c: [...deadlines, 1000 + w].map((f) => ['flag', f, true]) }, acts: [['set', 2000 + w]], lo: 0, hi: 1e9, carry: 0 });
	const order = plan(['set', 2000 + w])?.filter((s) => s.how !== 'goal');
	if (!order) {
		console.log(`ending ${[...wins].indexOf(w) + 1}: no plan found`);
		continue;
	}
	const { g, kinds } = execute(order, rnd);
	const epi = g.state.over === 'win' && g.epilogue().fired;
	console.log(`ending ${[...wins].indexOf(w) + 1}: plan of ${order.length} steps -> ${g.state.over === 'win' ? 'WON' + (epi ? ', epilogue plays' : ', no epilogue') : 'not won (' + (g.state.over || 'still playing') + ')'}` +
		(verbose ? ' ' + JSON.stringify(kinds) : ''));
}
