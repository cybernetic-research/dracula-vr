// A route finder over game.json's rules, used by the clues (src/hints.js) and by the spoiler-free solvability check
// (tools/solve.mjs). A backward-chaining planner looks for the rule paths that lead to an ending from a given state,
// then plays them through on a copy of the game to see that they really win. No story content lives here: it reads
// only the rules.
import { Game } from './engine.js';

// every rule path that fires, with how the player makes it happen
export function ruleSources(data) {
	const L = data.lists;
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
	return sources;
}

// the endings: the ids of the winning scenes
export function endings(data) {
	const wins = new Set();
	for (const ps of Object.values(data.rules)) for (const p of ps) for (const a of p.a) if (a[0] === 'win') wins.add(a[1]);
	return [...wins];
}

// the deadlines: "after time T, if scene X has not happened, you die" makes X part of every route
function deadlines(data) {
	const flags = new Set();
	for (const id of data.lists.travelGlobal)
		for (const p of data.rules[id])
			if (p.a.some((a) => a[0] === 'death')) for (const c of p.c) if (c[0] === 'flag' && !c[2] && !p.a.some((a) => a[1] === c[1])) flags.add(c[1]);
	return flags;
}

// The rule paths (in the order found) that lead from the state to ending w, or null. Paths whose time is already
// past are left out.
export function plan(data, state, w, sources = ruleSources(data)) {
	const all = sources.filter((s) => s.hi > state.clock);
	all.push(...all.filter((s) => s.acts.some((a) => a[0] === 'win' && a[1] === w)).map((s) => ({ ...s, acts: [...s.acts, ['set', 1000 + w]] })));
	all.push({ how: 'goal', p: { c: [...deadlines(data), 1000 + w].map((f) => ['flag', f, true]) }, acts: [['set', 2000 + w]], lo: 0, hi: 1e9, carry: 0 });
	const order = [];
	const have = {
		set: new Set(state.flags.flatMap((f, i) => (f ? [i] : []))),
		gain: new Set(state.items),
		address: new Set(state.addresses)
	};
	const provides = (s, kind, n) => s.acts.some((a) => a[0] === kind && a[1] === n);
	const need = (kind, n, depth) => {
		if (have[kind].has(n)) return true;
		if (depth > 60) return false;
		const cands = all.filter((s) => provides(s, kind, n) && !s.rand).sort((a, b) => a.lo - b.lo);
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
	return need('set', 2000 + w, 0) ? order.filter((s) => s.how !== 'goal') : null;
}

// Plays a plan through on a copy of the game, from the state. Returns the game at the end, how many steps of each
// kind were taken, the step it stopped at, and the first step that changed anything (the next thing to do), with
// whether a night's sleep came before it. Options: byDeadline (steps that must happen soonest first, instead of
// those that can happen soonest), gap and awakeMax (hours: sleep when the next step is further off than gap, or
// after awakeMax hours awake).
export function execute(data, state, order, rnd, { byDeadline = false, gap = 8, awakeMax = 40 } = {}) {
	const g = new Game(data, rnd);
	g.load(JSON.stringify(state));
	order = [...order].sort(byDeadline ? (a, b) => a.hi - b.hi || a.lo - b.lo : (a, b) => a.lo - b.lo);
	const kinds = {};
	let slept = false, first = null;
	const bed = () => {
		if (g.state.location !== 0) g.travel(0);
		if (!g.state.over && g.sleep()) slept = true;
	};
	let step = 0;
	for (const s of order) {
		step++;
		if (g.state.over) break;
		if (s.acts.every((a) => a[0] !== 'set' || g.state.flags[a[1]])) continue; // already happened on the way
		const before = g.state.flags.join('');
		// sleep when it is late or the next step is tomorrow
		const awake = (g.state.clock - g.state.wake) / 60;
		if (s.lo - g.state.clock > gap * 60 || awake > awakeMax) bed();
		g.carry(s.carry);
		if (s.how === 'visit' || (s.how === 'travel' && s.loc != null)) {
			if (g.state.location !== s.loc) g.travel(s.loc);
		} else if (s.how === 'travel') {
			while (!g.state.over && g.state.clock < s.lo) g.passTime(Math.min(720, s.lo - g.state.clock));
			g.travel(g.state.location === 0 ? 5 : 0);
		} else if (g.state.location !== 0) g.travel(0);
		while (!g.state.over && g.state.clock < s.lo) g.passTime(Math.min(720, s.lo - g.state.clock));
		if (g.state.over) {
			first ||= { s, slept };
			break;
		}
		if (s.how === 'visit') g.arrive();
		else if (s.how === 'sleep') g.sleep();
		else if (s.how === 'telegram') {
			const t = g.telegramOptions().find((o) => o.fn === s.p.a.find((a) => a[0] === 'option')[2][1]);
			if (t) g.readTelegram(t);
		}
		if (!first && (g.state.flags.join('') !== before || g.state.over)) first = { s, slept };
		kinds[s.how] = (kinds[s.how] || 0) + 1;
	}
	return { g, kinds, step, first };
}
