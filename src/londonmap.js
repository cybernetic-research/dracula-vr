// The map on the desk: this port's own drawing of a Victorian "guide to travel times" card, in the manner of the
// original's carriage screen (a street map of London under a title cartouche, a hansom cab in the corner, a compass,
// a ribbon for the destination) but drawn here from rough coordinates of 1899 London: the main roads, the parks and
// the Thames. Nothing in it comes from the disc. The static card is drawn once into its own canvas; main.js draws
// the pins and the ribbon's text over it.
import { SERIF } from './panel.js';

// the card on the 2048x1080 desk, and the part of London it shows (longitude, latitude)
const CARD = { x: 30, y: 205, w: 1988, h: 770 };
const WEST = -0.235, EAST = -0.025, NORTH = 51.541, SOUTH = 51.48;
export const MAP_PAPER = '#a9c6b8', MAP_INK = '#13241a', MAP_GREEN = '#1f4a33', MAP_LIGHT = '#d8eadf', MAP_ORANGE = '#d9822b';
const ROAD = '#e6dca6', ROAD_EDGE = '#7f9c8a', PARK = '#8db494', WATER = '#5d8ea3', WATER_EDGE = '#3c6b7d';

export const project = (lon, lat) => [CARD.x + ((lon - WEST) / (EAST - WEST)) * CARD.w, CARD.y + ((NORTH - lat) / (NORTH - SOUTH)) * CARD.h];

// where each district's pins go, in the disc's district order (nudged a little where labels would collide)
export const DISTRICT_POS = [
	[-0.196, 51.512], // Notting Hill
	[-0.193, 51.4995], // Kensington
	[-0.124, 51.531], // King's Cross
	[-0.158, 51.5125], // Marble Arch
	[-0.178, 51.519], // Paddington
	[-0.092, 51.5138], // St. Paul's
	[-0.121, 51.5105], // The Strand
	[-0.128, 51.4965] // Westminster
].map(([lon, lat]) => project(lon, lat));

// the ribbon along the bottom: its light panel, where the destination is written
export const RIBBON = { x: 215, y: 890, w: 1618, h: 58 };

// the Thames, west to east (it leaves the card to the south between Hammersmith and Vauxhall)
const THAMES = [
	[-0.24, 51.4895], [-0.225, 51.4865], [-0.21, 51.481], [-0.195, 51.478], [-0.18, 51.4795], [-0.165, 51.483], [-0.15, 51.4845],
	[-0.135, 51.486], [-0.127, 51.4875], [-0.1225, 51.4925], [-0.1215, 51.4975], [-0.1225, 51.5008], [-0.1205, 51.5065],
	[-0.1165, 51.5085], [-0.104, 51.5095], [-0.094, 51.5085], [-0.0875, 51.508], [-0.0755, 51.5055], [-0.065, 51.5045],
	[-0.055, 51.504], [-0.04, 51.507], [-0.028, 51.5065], [-0.02, 51.499]
];
// the bridges of 1899, as [lon, lat, angle of the crossing]
const BRIDGES = [[-0.127, 51.4875, 1.4], [-0.1218, 51.4945, 0], [-0.1222, 51.5008, 0], [-0.1205, 51.5065, 0.3], [-0.1165, 51.5085, 1.2], [-0.104, 51.5095, 1.5], [-0.094, 51.5085, 1.6], [-0.0875, 51.508, 1.7], [-0.0755, 51.5055, 1.75], [-0.15, 51.4845, 1.5]];

