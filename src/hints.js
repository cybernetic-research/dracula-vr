// Clues for a stuck player (the desk's Clue tab, only when switched on in the menu). Nothing is stored: when you ask,
// the planner (src/planner.js) works out a winning route from where you are now, and the clue is its next step,
// uncovered a level at a time: 1 what kind of thing to do and roughly where, 2 exactly where (and what to carry),
// 3 when. No story content lives here; the words come from the rules and the disc's own address and telegram texts.
import { ruleSources, endings, plan, execute } from './planner.js';
import { clockText } from './engine.js';

let sources = null;

// The next step towards a win from the state: { how, loc, carry, lo, hi, telegram, slept }, or { lost: true } when no
// winning route can be found from here, or null when the game is over.
export function nextStep(data, state) {
	if (state.over) return null;
	sources ||= ruleSources(data);
	let best = null;
	for (const w of endings(data)) {
		const order = plan(data, state, w, sources);
		if (!order) continue;
		// a few dice (some scenes depend on a roll, so one unlucky simulation is not the last word), and going to bed
		// sooner (a route can fail on being asleep, or awake too long, at the wrong time)
		search: for (const opts of [{}, { gap: 4 }])
			for (const seed of [3, 7, 11]) {
				let rs = seed;
				const rnd = () => (rs = (rs * 1103515245 + 12345) % 2147483648) / 2147483648;
				const { g, first } = execute(data, state, order, rnd, opts);
				if (g.state.over !== 'win') continue;
				if (first && (!best || order.length < best.length)) best = { first, length: order.length };
				break search;
			}
	}
	if (!best) return { lost: true };
	const { s, slept } = best.first;
	const opt = s.how === 'telegram' && s.p.a.find((a) => a[0] === 'option');
	return { how: s.how, loc: s.loc, carry: s.carry, lo: s.lo, hi: s.hi, telegram: opt ? data.telegrams[opt[1]] : null, slept };
}

// The clue's words, levels 1-3 (each adds to the one before). itemName: the port's item names (src/icons.js).
export function clueText(data, state, step, level, itemName) {
	if (step.lost)
		return ['The clues can find no way to win from here. Something may already have been missed for good: an earlier saved game may help.'];
	const L = step.loc != null ? data.locations[step.loc] : null;
	const district = L && data.districts[L.district];
	const lines = [];
	const nudge = {
		visit: `Something is waiting to be found in ${district}.`,
		travel: L ? `Something will happen on the road, on a carriage ride in ${district}.` : 'Something will happen on the road: a carriage ride.',
		sleep: 'Something will come to you in the night, at home.',
		telegram: 'There is a telegram at home that matters.'
	}[step.how];
	lines.push(nudge + (step.carry ? ' You will need to have something with you.' : ''));
	if (level >= 2) {
		const where = {
			visit: L && (state.location === step.loc ? `Stay here at ${L.name}.` : `Go to ${L.name}, ${L.address}.`),
			travel: L ? `Take a carriage to ${L.name}.` : 'Any ride will do.',
			sleep: 'Go home and go to bed.',
			telegram: `Read the telegram "${step.telegram}".`
		}[step.how];
		lines.push(where + (step.carry ? ` Take the ${itemName(step.carry).toLowerCase()} with you.` : ''));
	}
	if (level >= 3) {
		let when;
		if (step.lo > state.clock) when = `Not before ${clockText(step.lo)}${step.hi < 1e9 ? `, and before ${clockText(step.hi)}` : ''}: if you are early, wait with the watch.`;
		else if (step.hi < 1e9) when = `The time is right now, until ${clockText(step.hi)}.`;
		else when = 'The time is right now.';
		if (step.how === 'visit' && state.location === step.loc && step.lo <= state.clock) when += ' Pass a little time here with the watch.';
		if (step.slept) when += ' A night\'s sleep at home comes first.';
		lines.push(when);
	}
	return lines;
}
