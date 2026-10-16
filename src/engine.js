// The game rules of Dracula Unleashed, run from game.json (made from your own disc by tools/extract_game.py).
// This file is the engine only: what the original program does around the rules (travel, waiting, sleeping,
// the telegram tray, carrying one item, deaths). No story content lives here.
//
// Rules: game.rules[id] is a list of paths {c: conditions, a: actions, r: fired}. Exactly one path matches the
// state, its actions run, and r says whether the rule "fired". A rule list runs its rules in order and stops at
// the first that fires (except the telegram list, where every rule runs). Conditions:
//   ['t', op, v]       the clock (minutes since 1 January) when the list started
//   ['rand', op, v]    a 0-99 roll made when the list started
//   ['flag', n, bool]  story flag n is set / not set
//   ['carry', n, bool] the item in your hand is / is not item n
//   ['awake', op, v]   minutes since you last woke up

export const DAY = 1440;

export class Game {
	constructor(data, random = Math.random) {
		this.data = data;
		this.random = random;
		this.newGame();
	}

	newGame() {
		const s = this.data.start;
		this.state = {
			clock: s.clock,
			location: s.location,
			flags: new Array(256).fill(0),
			items: [...s.items], // owned, in the order they were received
			carried: 0, // the one item you take with you (0 = none)
			journal: s.journal.map(([n, date]) => ({ n, date })),
			addresses: [...s.addresses],
			wake: s.clock,
			over: null, // 'death' | 'win'
			visited: [] // scene ids already played (for the scene log)
		};
	}

	save() {
		return JSON.stringify(this.state);
	}

	load(json) {
		this.state = JSON.parse(json);
	}

	// ---- the rule interpreter --------------------------------------------------------------------------------

	test(c, snap) {
		const s = this.state;
		const cmp = (a, op, b) =>
			op === '<' ? a < b : op === '>=' ? a >= b : op === '==' ? a === b : op === '!=' ? a !== b : op === '>' ? a > b : a <= b;
		switch (c[0]) {
			case 't':
				return cmp(snap.t, c[1], c[2]);
			case 'rand':
				return cmp(snap.rand, c[1], c[2]);
			case 'flag':
				return !!s.flags[c[1]] === c[2];
			case 'carry':
				return (s.carried === c[1]) === c[2];
			case 'awake':
				return cmp(s.clock - s.wake, c[1], c[2]);
		}
		throw new Error('unknown condition ' + c[0]);
	}

	runRule(id, snap, out) {
		const paths = this.data.rules[id];
		const p = paths.find((p) => p.c.every((c) => this.test(c, snap)));
		if (!p) return 0;
		for (const a of p.a) this.act(a, out);
		return p.r;
	}

	act(a, out) {
		const s = this.state;
		switch (a[0]) {
			case 'set':
				s.flags[a[1]] = 1;
				break;
			case 'scene':
				out.scene = a[1];
				break;
			case 'death':
				out.scene = a[1];
				out.over = 'death';
				break;
			case 'win':
				out.scene = a[1];
				out.over = 'win';
				break;
			case 'min':
				s.clock += a[1];
				break;
			case 'clock':
				s.clock = a[1];
				break;
			case 'wake':
				s.wake = s.clock;
				break;
			case 'journal': {
				// as the original (0x1ec58): a new page is undated until you open the journal; while the last page is
				// still undated, a newer one takes its place
				const last = s.journal[s.journal.length - 1];
				if (last && last.date == null) last.n = a[1];
				else if (s.journal.length < 115) s.journal.push({ n: a[1], date: null });
				(out.journal ||= []).push(a[1]);
				break;
			}
			case 'gain':
				if (!s.items.includes(a[1])) s.items.push(a[1]);
				(out.gained ||= []).push(a[1]);
				break;
			case 'lose':
				s.items = s.items.filter((i) => i !== a[1]);
				if (s.carried === a[1]) s.carried = 0;
				(out.lost ||= []).push(a[1]);
				break;
			case 'address':
				if (!s.addresses.includes(a[1])) {
					s.addresses.push(a[1]);
					(out.addresses ||= []).push(a[1]);
				}
				break;
			case 'option':
				(out.options ||= []).push({ n: a[1], fn: a[2][1] });
				break;
			default:
				throw new Error('unknown action ' + a[0]);
		}
	}