const ROADS = [
	// Holland Park Avenue, Bayswater Road, Oxford Street, Holborn, Cheapside, Whitechapel
	[[-0.235, 51.5068], [-0.215, 51.5065], [-0.196, 51.509], [-0.175, 51.5115], [-0.159, 51.5133], [-0.142, 51.515], [-0.13, 51.5163], [-0.125, 51.517], [-0.115, 51.518], [-0.105, 51.5175], [-0.1, 51.516], [-0.093, 51.514], [-0.088, 51.513], [-0.077, 51.514], [-0.06, 51.517], [-0.04, 51.52], [-0.025, 51.522]],
	// Kensington High Street, Knightsbridge, Piccadilly, the Strand, Fleet Street, Cannon Street to the Tower
	[[-0.235, 51.4975], [-0.205, 51.5005], [-0.185, 51.5015], [-0.163, 51.502], [-0.152, 51.503], [-0.14, 51.507], [-0.134, 51.51], [-0.129, 51.5105], [-0.1265, 51.5075], [-0.12, 51.5105], [-0.114, 51.512], [-0.108, 51.514], [-0.102, 51.5138], [-0.098, 51.5138], [-0.09, 51.5115], [-0.083, 51.51], [-0.077, 51.5095]],
	// the New Road: Marylebone Road, Euston Road, Pentonville Road, City Road
	[[-0.178, 51.5205], [-0.17, 51.52], [-0.155, 51.522], [-0.145, 51.5235], [-0.135, 51.526], [-0.124, 51.53], [-0.112, 51.531], [-0.105, 51.532], [-0.095, 51.527], [-0.088, 51.524], [-0.087, 51.52], [-0.088, 51.517]],
	// Edgware Road
	[[-0.159, 51.5133], [-0.168, 51.52], [-0.178, 51.528], [-0.19, 51.537], [-0.198, 51.545]],
	// Praed Street and the Harrow Road
	[[-0.168, 51.5185], [-0.177, 51.5165], [-0.185, 51.521], [-0.205, 51.526], [-0.235, 51.531]],
	// Tottenham Court Road, Hampstead Road
	[[-0.13, 51.5163], [-0.135, 51.522], [-0.137, 51.53], [-0.142, 51.541]],
	// Regent Street and Portland Place
	[[-0.134, 51.51], [-0.1415, 51.515], [-0.145, 51.522]],
	// Whitehall, Parliament Street, Millbank
	[[-0.1265, 51.5075], [-0.126, 51.503], [-0.125, 51.4995], [-0.126, 51.495], [-0.128, 51.489]],
	// Victoria Street, Grosvenor Place, Vauxhall Bridge Road
	[[-0.13, 51.4985], [-0.143, 51.4965]], [[-0.152, 51.503], [-0.144, 51.496], [-0.135, 51.489], [-0.13, 51.4865]],
	// Sloane Street, Brompton Road, the King's Road, Exhibition Road, Earl's Court Road
	[[-0.16, 51.502], [-0.158, 51.492], [-0.155, 51.484]], [[-0.163, 51.501], [-0.172, 51.4965], [-0.18, 51.493], [-0.2, 51.484]],
	[[-0.157, 51.492], [-0.175, 51.486], [-0.19, 51.481]], [[-0.175, 51.5015], [-0.174, 51.494]], [[-0.197, 51.5005], [-0.195, 51.488]],
	// Ladbroke Grove, Gray's Inn Road, Farringdon Road, Chancery Lane, Bishopsgate, Commercial Road
	[[-0.203, 51.5085], [-0.208, 51.52], [-0.213, 51.53], [-0.217, 51.541]], [[-0.113, 51.518], [-0.12, 51.528]],
	[[-0.104, 51.513], [-0.106, 51.52], [-0.111, 51.528]], [[-0.112, 51.5145], [-0.111, 51.519]], [[-0.083, 51.514], [-0.079, 51.522], [-0.077, 51.53], [-0.074, 51.541]],
	[[-0.07, 51.514], [-0.05, 51.513], [-0.035, 51.512], [-0.025, 51.511]],
	// south of the river: Westminster Bridge Road, Waterloo Road, Blackfriars Road, Borough High Street, Kennington Road,
	// Lambeth Road, the Old Kent Road, and Tower Bridge (1894)
	[[-0.118, 51.5008], [-0.11, 51.499], [-0.105, 51.498]], [[-0.1165, 51.5085], [-0.108, 51.5]], [[-0.104, 51.5095], [-0.105, 51.498], [-0.1, 51.4945]],
	[[-0.0875, 51.508], [-0.092, 51.5], [-0.1, 51.4945]], [[-0.105, 51.498], [-0.11, 51.488], [-0.113, 51.48]], [[-0.1218, 51.4945], [-0.105, 51.497]],
	[[-0.1, 51.4945], [-0.093, 51.493], [-0.075, 51.486], [-0.06, 51.48]], [[-0.0755, 51.503], [-0.0755, 51.508], [-0.075, 51.51]],
	[[-0.1, 51.4945], [-0.105, 51.484], [-0.11, 51.48]], [[-0.1, 51.4945], [-0.12, 51.484], [-0.135, 51.48]]
];

