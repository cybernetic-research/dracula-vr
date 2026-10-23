// Original icons for this port, drawn with canvas paths (nothing here comes from the disc). Each item of the game
// (1-27) gets a short name (what the item is, as Alexander describes it on the disc) and a small engraving-style
// drawing of our own; item 1 is a photograph of a person, drawn as an empty frame.
// draw(ctx, x, y, size): (x, y) is the top-left corner of a size x size box.

const BRASS = '#c9a24a', INK = '#1d120a', PAPER = '#ead9b0', STEEL = '#b9c3cc', DARK = '#3a2617', RED = '#8e1b1b', GREEN = '#4f6b3a';

function at(ctx, x, y, s, f) {
	ctx.save();
	ctx.translate(x, y);
	ctx.scale(s / 100, s / 100);
	ctx.lineJoin = ctx.lineCap = 'round';
	ctx.lineWidth = 4;
	ctx.strokeStyle = INK;
	f(ctx);
	ctx.restore();
}
const poly = (c, pts, fill, stroke = true) => {
	c.beginPath();
	pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
	c.closePath();
	if (fill) (c.fillStyle = fill), c.fill();
	if (stroke) c.stroke();
};
const rect = (c, x, y, w, h, fill) => {
	if (fill) (c.fillStyle = fill), c.fillRect(x, y, w, h);
	c.strokeRect(x, y, w, h);
};
const circle = (c, x, y, r, fill, stroke = true) => {
	c.beginPath();
	c.arc(x, y, r, 0, Math.PI * 2);
	if (fill) (c.fillStyle = fill), c.fill();
	if (stroke) c.stroke();
};
const lines = (c, x, y, w, n, gap = 8) => {
	c.lineWidth = 2.5;
	for (let i = 0; i < n; i++) {
		c.beginPath();
		c.moveTo(x, y + i * gap);
		c.lineTo(x + w * (i === n - 1 ? 0.6 : 1), y + i * gap);
		c.stroke();
	}
	c.lineWidth = 4;
};
const card = (c, initials) => {
	c.rotate(-0.12);
	rect(c, 14, 30, 72, 44, PAPER);
	c.fillStyle = INK;
	c.font = 'italic 20px Georgia, serif';
	c.textAlign = 'center';
	c.fillText(initials, 50, 52);
	lines(c, 28, 62, 44, 1);
};
const book = (c, cover, band) => {
	poly(c, [[24, 18], [74, 14], [80, 80], [30, 86]], cover);
	poly(c, [[24, 18], [30, 86], [22, 84], [16, 20]], DARK);
	if (band) {
		c.strokeStyle = BRASS;
		c.beginPath();
		c.moveTo(34, 34);
		c.lineTo(72, 31);
		c.moveTo(36, 66);
		c.lineTo(75, 63);
		c.stroke();
	}
};
const cross = (c, x, y, s, fill) => poly(c, [[x - 4 * s, y - 20 * s], [x + 4 * s, y - 20 * s], [x + 4 * s, y - 8 * s], [x + 13 * s, y - 8 * s], [x + 13 * s, y], [x + 4 * s, y], [x + 4 * s, y + 26 * s], [x - 4 * s, y + 26 * s], [x - 4 * s, y], [x - 13 * s, y], [x - 13 * s, y - 8 * s], [x - 4 * s, y - 8 * s]], fill);
const envelope = (c, fill, seal) => {
	rect(c, 14, 28, 72, 46, fill);
	c.beginPath();
	c.moveTo(14, 28);
	c.lineTo(50, 54);
	c.lineTo(86, 28);
	c.stroke();
	if (seal) circle(c, 50, 54, 7, seal);
};
const key = (c, x, y, s) => {
	circle(c, x, y, 9 * s, BRASS);
	circle(c, x, y, 3.5 * s, '#000', false);
	poly(c, [[x + 8 * s, y - 3 * s], [x + 46 * s, y - 3 * s], [x + 46 * s, y + 3 * s], [x + 8 * s, y + 3 * s]], BRASS);
	rect(c, x + 36 * s, y + 3 * s, 4 * s, 9 * s, BRASS);
	rect(c, x + 42 * s, y + 3 * s, 4 * s, 6 * s, BRASS);
};