	// runs a rule list: first rule that fires wins (all: run every rule)
	runList(ids, all = false) {
		const snap = { t: this.state.clock, rand: Math.floor(this.random() * 100) };
		const out = { fired: false };
		for (const id of ids) {
			const r = this.runRule(id, snap, out);
			if (r) out.fired = true;
			if (r && !all) break;
		}
		return this.finish(out);
	}

	finish(out) {
		if (out.over) this.state.over = out.over;
		if (out.scene != null) {
			out.video = this.data.scenes[out.scene];
			if (!this.state.visited.includes(out.scene)) this.state.visited.push(out.scene);
		}
		return out;
	}

	// ---- what the player can do -------------------------------------------------------------------------------

	district(loc) {
		return this.data.locations[loc].district;
	}

	travelMinutes(dest) {
		return this.data.travel[this.district(this.state.location)][this.district(dest)];
	}

	// Take the carriage to a known address. Returns the scenes to play, in order: an event on the way (a death,
	// or a stop) and then whatever happens on arrival.
	travel(dest) {
		const s = this.state;
		if (s.over || !s.addresses.includes(dest)) return [];
		s.clock += this.travelMinutes(dest);
		s.location = dest;
		const steps = [];
		const L = this.data.lists;
		const way = this.runList([...L.travelGlobal, ...L.travel[dest]]);
		if (way.fired) steps.push(way);
		if (!s.over) steps.push(this.arrive());
		return steps;
	}

	// what happens at the current address now (on arrival, and again after waiting there)
	arrive() {
		return this.runList(this.data.lists.arrive[this.state.location]);
	}

	// Wait at the current address (the pocket watch: 5-minute steps, up to 12 hours), then look again
	passTime(minutes) {
		if (this.state.over) return [];
		minutes = Math.max(5, Math.min(720, Math.round(minutes / 5) * 5));
		this.state.clock += minutes;
		const L = this.data.lists;
		const way = this.runList(L.travelGlobal); // the deaths that come with the hour
		if (way.fired) return [way];
		return [this.arrive()];
	}

	// Go to bed at home. Only possible when one of the sleep rules allows it (the night's scene plays). The
	// longer you have been awake, the longer you sleep.
	sleep() {
		const s = this.state;
		if (s.over || s.location !== 0) return null;
		const out = this.runList(this.data.lists.sleep);
		if (!out.fired) return null;
		const awakeH = Math.floor((s.clock - s.wake) / 60);
		const [, hours] = this.data.sleepHours.find(([h]) => h == null || awakeH <= h);
		s.clock += hours * 60;
		s.wake = s.clock;
		out.slept = hours;
		return out;
	}

	// the telegram tray at home: labels come from TELEGRAM.DTA
	telegramOptions() {
		if (this.state.location !== 0 || this.state.over) return [];
		const save = JSON.stringify(this.state);
		const out = this.runList(this.data.lists.telegrams, true);
		Object.assign(this.state, JSON.parse(save)); // listing is free: only choosing one changes anything
		return (out.options || []).map((o) => ({ ...o, label: this.data.telegrams[o.n] }));
	}

	readTelegram(option) {
		const out = { fired: true };
		this.runRule(option.fn, { t: this.state.clock, rand: 0 }, out);
		return this.finish(out);
	}

	// after a winning scene: the epilogue that goes with it (keyed on which winning scene was seen)
	epilogue() {
		return this.runList(this.data.lists.epilogue);
	}

	// opening the journal dates the newest page with the time it is read (0x197d4); returns it if it was new
	openJournal() {
		const last = this.state.journal[this.state.journal.length - 1];
		if (last && last.date == null) {
			last.date = this.state.clock;
			return last;
		}
		return null;
	}

	carry(item) {
		if (item === 0 || this.state.items.includes(item)) this.state.carried = item;
	}
}

// as the original shows it: 'Thursday, December 28 - 7:05am' (the year is not shown)
export function clockText(min, short = false) {
	const date = new Date(Date.UTC(1899, 0, 1) + min * 60000);
	const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
	const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
	const h = date.getUTCHours(), m = date.getUTCMinutes();
	const t = `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')}${h < 12 ? 'am' : 'pm'}`;
	if (short) return t;
	return `${days[date.getUTCDay()]}, ${months[date.getUTCMonth()]} ${date.getUTCDate()} - ${t}`;
}