const ellipse = (lon, lat, rl, rt, n = 24) => Array.from({ length: n }, (_, k) => [lon + rl * Math.cos((k / n) * 2 * Math.PI), lat + rt * Math.sin((k / n) * 2 * Math.PI)]);
const PARKS = [
	{ name: 'Regent’s Park', at: [-0.1535, 51.5285], shape: ellipse(-0.1535, 51.5285, 0.0125, 0.0068) },
	{ name: 'Hyde Park', at: [-0.165, 51.5085], shape: [[-0.1905, 51.5105], [-0.1595, 51.513], [-0.1525, 51.5032], [-0.1905, 51.5015]] },
	{ name: 'Kensington Gardens', at: [-0.1835, 51.5055], label: false },
	{ name: 'Green Park', shape: [[-0.1515, 51.5038], [-0.1425, 51.5072], [-0.1395, 51.5028], [-0.1455, 51.501]] },
	{ name: 'St. James’s Park', shape: [[-0.1405, 51.503], [-0.129, 51.5045], [-0.129, 51.501], [-0.14, 51.501]] },
	{ name: 'Holland Park', shape: [[-0.208, 51.5045], [-0.199, 51.5045], [-0.199, 51.5005], [-0.208, 51.5005]] },
	{ name: 'Primrose Hill', shape: ellipse(-0.1605, 51.5395, 0.006, 0.003) }
];

// a small repeatable random, so the streets come out the same every time
function rng(seed) {
	return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function path(g, pts, close = false) {
	g.beginPath();
	pts.forEach(([lon, lat], i) => {
		const [x, y] = project(lon, lat);
		i ? g.lineTo(x, y) : g.moveTo(x, y);
	});
	if (close) g.closePath();
}

// a smooth line through the points (the river)
function smooth(g, pts) {
	const p = pts.map(([lon, lat]) => project(lon, lat));
	g.beginPath();
	g.moveTo(p[0][0], p[0][1]);
	for (let i = 1; i < p.length - 1; i++) g.quadraticCurveTo(p[i][0], p[i][1], (p[i][0] + p[i + 1][0]) / 2, (p[i][1] + p[i + 1][1]) / 2);
	g.lineTo(p[p.length - 1][0], p[p.length - 1][1]);
}

function inside([x, y], poly) {
	let c = false;
	for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
		const [xi, yi] = poly[i], [xj, yj] = poly[j];
		if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
	}
	return c;
}

function distToLine([x, y], pts) {
	let best = Infinity;
	for (let i = 0; i < pts.length - 1; i++) {
		const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
		const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2)));
		best = Math.min(best, Math.hypot(x - ax - t * (bx - ax), y - ay - t * (by - ay)));
	}
	return best;
}

