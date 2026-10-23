// Spoiler-free solvability check for game.json: the planner (src/planner.js) looks for a way to reach each ending
// using the engine (src/engine.js) and this prints only whether it got there, how many steps it took and which kinds
// of step (never where, when or what). Use it after changing the extractor, the engine or the planner.
// usage: node tools/solve.mjs <media_dir>/game.json [-v]
import fs from 'node:fs';
import { Game } from '../src/engine.js';
import { ruleSources, endings, plan, execute } from '../src/planner.js';

const data = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const verbose = process.argv.includes('-v');
const L = data.lists;

const sources = ruleSources(data);
const start = new Game(data).state;
let rs = 3;
const rnd = () => (rs = (rs * 1103515245 + 12345) % 2147483648) / 2147483648;
const wins = endings(data);
for (const w of wins) {
	const order = plan(data, start, w, sources);
	if (!order) {
		console.log(`ending ${wins.indexOf(w) + 1}: no plan found`);
		continue;
	}
	const { g, kinds, step } = execute(data, start, order, rnd);
	if (verbose && g.state.over === 'death') {
		const missing = [];
		for (const id of L.travelGlobal) for (const p of data.rules[id]) if (p.a.some((a) => a[0] === 'death') && p.c.every((c) => c[0] === 'rand' || c[0] === 't' || g.test(c, { t: g.state.clock, rand: 0 })))
			missing.push(id + ':' + p.c.filter((c) => c[0] === 'flag').map((c) => (c[2] ? '+' : '-') + c[1]).join(''));
		console.log(`  died at step ${step}/${order.length}, day ${Math.floor((g.state.clock - 519840) / 1440)} ${Math.floor((g.state.clock % 1440) / 60)}h, awake ${Math.round((g.state.clock - g.state.wake) / 60)}h; deadline rules matching: ${missing.join(' ')}`);
		const next = order.filter((s) => s.acts.some((a) => a[0] === 'set' && !g.state.flags[a[1]]));
		console.log('  not done:', next.map((s) => `${s.how}@${s.loc}[${Math.floor((s.lo - 519840) / 1440)}d${Math.floor((s.lo % 1440) / 60)}-${Math.floor((s.hi % 1440) / 60)}h]`).join(' '));
	}
	const epi = g.state.over === 'win' && g.epilogue().fired;
	console.log(`ending ${wins.indexOf(w) + 1}: plan of ${order.length} steps -> ${g.state.over === 'win' ? 'WON' + (epi ? ', epilogue plays' : ', no epilogue') : 'not won (' + (g.state.over || 'still playing') + ')'}` +
		(verbose ? ' ' + JSON.stringify(kinds) : ''));
}