export const ITEMS = {
	1: { name: 'Photograph', draw: (c) => { rect(c, 24, 14, 52, 70, BRASS); c.beginPath(); c.ellipse(50, 49, 17, 24, 0, 0, 7); c.fillStyle = '#2c2a33'; c.fill(); c.stroke(); } },
	2: { name: 'Museum guide', draw: (c) => { book(c, '#6b7fa8'); c.fillStyle = PAPER; c.font = 'bold 13px Georgia'; c.fillText('GUIDE', 33, 52); } },
	3: { name: 'Handkerchief', draw: (c) => { poly(c, [[18, 30], [82, 24], [78, 76], [22, 80]], '#e8e4d8'); c.lineWidth = 2; c.strokeRect(28, 34, 44, 36); } },
	4: { name: 'Card: Father Janos', draw: (c) => card(c, 'P. J.') },
	5: { name: 'Prescription', draw: (c) => { rect(c, 22, 14, 56, 72, PAPER); c.fillStyle = INK; c.font = 'italic bold 22px Georgia'; c.fillText('Rx', 30, 38); lines(c, 30, 52, 40, 4); } },
	6: { name: 'White cloth', draw: (c) => { poly(c, [[16, 40], [40, 22], [84, 34], [70, 78], [26, 72]], '#f0eee6'); c.beginPath(); c.moveTo(30, 44); c.quadraticCurveTo(50, 56, 72, 46); c.stroke(); } },
	7: { name: 'Bowie knife', draw: (c) => { c.rotate(-0.7); c.translate(-32, 30); poly(c, [[20, 46], [70, 40], [84, 46], [70, 52]], STEEL); rect(c, 4, 42, 18, 8, DARK); } },
	8: { name: 'Card: J. Harker', draw: (c) => card(c, 'J. H.') },
	9: { name: 'Card: Van Helsing', draw: (c) => card(c, 'A. V. H.') },
	10: { name: 'Book', draw: (c) => book(c, '#5a2a2a', true) },
	11: { name: 'Cross necklace', draw: (c) => { c.lineWidth = 2; c.beginPath(); c.ellipse(50, 36, 26, 20, 0, 0, 7); c.stroke(); for (let a = 0; a < 6.2; a += 0.45) circle(c, 50 + 26 * Math.cos(a), 36 + 20 * Math.sin(a), 3, '#5c4033', false); c.lineWidth = 3; cross(c, 50, 72, 0.7, BRASS); } },
	12: { name: 'Blackjack', draw: (c) => { c.rotate(-0.6); c.translate(-28, 26); poly(c, [[20, 44], [58, 40], [86, 34], [90, 50], [60, 56], [20, 52]], '#1c1612'); rect(c, 10, 42, 12, 8, '#5c4033'); } },
	13: { name: 'Rose', draw: (c) => { c.strokeStyle = GREEN; c.beginPath(); c.moveTo(50, 88); c.quadraticCurveTo(46, 66, 52, 48); c.moveTo(48, 70); c.lineTo(34, 62); c.stroke(); c.strokeStyle = INK; for (const [x, y, r] of [[50, 34, 16], [44, 30, 9], [57, 31, 9], [50, 26, 7]]) circle(c, x, y, r, RED); } },
	14: { name: 'Journal', draw: (c) => book(c, '#16120f') },
	15: { name: 'Note', draw: (c) => { c.strokeStyle = '#8e7a5a'; envelope(c, '#141010'); } },
	16: { name: 'Ring of keys', draw: (c) => { c.lineWidth = 3; circle(c, 32, 30, 12, null); key(c, 30, 46, 0.9); c.rotate(0.35); key(c, 40, 34, 0.8); } },
	17: { name: 'Illuminated manuscript', draw: (c) => { rect(c, 18, 16, 64, 68, '#d8c79c'); rect(c, 28, 26, 44, 48, null); c.beginPath(); c.moveTo(36, 66); c.lineTo(50, 34); c.lineTo(64, 66); c.moveTo(42, 54); c.lineTo(58, 54); c.stroke(); } },
	18: { name: 'Keys', draw: (c) => { c.rotate(-0.5); c.translate(-26, 26); key(c, 26, 48, 1.3); } },
	19: { name: 'Dictaphone tube', draw: (c) => { c.rotate(-0.6); c.translate(-30, 28); rect(c, 22, 38, 56, 24, '#2a1d14'); c.beginPath(); c.ellipse(78, 50, 5, 12, 0, 0, 7); c.fillStyle = '#6b5640'; c.fill(); c.stroke(); } },
	20: { name: 'Gift', draw: (c) => { rect(c, 22, 40, 56, 40, '#5a2a6a'); rect(c, 46, 40, 8, 40, BRASS); rect(c, 18, 32, 64, 12, '#6a3a7a'); rect(c, 46, 32, 8, 12, BRASS); c.beginPath(); c.ellipse(42, 28, 8, 5, -0.4, 0, 7); c.ellipse(58, 28, 8, 5, 0.4, 0, 7); c.stroke(); } },
	21: { name: 'Book of poems', draw: (c) => book(c, '#2a3a5a', true) },
	22: { name: 'Gold coin', draw: (c) => { circle(c, 50, 50, 28, '#d4a83a'); circle(c, 50, 50, 20, null); c.font = 'bold 20px Georgia'; c.fillStyle = INK; c.textAlign = 'center'; c.fillText('£', 50, 58); } },
	23: { name: 'Stake and mallet', draw: (c) => { c.rotate(0.6); c.translate(16, -30); poly(c, [[40, 14], [50, 14], [48, 76], [45, 86], [42, 76]], '#a0784a'); c.rotate(-1.2); c.translate(-46, 36); rect(c, 40, 20, 26, 16, '#5c4033'); rect(c, 50, 36, 6, 40, '#a0784a'); } },
	24: { name: 'Note', draw: (c) => envelope(c, PAPER, RED) },
	25: { name: 'Napkin', draw: (c) => { poly(c, [[18, 26], [82, 26], [82, 76], [18, 76]], '#ece6da'); c.lineWidth = 3; for (const [x, y] of [[34, 40], [60, 46], [44, 62]]) { c.beginPath(); c.moveTo(x - 6, y); c.lineTo(x + 6, y); c.moveTo(x, y - 8); c.lineTo(x, y + 8); c.stroke(); } } },
	26: { name: 'Consecrated cross', draw: (c) => cross(c, 50, 46, 1.4, '#d6dbe0') },
	27: { name: 'Wolfsbane', draw: (c) => { c.strokeStyle = GREEN; c.beginPath(); c.moveTo(30, 86); c.quadraticCurveTo(46, 54, 62, 30); c.moveTo(42, 64); c.lineTo(66, 58); c.stroke(); c.strokeStyle = INK; c.lineWidth = 2.5; for (const [x, y] of [[62, 28], [70, 56], [52, 44]]) circle(c, x, y, 8, '#b9c8f0'); } }
};