function drawCard(g) {
	const { x, y, w, h } = CARD;
	const rand = rng(1899);
	g.save();
	g.beginPath();
	g.rect(x, y, w, h);
	g.clip();
	g.fillStyle = MAP_PAPER;
	g.fillRect(x, y, w, h);
	// the stipple of the printed card
	for (let i = 0; i < 26000; i++) {
		g.fillStyle = rand() < 0.5 ? 'rgba(19,36,26,0.10)' : 'rgba(255,255,240,0.16)';
		g.fillRect(x + rand() * w, y + rand() * h, 2, 2);
	}
	// parks, with a scatter of trees
	const parks = PARKS.filter((p) => p.shape).map((p) => ({ ...p, px: p.shape.map(([lon, lat]) => project(lon, lat)) }));
	for (const p of parks) {
		path(g, p.shape, true);
		g.fillStyle = PARK;
		g.fill();
		g.strokeStyle = ROAD_EDGE;
		g.lineWidth = 2;
		g.stroke();
		const xs = p.px.map((q) => q[0]), ys = p.px.map((q) => q[1]);
		for (let i = 0; i < 400; i++) {
			const q = [Math.min(...xs) + rand() * (Math.max(...xs) - Math.min(...xs)), Math.min(...ys) + rand() * (Math.max(...ys) - Math.min(...ys))];
			if (!inside(q, p.px)) continue;
			g.fillStyle = 'rgba(31,74,51,0.45)';
			g.beginPath();
			g.arc(q[0], q[1], 2.2, 0, Math.PI * 2);
			g.fill();
		}
	}
	// the Serpentine and the lake in St. James's Park
	g.strokeStyle = WATER;
	g.lineCap = 'round';
	g.lineWidth = 9;
	path(g, [[-0.176, 51.5085], [-0.168, 51.5052], [-0.16, 51.5045]]);
	g.stroke();
	g.lineWidth = 7;
	path(g, [[-0.1385, 51.5022], [-0.1315, 51.5028]]);
	g.stroke();
	// the side streets: short strokes on a slowly turning grid, wherever there is neither park nor river
	const river = THAMES.map(([lon, lat]) => project(lon, lat));
	g.strokeStyle = 'rgba(226,220,166,0.75)';
	g.lineWidth = 2;
	for (let cy = y; cy < y + h; cy += 26) {
		for (let cx = x; cx < x + w; cx += 26) {
			const q = [cx + rand() * 26, cy + rand() * 26];
			if (parks.some((p) => inside(q, p.px)) || distToLine(q, river) < 30) continue;
			const a = 0.45 * Math.sin(q[0] / 260) + 0.35 * Math.cos(q[1] / 210) + (rand() < 0.5 ? 0 : Math.PI / 2);
			const l = 10 + rand() * 18;
			g.beginPath();
			g.moveTo(q[0] - Math.cos(a) * l, q[1] - Math.sin(a) * l);
			g.lineTo(q[0] + Math.cos(a) * l, q[1] + Math.sin(a) * l);
			g.stroke();
		}
	}
	// the Thames, its bridges and its name
	g.lineJoin = 'round';
	smooth(g, THAMES);
	g.strokeStyle = WATER_EDGE;
	g.lineWidth = 38;
	g.stroke();
	g.strokeStyle = WATER;
	g.lineWidth = 32;
	g.stroke();
	g.strokeStyle = ROAD;
	g.lineWidth = 5;
	for (const [lon, lat, a] of BRIDGES) {
		const [bx, by] = project(lon, lat);
		g.beginPath();
		g.moveTo(bx - Math.cos(a) * 24, by - Math.sin(a) * 24);
		g.lineTo(bx + Math.cos(a) * 24, by + Math.sin(a) * 24);
		g.stroke();
	}
	// the main roads
	for (const [width, colour] of [[10, ROAD_EDGE], [7, ROAD]]) {
		g.strokeStyle = colour;
		g.lineWidth = width;
		for (const r of ROADS) {
			path(g, r);
			g.stroke();
		}
	}
	// names of the river and the parks
	g.fillStyle = 'rgba(19,36,26,0.55)';
	g.textAlign = 'center';
	g.font = `italic 26px ${SERIF}`;
	for (const p of PARKS) if (p.at && p.label !== false) g.fillText(p.name, ...project(...p.at));
	g.save();
	g.translate(...project(-0.083, 51.5032));
	g.rotate(-0.06);
	g.fillStyle = 'rgba(19,46,60,0.7)';
	g.font = `italic 30px ${SERIF}`;
	g.fillText('River Thames', 0, 0);
	g.restore();
	// LONDON across the middle, faint, as on a printed guide
	g.save();
	g.translate(980, 640);
	g.rotate(-0.3);
	g.font = `bold 290px ${SERIF}`;
	if ('letterSpacing' in g) g.letterSpacing = '24px';
	g.textAlign = 'center';
	g.fillStyle = 'rgba(19,52,38,0.13)';
	g.fillText('LONDON', 0, 0);
	g.restore();
	g.restore();

	cartouche(g, 60, 228, 500, 124);
	cab(g, 1570, 236);
	compass(g, 1720, 790);
	// the border: a dark rule and an orange one inside it
	g.strokeStyle = MAP_INK;
	g.lineWidth = 8;
	g.strokeRect(x + 4, y + 4, w - 8, h - 8);
	g.strokeStyle = MAP_ORANGE;
	g.lineWidth = 3;
	g.strokeRect(x + 14, y + 14, w - 28, h - 28);
	ribbon(g);
}

// the title, on a scroll
function cartouche(g, x, y, w, h) {
	g.save();
	g.fillStyle = MAP_LIGHT;
	g.strokeStyle = MAP_INK;
	g.fillRect(x + 14, y, w - 28, h);
	g.lineWidth = 4;
	g.strokeRect(x + 14, y, w - 28, h);
	g.lineWidth = 1.5;
	g.strokeRect(x + 24, y + 8, w - 48, h - 16);
	for (const ex of [x + 14, x + w - 14]) {
		g.beginPath();
		g.ellipse(ex, y + h / 2, 14, h / 2 + 8, 0, 0, Math.PI * 2);
		g.fillStyle = MAP_LIGHT;
		g.fill();
		g.lineWidth = 4;
		g.stroke();
		g.lineWidth = 1.5;
		for (let k = -2; k <= 2; k++) {
			g.beginPath();
			g.moveTo(ex + k * 4, y - 2);
			g.lineTo(ex + k * 4, y + h + 2);
			g.stroke();
		}
	}
	g.textAlign = 'center';
	g.fillStyle = MAP_INK;
	g.font = `italic 30px ${SERIF}`;
	g.fillText('A Guide to the', x + w / 2, y + 38);
	g.fillStyle = '#c8661a';
	g.font = `italic bold 50px ${SERIF}`;
	if ('letterSpacing' in g) g.letterSpacing = '3px';
	g.fillText('TRAVEL TIMES', x + w / 2, y + 86);
	if ('letterSpacing' in g) g.letterSpacing = '0px';
	g.fillStyle = MAP_INK;
	g.font = `italic 26px ${SERIF}`;
	g.fillText('by Hansom Cab', x + w / 2, y + 114);
	g.restore();
}