export function drawItem(ctx, n, x, y, size) {
	const it = ITEMS[n];
	if (it) at(ctx, x, y, size, it.draw);
}

export function itemName(n) {
	return ITEMS[n]?.name ?? `Item ${n}`;
}

// ---- UI glyphs for the desk ----------------------------------------------------------------------------------
export const GLYPHS = {
	map: (c) => { poly(c, [[12, 24], [36, 16], [64, 24], [88, 16], [88, 76], [64, 84], [36, 76], [12, 84]], PAPER); c.beginPath(); c.moveTo(36, 16); c.lineTo(36, 76); c.moveTo(64, 24); c.lineTo(64, 84); c.stroke(); circle(c, 52, 44, 6, RED); },
	watch: (c) => { circle(c, 50, 54, 32, BRASS); circle(c, 50, 54, 25, PAPER); c.beginPath(); c.moveTo(50, 54); c.lineTo(50, 36); c.moveTo(50, 54); c.lineTo(62, 58); c.stroke(); circle(c, 50, 16, 6, null); },
	journal: (c) => book(c, '#5a3a22', true),
	items: (c) => { rect(c, 14, 34, 72, 46, '#6b4426'); rect(c, 14, 26, 72, 10, '#7d5230'); rect(c, 42, 30, 16, 12, BRASS); },
	home: (c) => { poly(c, [[16, 48], [50, 18], [84, 48]], RED); rect(c, 26, 48, 48, 36, '#7d5230'); rect(c, 44, 62, 12, 22, DARK); },
	telegram: (c) => envelope(c, '#e8d9a8', null),
	sleep: (c) => { rect(c, 14, 54, 72, 18, '#7d5230'); rect(c, 14, 40, 18, 32, '#5a3a22'); rect(c, 34, 46, 30, 10, PAPER); c.font = 'bold 18px Georgia'; c.fillStyle = INK; c.fillText('z z', 58, 34); },
	phonograph: (c) => { rect(c, 26, 60, 48, 22, '#5a3a22'); poly(c, [[50, 58], [56, 40], [86, 14], [92, 30], [60, 46]], BRASS); },
	menu: (c) => { for (let i = 0; i < 3; i++) rect(c, 22, 26 + i * 18, 56, 8, BRASS); },
	clue: (c) => { c.lineWidth = 12; c.strokeStyle = DARK; c.beginPath(); c.moveTo(62, 62); c.lineTo(86, 86); c.stroke(); c.lineWidth = 4; c.strokeStyle = INK; circle(c, 42, 42, 28, BRASS); circle(c, 42, 42, 21, '#d8e2e6'); },
	play: (c) => poly(c, [[34, 22], [80, 50], [34, 78]], PAPER),
	pause: (c) => { rect(c, 30, 24, 14, 52, PAPER); rect(c, 56, 24, 14, 52, PAPER); },
	back: (c) => { poly(c, [[52, 22], [14, 50], [52, 78]], PAPER); poly(c, [[88, 22], [50, 50], [88, 78]], PAPER); },
	forward: (c) => { poly(c, [[12, 22], [50, 50], [12, 78]], PAPER); poly(c, [[48, 22], [86, 50], [48, 78]], PAPER); },
	skip: (c) => { poly(c, [[18, 22], [62, 50], [18, 78]], PAPER); rect(c, 66, 22, 12, 56, PAPER); }
};

export function drawGlyph(ctx, name, x, y, size) {
	if (GLYPHS[name]) at(ctx, x, y, size, GLYPHS[name]);
}