// a hansom cab and its horse, facing west, as a woodcut silhouette (local box about 440 x 290)
function cab(g, ox, oy) {
	g.save();
	// a little clear paper behind it
	const halo = g.createRadialGradient(ox + 230, oy + 150, 60, ox + 230, oy + 150, 260);
	halo.addColorStop(0, 'rgba(216,234,223,0.85)');
	halo.addColorStop(1, 'rgba(216,234,223,0)');
	g.fillStyle = halo;
	g.fillRect(ox - 40, oy - 30, 520, 340);
	g.translate(ox, oy + 16);
	g.fillStyle = g.strokeStyle = MAP_INK;
	g.lineCap = g.lineJoin = 'round';
	// horse: body, neck, head, ear, tail
	g.beginPath();
	g.ellipse(150, 155, 72, 30, -0.04, 0, Math.PI * 2);
	g.fill();
	g.beginPath();
	g.moveTo(92, 142);
	g.lineTo(64, 86);
	g.quadraticCurveTo(72, 68, 88, 76);
	g.lineTo(130, 130);
	g.closePath();
	g.fill();
	g.beginPath();
	g.moveTo(68, 80);
	g.lineTo(40, 100);
	g.quadraticCurveTo(26, 112, 34, 121);
	g.lineTo(46, 123);
	g.lineTo(80, 96);
	g.closePath();
	g.fill();
	g.beginPath();
	g.moveTo(72, 78);
	g.lineTo(68, 62);
	g.lineTo(80, 74);
	g.closePath();
	g.fill();
	g.lineWidth = 8;
	g.beginPath();
	g.moveTo(218, 140);
	g.quadraticCurveTo(246, 160, 236, 214);
	g.stroke();
	// legs, trotting: one fore and one hind leg lifted
	g.lineWidth = 9;
	for (const leg of [[[98, 170], [92, 214], [94, 268]], [[114, 172], [86, 206], [100, 226]], [[190, 168], [206, 212], [196, 268]], [[206, 166], [230, 208], [236, 252]]]) {
		g.beginPath();
		leg.forEach(([lx, ly], i) => (i ? g.lineTo(lx, ly) : g.moveTo(lx, ly)));
		g.stroke();
	}
	// shafts and reins
	g.lineWidth = 5;
	g.beginPath();
	g.moveTo(246, 172);
	g.lineTo(104, 146);
	g.stroke();
	g.lineWidth = 1.6;
	g.beginPath();
	g.moveTo(380, 40);
	g.lineTo(60, 96);
	g.stroke();
	// the cab: body, roof, lamp, step, window and door
	g.beginPath();
	g.moveTo(240, 205);
	g.lineTo(238, 128);
	g.quadraticCurveTo(240, 96, 272, 86);
	g.lineTo(352, 82);
	g.quadraticCurveTo(366, 82, 366, 96);
	g.lineTo(366, 205);
	g.closePath();
	g.fill();
	g.lineWidth = 7;
	g.beginPath();
	g.moveTo(228, 88);
	g.lineTo(374, 76);
	g.stroke();
	g.fillRect(224, 104, 12, 18);
	g.lineWidth = 5;
	g.beginPath();
	g.moveTo(222, 212);
	g.lineTo(262, 212);
	g.stroke();
	g.fillStyle = MAP_LIGHT;
	g.fillRect(302, 100, 44, 42);
	g.strokeStyle = MAP_LIGHT;
	g.lineWidth = 3;
	g.beginPath();
	g.moveTo(246, 126);
	g.quadraticCurveTo(264, 156, 258, 204);
	g.stroke();
	// the wheel
	g.strokeStyle = g.fillStyle = MAP_INK;
	g.lineWidth = 7;
	g.beginPath();
	g.arc(318, 200, 70, 0, Math.PI * 2);
	g.stroke();
	g.lineWidth = 2;
	g.beginPath();
	g.arc(318, 200, 60, 0, Math.PI * 2);
	g.stroke();
	g.lineWidth = 3;
	for (let k = 0; k < 14; k++) {
		const a = (k / 14) * Math.PI * 2;
		g.beginPath();
		g.moveTo(318, 200);
		g.lineTo(318 + Math.cos(a) * 66, 200 + Math.sin(a) * 66);
		g.stroke();
	}
	g.beginPath();
	g.arc(318, 200, 10, 0, Math.PI * 2);
	g.fill();
	// the driver on his perch behind the roof, with top hat and whip
	g.fillRect(366, 64, 32, 8);
	g.lineWidth = 4;
	g.beginPath();
	g.moveTo(374, 72);
	g.lineTo(368, 96);
	g.stroke();
	g.beginPath();
	g.moveTo(372, 66);
	g.lineTo(377, 30);
	g.quadraticCurveTo(387, 20, 397, 30);
	g.lineTo(401, 66);
	g.closePath();
	g.fill();
	g.beginPath();
	g.arc(387, 18, 9, 0, Math.PI * 2);
	g.fill();
	g.fillRect(377, 8, 20, 3);
	g.fillRect(380, -10, 14, 18);
	g.lineWidth = 2;
	g.beginPath();
	g.moveTo(380, 34);
	g.quadraticCurveTo(300, -36, 196, 6);
	g.stroke();
	// the road under them
	g.lineWidth = 2;
	g.beginPath();
	g.moveTo(10, 272);
	g.lineTo(430, 272);
	g.stroke();
	for (let k = 20; k < 430; k += 22) {
		g.beginPath();
		g.moveTo(k, 278);
		g.lineTo(k + 10, 278);
		g.stroke();
	}
	g.restore();
}

function compass(g, cx, cy) {
	g.save();
	g.fillStyle = MAP_LIGHT;
	g.strokeStyle = MAP_INK;
	g.fillRect(cx - 66, cy - 76, 132, 148);
	g.lineWidth = 4;
	g.strokeRect(cx - 66, cy - 76, 132, 148);
	g.lineWidth = 1.5;
	g.strokeRect(cx - 58, cy - 68, 116, 132);
	g.beginPath();
	g.arc(cx, cy + 10, 40, 0, Math.PI * 2);
	g.stroke();
	for (let k = 0; k < 8; k++) {
		const a = (k / 8) * Math.PI * 2 - Math.PI / 2, len = k % 2 ? 28 : 46, wd = k % 2 ? 6 : 9;
		const tip = [cx + Math.cos(a) * len, cy + 10 + Math.sin(a) * len];
		const l = [cx + Math.cos(a - Math.PI / 2) * wd, cy + 10 + Math.sin(a - Math.PI / 2) * wd];
		const r = [cx + Math.cos(a + Math.PI / 2) * wd, cy + 10 + Math.sin(a + Math.PI / 2) * wd];
		for (const [side, fill] of [[l, MAP_INK], [r, MAP_LIGHT]]) {
			g.beginPath();
			g.moveTo(cx, cy + 10);
			g.lineTo(...side);
			g.lineTo(...tip);
			g.closePath();
			g.fillStyle = fill;
			g.fill();
			g.lineWidth = 1.5;
			g.stroke();
		}
	}
	g.fillStyle = MAP_INK;
	g.font = `bold 26px ${SERIF}`;
	g.textAlign = 'center';
	g.fillText('N', cx, cy - 44);
	g.restore();
}

// the orange ribbon along the bottom, with its light panel (main.js writes the destination in it)
function ribbon(g) {
	const { x, y, w, h } = RIBBON;
	g.save();
	g.lineJoin = 'round';
	g.strokeStyle = MAP_INK;
	g.lineWidth = 3;
	for (const [ex, dir] of [[x - 45, -1], [x + w + 45, 1]]) {
		// the folded tail behind the band
		g.beginPath();
		g.moveTo(ex, y - 2);
		g.lineTo(ex + dir * 120, y - 2);
		g.lineTo(ex + dir * 80, y + h / 2 + 12);
		g.lineTo(ex + dir * 120, y + h + 26);
		g.lineTo(ex, y + h + 26);
		g.closePath();
		g.fillStyle = '#b8661f';
		g.fill();
		g.stroke();
	}
	g.fillStyle = MAP_ORANGE;
	g.fillRect(x - 45, y - 14, w + 90, h + 28);
	g.strokeRect(x - 45, y - 14, w + 90, h + 28);
	// the rolled edges
	for (const ex of [x - 45, x + w + 25]) {
		g.fillStyle = '#b8661f';
		g.fillRect(ex, y - 14, 20, h + 28);
		g.strokeRect(ex, y - 14, 20, h + 28);
		g.lineWidth = 1.2;
		for (let k = 4; k < 20; k += 5) {
			g.beginPath();
			g.moveTo(ex + k, y - 14);
			g.lineTo(ex + k, y + h + 14);
			g.stroke();
		}
		g.lineWidth = 3;
	}
	g.fillStyle = MAP_LIGHT;
	g.fillRect(x, y, w, h);
	g.strokeRect(x, y, w, h);
	g.restore();
}

// the card is drawn once (again when the period font has arrived) and copied onto the desk on every redraw
let cache = null, cachedWithFont = false;
export function drawLondon(g) {
	const fontReady = document.fonts ? document.fonts.check(`30px 'IM Fell English'`) : true;
	if (!cache || (fontReady && !cachedWithFont)) {
		cache = document.createElement('canvas');
		cache.width = g.canvas.width;
		cache.height = g.canvas.height;
		drawCard(cache.getContext('2d'));
		cachedWithFont = fontReady;
	}
	g.drawImage(cache, 0, 0);
}
