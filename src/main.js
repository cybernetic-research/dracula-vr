// Dracula Unleashed VR: the 1993 FMV game in a Victorian study. The scenes, texts and rules come from your own
// disc (prepared once with tools/prepare.sh into a media folder that is served at /media/); the room, the desk,
// the menus and the icons are this port's own.
import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { Game, clockText } from './engine.js';
import { nextStep, clueText } from './hints.js';
import { Panel, drawButton, wrap, roundRect, INK, PAPER, BRASS, BLOOD, SERIF, DARKINK } from './panel.js';
import { drawItem, itemName, drawGlyph } from './icons.js';
import { buildStudy, makeThunder } from './study.js';
import { Input } from './input.js';
import { DepthScreen } from './depthscreen.js';
import { drawLondon, DISTRICT_POS, RIBBON, MAP_INK, MAP_GREEN } from './londonmap.js';
import { Sounds, Music } from './sounds.js';

const MEDIA = new URLSearchParams(location.search).get('media') || 'media/';
// the original's sound bank: which clip goes with what (traced in DRACULA.EXE and checked by ear; see NOTES.md)
const sounds = new Sounds(MEDIA);
const music = new Music(MEDIA);
const rand = (n) => Math.floor(Math.random() * n);
const SND = {
	mapIntro: 5,
	travelTime: (from, to) => 6 + from * 8 + to, // "It will take me 15 minutes to go from Notting Hill to Kensington"
	item: (n) => 81 + n, // Alexander describing item n
	journal: (n) => 111 + n, // the journal page read aloud (RESOURCE item 220, field +0xe)
	address: (n) => 226 + n, // the address book entry read aloud (field +0x10)
	time: (min) => 239 + Math.floor((min % 1440) / 5), // the pocket watch speaking a time (0x128f8)
	// the carriage (0x1a9df-0x1acd8; bases in RESOURCE: 527 563 576 579 607 627 630 632); drv = one of 4 drivers
	greet: (drv, hour) => 527 + drv * 9 + (hour >= 18 && hour <= 23 ? 6 + rand(3) : rand(6)),
	setOff: (drv, dest) => [563 + dest, 632 + drv * 5 + rand(5)],
	arrive: (drv, dest) => [563 + dest, 576 + rand(3), 579 + drv * 7 + rand(7)],
	won: 652,
	died: 653,
	// Van Helsing's guide (the help screen, 0x172b0 / 0x1784d): an introduction, then one line per control
	guide: { intro: 70, newGame: 71, map: 72, items: 73, journal: 74, watch: 78, home: 79, telegrams: 80, menu: 75 }
};
let driver = 0; // chosen when you open the map, as the original does when the carriage screen opens (random of 4)
let guideOn = true;
try {
	guideOn = localStorage.getItem('dracula.guide') !== '0';
} catch {}
const guided = new Set(); // tabs whose guide line has been heard this session
// clues for when you are stuck (this port's own addition, off unless you switch them on in the menu)
let cluesOn = false;
try {
	cluesOn = localStorage.getItem('dracula.clues') === '1';
} catch {}
// the original's audio options: voices (carriage, watch, journal, map, items) and music
let voicesOn = true;
try {
	voicesOn = localStorage.getItem('dracula.voices') !== '0';
	music.enabled = localStorage.getItem('dracula.music') !== '0';
} catch {}
sounds.volume = voicesOn ? 0.9 : 0;

// ---- renderer, camera, room ---------------------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local'); // seated: the origin is the head when the session starts
document.getElementById('app').appendChild(renderer.domElement);
document.getElementById('vr-slot').appendChild(VRButton.createButton(renderer));

const scene = new THREE.Scene();
const rig = new THREE.Group();
scene.add(rig);
const camera = new THREE.PerspectiveCamera(80, innerWidth / innerHeight, 0.02, 40);
camera.rotation.x = -0.24; // desktop: look a little down, at both the screen and the desk (VR uses the head)
rig.add(camera);
addEventListener('resize', () => {
	camera.aspect = innerWidth / innerHeight;
	camera.updateProjectionMatrix();
	renderer.setSize(innerWidth, innerHeight);
});

const study = buildStudy(scene);
study.sound.thunder = makeThunder();
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.9;

// the average colour of the picture on the screen, a few times a second: it lights the room
const sampler = document.createElement('canvas');
sampler.width = sampler.height = 4;
const sctx = sampler.getContext('2d', { willReadFrequently: true });
const screenColor = new THREE.Color();
let lastSample = 0;
function sampleScreen(now) {
	if (now - lastSample < 150) return;
	lastSample = now;
	const src = playing && video.readyState >= 2 ? video : card.mesh.visible ? card.canvas : null;
	if (!src) return;
	try {
		sctx.drawImage(src, 0, 0, 4, 4);
		const d = sctx.getImageData(0, 0, 4, 4).data;
		let r = 0, g = 0, b = 0;
		for (let i = 0; i < 64; i += 4) (r += d[i]), (g += d[i + 1]), (b += d[i + 2]);
		screenColor.setRGB(r / 4080, g / 4080, b / 4080, THREE.SRGBColorSpace);
	} catch {}
}
const input = new Input(renderer, scene, camera);

// ---- the screen ---------------------------------------------------------------------------------------------
// Shows the title card, the street view of where you are, or a scene. Scenes are 16:10; street views are letterboxed.
const screenMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, fog: false });
const screen = new THREE.Mesh(new THREE.PlaneGeometry(study.screenW, study.screenH), screenMat);
screen.position.copy(study.screenPos).add(new THREE.Vector3(0, 0, 0.01));
scene.add(screen);

const card = new Panel({ w: 1600, h: 1000, width: study.screenW, draw: drawCard });
card.mesh.position.copy(screen.position).add(new THREE.Vector3(0, 0, 0.002));
scene.add(card.mesh);
let cardContent = { kind: 'title' };

const video = document.createElement('video');
video.playsInline = true;
video.crossOrigin = 'anonymous';
video.preload = 'auto';
const videoTex = new THREE.VideoTexture(video);
videoTex.colorSpace = THREE.SRGBColorSpace;

const pictures = [];
const loader = new THREE.TextureLoader();
function picture(loc) {
	if (!pictures[loc]) {
		pictures[loc] = loader.load(`${MEDIA}img/loc${loc}.jpg`, () => card.redraw(), undefined, () => (pictures[loc].failed = true));
		pictures[loc].colorSpace = THREE.SRGBColorSpace;
	}
	return pictures[loc];
}

// the card: what sits on the screen when no scene plays
function drawCard(g, p) {
	const W = 1600, H = 1000;
	const c = cardContent;
	if (c.kind === 'picture') {
		const tex = picture(c.loc);
		g.fillStyle = '#000';
		g.fillRect(0, 0, W, H);
		if (tex.image?.width) {
			const s = Math.min(W / tex.image.width, (H - 120) / tex.image.height);
			const w = tex.image.width * s, h = tex.image.height * s;
			g.drawImage(tex.image, (W - w) / 2, 10, w, h);
		}
		caption(g, data.locations[c.loc].name, data.locations[c.loc].address + ' · ' + data.districts[data.locations[c.loc].district], c.note);
		return;
	}
	g.fillStyle = '#0d0907';
	g.fillRect(0, 0, W, H);
	g.strokeStyle = BRASS;
	g.lineWidth = 6;
	g.strokeRect(40, 40, W - 80, H - 80);
	g.textAlign = 'center';
	g.fillStyle = '#e9d6a6';
	if (c.kind === 'title') {
		g.font = `120px ${SERIF}`;
		g.fillText('Dracula Unleashed', W / 2, 420);
		g.font = `44px ${SERIF}`;
		g.fillStyle = '#b89c66';
		g.fillText('London, December 1899', W / 2, 500);
		g.font = `34px ${SERIF}`;
		g.fillText(c.sub || 'Choose “New game” on the desk to begin.', W / 2, 640);
	} else if (c.kind === 'message') {
		g.font = `64px ${SERIF}`;
		wrap(g, c.title, W - 240).forEach((l, i) => g.fillText(l, W / 2, 380 + i * 80));
		g.font = `38px ${SERIF}`;
		g.fillStyle = '#b89c66';
		wrap(g, c.text || '', W - 300).forEach((l, i) => g.fillText(l, W / 2, 560 + i * 52));
	}
}

function caption(g, title, sub, note) {
	g.fillStyle = 'rgba(10,7,5,0.92)';
	g.fillRect(0, 880, 1600, 120);
	g.textAlign = 'left';
	g.fillStyle = '#efdcae';
	g.font = `48px ${SERIF}`;
	g.fillText(title, 40, 936);
	g.font = `30px ${SERIF}`;
	g.fillStyle = '#b89c66';
	g.fillText(sub, 40, 980);
	g.textAlign = 'right';
	g.fillStyle = '#efdcae';
	g.font = `34px ${SERIF}`;
	g.fillText(game ? clockText(game.state.clock) : '', 1560, 936);
	if (note) {
		g.fillStyle = '#d9b36a';
		g.font = `italic 30px ${SERIF}`;
		g.fillText(note, 1560, 980);
	}
}

function showCard(content) {
	cardContent = content;
	card.mesh.visible = true;
	screenMat.map = null;
	screenMat.color.set(0x000000);
	screenMat.needsUpdate = true;
	card.redraw();
}

// ---- scene playback -----------------------------------------------------------------------------------------
let playing = null; // {name, resolve}
// 3D scenes (a toggle in the menu and under the scene controls): the packed video made by tools/depth3d.py, on the depth screen; flat otherwise,
// or when a scene has no 3D version yet
// 3D is the default; players who would rather not switch it off in the menu (remembered per browser)
let want3d = true;
try {
	want3d = localStorage.getItem('dracula.scenes') !== 'flat';
} catch {}
let depthScreen = null;
function playVideo(name) {
	return new Promise((resolve) => {
		playing = { name, resolve, paused: false };
		sounds.stop();
		card.mesh.visible = false;
		screenMat.map = videoTex;
		screenMat.color.set(0xffffff);
		screenMat.needsUpdate = true;
		const three = want3d;
		video.src = `${MEDIA}video/${name}${three ? '.3d' : ''}.mp4`;
		video.onended = () => finishVideo();
		// keep each video's own shape (scenes are 16:10, the opening and ending are squarer)
		video.onloadedmetadata = () => {
			const shape = depthScreen?.mesh.visible ? video.videoWidth / (video.videoHeight / 2) : video.videoWidth / video.videoHeight;
			const sx = Math.min(1, shape / (study.screenW / study.screenH));
			screen.scale.set(sx, 1, 1);
			if (depthScreen) depthScreen.mesh.scale.set(sx, 1, 1);
		};
		video.onerror = () => {
			if (playing && video.src.includes('.3d.')) {
				// no 3D version (yet): play the flat one
				const t = video.currentTime;
				video.src = `${MEDIA}video/${name}.mp4`;
				show3d(false);
				if (t) video.addEventListener('loadeddata', () => (video.currentTime = t), { once: true });
				video.play().catch(() => {});
				return;
			}
			toast(`The scene “${name}” is missing from the media folder (see README: prepare the videos).`);
			finishVideo();
		};
		show3d(three);
		video.play().catch(() => {
			// the browser wants a click before sound: the play button on the desk starts it
			if (playing) (playing.blocked = true), desk.redraw();
		});
		video.onplay = () => playing && ((playing.blocked = false), desk.redraw());
		desk.redraw();
	});
}
function show3d(on) {
	if (on && !depthScreen) {
		depthScreen = new DepthScreen(video, screen.position.clone().add(new THREE.Vector3(0, 0, -0.03)), study.screenW, study.screenH);
		scene.add(depthScreen.mesh);
	}
	if (depthScreen) depthScreen.mesh.visible = on;
	screen.visible = !on;
}
function finishVideo() {
	if (!playing) return;
	show3d(false);
	const r = playing.resolve;
	playing = null;
	video.pause();
	screen.scale.set(1, 1, 1);
	video.removeAttribute('src');
	video.load();
	r();
}

// ---- game state & flow ---------------------------------------------------------------------------------------
let data = null, game = null;
let mode = 'title'; // title | play | busy | over
let tab = 'menu';
const toasts = [];
function toast(text) {
	toasts.push({ text, until: performance.now() + 9000 });
	if (toasts.length > 4) toasts.shift();
	desk.redraw();
}

async function runSteps(steps) {
	mode = 'busy';
	desk.redraw();
	for (const s of steps.filter(Boolean)) {
		if (s.video) await playVideo(s.video);
		for (const n of s.addresses || []) toast(`Address learned: ${data.locations[n].name}, ${data.locations[n].address}`);
		for (const n of s.gained || []) toast(`Received: ${itemName(n)}`);
		for (const n of s.lost || []) toast(`Given up: ${itemName(n)}`);
		if (s.journal?.length) toast('Your journal has a new entry.');
		if (s.slept) toast(`You slept for ${s.slept} hours.`);
	}
	if (game.state.over) return gameOver();
	mode = 'play';
	music.start();
	const fired = steps.some((s) => s && s.fired);
	showCard({ kind: 'picture', loc: game.state.location, note: fired ? '' : steps.length ? 'Nothing happens here at the moment.' : '' });
	autosave();
	desk.redraw();
}

async function gameOver() {
	mode = 'over';
	const won = game.state.over === 'win';
	if (won) {
		const e = game.epilogue();
		if (e.video) await playVideo(e.video);
		await playVideo(data.ending);
	}
	tab = 'menu';
	sounds.play(won ? SND.won : SND.died);
	// the original's own words (TEXTS.DTA)
	showCard({ kind: 'message', title: won ? 'You have Won!' : 'You have died!', text: 'What would you like to do?' });
	desk.redraw();
}

async function newGame() {
	if (!data) return;
	game = new Game(data);
	mode = 'busy';
	tab = 'map';
	guided.clear();
	await playVideo(data.opening);
	if (guideOn) await Promise.race([sounds.playList([SND.guide.intro, SND.guide.newGame]), new Promise((r) => setTimeout(r, 60000))]);
	await runSteps([game.arrive()]);
}

function autosave() {
	try {
		localStorage.setItem('dracula.auto', game.save());
	} catch {}
}
function slotKey(i) {
	return `dracula.slot${i}`;
}
function slotInfo(i) {
	try {
		const s = JSON.parse(localStorage.getItem(slotKey(i)));
		return s && `${data.locations[s.location].name} · ${clockText(s.clock)}`;
	} catch {
		return null;
	}
}
function load(json) {
	game = new Game(data);
	game.load(json);
	tab = 'map';
	if (game.state.over) return gameOver();
	mode = 'play';
	showCard({ kind: 'picture', loc: game.state.location });
	desk.redraw();
}

// ---- the desk ------------------------------------------------------------------------------------------------
// One large panel lying on the desk, tilted towards you, with tabs along its top edge.
const DW = 2048, DH = 1080;
const desk = new Panel({ w: DW, h: DH, width: 1.04, draw: drawDesk });
// lying on the desk, tilted up a little (you look down to it, up to the story), its near edge resting on the desk
// top so none of it sinks into the wood
desk.mesh.rotation.x = -1.12;
desk.mesh.position.set(0, study.deskTop + 0.01 + ((1.04 * DH) / DW / 2) * Math.cos(1.12), -0.6);
scene.add(desk.mesh);
let selDest = null, waitMin = 15, journalPage = 0, skipTrip = null;

const TABS = [
	['map', 'Map', 'map'],
	['watch', 'Watch', 'watch'],
	['journal', 'Journal', 'journal'],
	['items', 'Items', 'items'],
	['home', 'At home', 'home'],
	['clue', 'Clue', 'clue'],
	['menu', 'Menu', 'menu']
];

function drawDesk(g, p) {
	// paper background
	g.fillStyle = PAPER;
	roundRect(g, 0, 0, DW, DH, 30);
	g.fill();
	g.lineWidth = 10;
	g.strokeStyle = '#3a2a1c';
	g.stroke();

	if (playing) return drawTransport(g, p);
	const ready = !!game && mode === 'play';
	// tabs (the clue tab only when clues are on)
	const tabs = TABS.filter(([id]) => id !== 'clue' || cluesOn);
	const step = (DW - 60) / tabs.length;
	tabs.forEach(([id, label, glyph], i) => {
		const x = 30 + i * step, y = 24, w = step - 15, h = 104;
		const enabled = id === 'menu' || (ready && (id !== 'home' || game.state.location === 0));
		const hot = p.button('tab_' + id, x, y, w, h, () => openTab(id), enabled);
		roundRect(g, x, y, w, h, 14);
		g.fillStyle = tab === id ? '#5a1414' : hot ? '#4a3322' : enabled ? '#2c1f16' : 'rgba(60,45,35,0.4)';
		g.fill();
		drawGlyph(g, glyph, x + 14, y + 12, 80);
		g.fillStyle = tab === id ? '#f6e6bf' : INK;
		g.font = `40px ${SERIF}`;
		g.textAlign = 'left';
		g.textBaseline = 'middle';
		g.fillText(label, x + 104, y + h / 2 + 2);
	});
	// status line
	g.textBaseline = 'alphabetic';
	if (game) {
		g.fillStyle = INK;
		g.font = `36px ${SERIF}`;
		g.textAlign = 'left';
		const s = game.state;
		g.fillText(`${clockText(s.clock)}  ·  ${data.locations[s.location].name}  ·  Carrying: ${s.carried ? itemName(s.carried) : 'nothing'}`, 40, 178);
	}
	g.save();
	g.beginPath();
	g.rect(20, 200, DW - 40, DH - 300);
	g.clip();
	({ map: drawMap, watch: drawWatch, journal: drawJournal, items: drawItems, home: drawHome, clue: drawClue, menu: drawMenu })[ready || tab === 'menu' ? tab : 'menu'](g, p);
	g.restore();
	// messages
	const now = performance.now();
	const live = toasts.filter((t) => t.until > now);
	g.fillStyle = 'rgba(8,5,4,0.9)';
	g.fillRect(20, DH - 92, DW - 40, 72);
	g.fillStyle = '#f6e6bf';
	g.font = `32px ${SERIF}`;
	g.textAlign = 'left';
	g.fillText(live.length ? live[live.length - 1].text : mode === 'busy' ? '…' : '', 44, DH - 46);
	if (skipTrip) drawButton(g, p, 'skiptrip', DW - 300, DH - 88, 260, 64, 'Skip ›', () => (sounds.stop(), skipTrip?.()), { size: 30 });
}

function openTab(id) {
	tab = id;
	selDest = null;
	sounds.stop();
	if (guideOn && SND.guide[id] && !guided.has(id)) {
		guided.add(id);
		sounds.play(SND.guide[id]);
		desk.redraw();
		return;
	}
	if (id === 'map' && game) {
		driver = rand(4);
		const h = Math.floor((game.state.clock % 1440) / 60);
		sounds.play(SND.greet(driver, h));
	}
	if (id === 'journal') {
		// as the original: reading the journal dates the newest page, and it is read aloud
		game.openJournal();
		autosave();
		journalPage = 1e9; // the latest pages
		const last = game.state.journal[game.state.journal.length - 1];
		if (last) sounds.play(SND.journal(last.n));
	}
	desk.redraw();
}

function drawTransport(g, p) {
	g.fillStyle = INK;
	g.textAlign = 'center';
	g.font = `48px ${SERIF}`;
	g.fillText(mode === 'title' || !game ? 'Prologue' : data.locations[game.state.location].name, DW / 2, 160);
	const t = video.currentTime || 0, d = video.duration || 0;
	g.fillStyle = '#3a2a1c';
	g.fillRect(200, 230, DW - 400, 16);
	g.fillStyle = BLOOD;
	g.fillRect(200, 230, d ? ((DW - 400) * t) / d : 0, 16);
	const btn = (id, glyph, x, f) => {
		const hot = p.button(id, x, 320, 220, 220, f);
		roundRect(g, x, 320, 220, 220, 24);
		g.fillStyle = hot ? '#5a3a20' : '#3b2614';
		g.fill();
		g.strokeStyle = BRASS;
		g.lineWidth = hot ? 8 : 4;
		g.stroke();
		drawGlyph(g, glyph, x + 30, 350, 160);
	};
	btn('rw', 'back', 424, () => (video.currentTime = Math.max(0, video.currentTime - 10)));
	btn('pp', video.paused ? 'play' : 'pause', 674, () => (video.paused ? video.play() : video.pause()));
	btn('ff', 'forward', 924, () => (video.currentTime = Math.min(video.duration - 0.2, video.currentTime + 10)));
	btn('skip', 'skip', 1174, () => finishVideo());
	g.fillStyle = INK;
	g.font = `34px ${SERIF}`;
	g.fillText(playing.blocked ? 'Press play to start the scene.' : 'Rewind 10 s · Pause · Forward 10 s · Skip to the end', DW / 2, 640);
	// switch this scene between flat and 3D, where it is (the Menu has the same choice)
	drawButton(g, p, 't3d', DW / 2 - 220, 700, 200, 80, '3D', () => set3d(true), { active: want3d, size: 34 });
	drawButton(g, p, 'tflat', DW / 2 + 20, 700, 200, 80, 'Flat', () => set3d(false), { active: !want3d, size: 34 });
}

// ---- Map: this port's own Victorian travel guide of London (src/londonmap.js), a pin for every address you know -
// Each district with known addresses is a group: its name, and a row of pins as wide as their names. Groups start
// at their district and are pushed apart where they would overlap, and off the cartouche, cab, compass and ribbon.
const MAP_KEEP_OUT = [[40, 215, 540, 150], [1520, 215, 490, 320], [1640, 700, 160, 160], [60, 860, 1930, 120]];
function mapGroups(g, addresses) {
	const byDistrict = {};
	addresses.forEach((a) => (byDistrict[data.locations[a].district] ||= []).push(a));
	const groups = Object.entries(byDistrict).map(([d, list]) => {
		g.font = `bold 28px ${SERIF}`;
		const widths = list.map((a) => Math.max(110, g.measureText(data.locations[a].name).width + 24));
		g.font = `italic bold 32px ${SERIF}`;
		const w = Math.max(widths.reduce((t, x) => t + x, 0), g.measureText(data.districts[d]).width + 16);
		const [cx, cy] = DISTRICT_POS[d];
		return { d, list, widths, cx, cy, w, h: 124 };
	});
	const box = (q) => [q.cx - q.w / 2, q.cy - 62, q.w, q.h];
	// how far box a must move to clear box b, the shorter way out
	const push = ([ax, ay, aw, ah], [bx, by, bw, bh]) => {
		const ox = Math.min(ax + aw, bx + bw) - Math.max(ax, bx), oy = Math.min(ay + ah, by + bh) - Math.max(ay, by);
		if (ox <= 0 || oy <= 0) return null;
		return ox < oy ? [ax + aw / 2 < bx + bw / 2 ? -ox : ox, 0] : [0, ay + ah / 2 < by + bh / 2 ? -oy : oy];
	};
	for (let it = 0; it < 40; it++) {
		let moved = false;
		for (let i = 0; i < groups.length; i++) {
			for (let j = i + 1; j < groups.length; j++) {
				const m = push(box(groups[i]), box(groups[j]));
				if (!m) continue;
				groups[i].cx += m[0] / 2 + Math.sign(m[0]);
				groups[i].cy += m[1] / 2 + Math.sign(m[1]);
				groups[j].cx -= m[0] / 2 + Math.sign(m[0]);
				groups[j].cy -= m[1] / 2 + Math.sign(m[1]);
				moved = true;
			}
			for (const k of MAP_KEEP_OUT) {
				const m = push(box(groups[i]), k);
				if (m) (groups[i].cx += m[0] + Math.sign(m[0])), (groups[i].cy += m[1] + Math.sign(m[1])), (moved = true);
			}
			const q = groups[i];
			q.cx = Math.min(Math.max(q.cx, 50 + q.w / 2), DW - 50 - q.w / 2);
			q.cy = Math.min(Math.max(q.cy, 280), 790);
		}
		if (!moved) break;
	}
	return groups;
}

function drawMap(g, p) {
	drawLondon(g);
	const halo = (text, x, y) => {
		g.lineWidth = 7;
		g.lineJoin = 'round';
		g.strokeStyle = 'rgba(216,234,223,0.9)';
		g.strokeText(text, x, y);
		g.fillText(text, x, y);
	};
	// pins, under the name of their district
	const s = game.state;
	g.textAlign = 'center';
	for (const { d, list, cx, cy, widths } of mapGroups(g, s.addresses)) {
		g.fillStyle = MAP_GREEN;
		g.font = `italic bold 32px ${SERIF}`;
		halo(data.districts[d], cx, cy - 30);
		let left = cx - widths.reduce((t, w) => t + w, 0) / 2;
		list.forEach((a, k) => {
			const x = left + widths[k] / 2, y = cy + 6;
			left += widths[k];
			const here = a === s.location;
			const hot = p.button('pin' + a, x - widths[k] / 2, y - 40, widths[k], 90, () => {
				selDest = a;
				// the address book reads the address, the map gives the travel time (two screens of the original)
				sounds.playList([SND.address(a), SND.travelTime(game.district(game.state.location), game.district(a))]);
				desk.redraw();
			});
			g.beginPath();
			g.arc(x, y, here ? 17 : 14, 0, Math.PI * 2);
			g.fillStyle = here ? '#2f7a3f' : selDest === a ? '#e05a4a' : hot ? '#c43a32' : '#9a2a2a';
			g.fill();
			g.lineWidth = 3;
			g.strokeStyle = MAP_INK;
			g.stroke();
			g.fillStyle = MAP_INK;
			g.font = `${hot || selDest === a ? 'bold ' : ''}28px ${SERIF}`;
			halo(data.locations[a].name, x, y + 46);
		});
	}
	// the chosen destination, written in the ribbon
	const { x, y, w, h } = RIBBON;
	g.fillStyle = MAP_INK;
	if (selDest != null) {
		const L = data.locations[selDest];
		const min = game.travelMinutes(selDest);
		g.textAlign = 'left';
		g.font = `32px ${SERIF}`;
		g.fillText(`${L.name}  ·  ${L.address}, ${data.districts[L.district]}`, x + 24, y + 40, 900);
		g.font = `italic 30px ${SERIF}`;
		g.textAlign = 'right';
		g.fillText(selDest === s.location ? `You are here (look again: ${min} min)` : `By carriage: ${min < 60 ? min + ' minutes' : '1 hour'}`, x + w - 290, y + 40);
		drawButton(g, p, 'go', x + w - 270, y - 8, 260, h + 16, selDest === s.location ? 'Look again' : 'Go there', () => travel(selDest), { size: 32 });
	} else {
		g.textAlign = 'center';
		g.font = `italic 32px ${SERIF}`;
		g.fillText('Choose an address to travel there by carriage.', x + w / 2, y + 40);
	}
}

async function travel(dest) {
	selDest = null;
	const name = data.locations[dest].name;
	showCard({ kind: 'message', title: `By carriage to ${name}`, text: `${data.locations[dest].address}, ${data.districts[data.locations[dest].district]}` });
	mode = 'busy';
	desk.redraw();
	// the driver repeats where you are going (skippable with the desk's skip button)
	await Promise.race([sounds.playList(SND.setOff(driver, dest)), new Promise((r) => (skipTrip = r))]);
	sounds.stop();
	const steps = game.travel(dest);
	if (!game.state.over && !steps[0]?.video) {
		// arriving without a scene on the way: the driver's arrival lines
		await Promise.race([sounds.playList(SND.arrive(driver, dest)), new Promise((r) => (skipTrip = r))]);
		sounds.stop();
	}
	skipTrip = null;
	await runSteps(steps);
}

// ---- Watch: the time, and waiting ---------------------------------------------------------------------------
function drawWatch(g, p) {
	const s = game.state;
	const cx = 420, cy = 560, R = 300;
	g.beginPath();
	g.arc(cx, cy, R + 24, 0, Math.PI * 2);
	g.fillStyle = BRASS;
	g.fill();
	g.beginPath();
	g.arc(cx, cy, R, 0, Math.PI * 2);
	g.fillStyle = '#c9bc9c';
	g.fill();
	g.fillStyle = DARKINK;
	g.textAlign = 'center';
	g.textBaseline = 'middle';
	g.font = `52px ${SERIF}`;
	const roman = ['XII', 'I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
	roman.forEach((r, i) => {
		const a = (i / 12) * Math.PI * 2;
		g.fillText(r, cx + Math.sin(a) * (R - 54), cy - Math.cos(a) * (R - 54));
	});
	const hand = (frac, len, w, col) => {
		const a = frac * Math.PI * 2;
		g.strokeStyle = col;
		g.lineWidth = w;
		g.lineCap = 'round';
		g.beginPath();
		g.moveTo(cx, cy);
		g.lineTo(cx + Math.sin(a) * len, cy - Math.cos(a) * len);
		g.stroke();
	};
	const m = s.clock % 1440;
	hand((m % 720) / 720, R * 0.5, 14, DARKINK);
	hand((m % 60) / 60, R * 0.78, 8, DARKINK);
	if (waitMin) {
		const t = (s.clock + waitMin) % 1440;
		hand((t % 60) / 60, R * 0.78, 6, 'rgba(142,27,27,0.7)');
		hand((t % 720) / 720, R * 0.5, 10, 'rgba(142,27,27,0.7)');
	}
	g.beginPath();
	g.arc(cx, cy, 16, 0, Math.PI * 2);
	g.fillStyle = DARKINK;
	g.fill();
	g.fillStyle = INK;
	g.textBaseline = 'alphabetic';
	g.textAlign = 'left';
	g.font = `44px ${SERIF}`;
	g.fillText(clockText(s.clock), 820, 300);
	g.font = `32px ${SERIF}`;
	const awake = Math.floor((s.clock - s.wake) / 60);
	g.fillText(`Awake for ${awake} hour${awake === 1 ? '' : 's'}.`, 820, 352);
	g.fillText(`Pass time here at ${data.locations[s.location].name}:`, 820, 450);
	[5, 15, 30, 60, 180].forEach((n, i) =>
		drawButton(g, p, 'w' + n, 820 + i * 220, 480, 200, 80, `+${n < 60 ? n + ' min' : n / 60 + ' h'}`, () => {
			waitMin = Math.min(720, waitMin + n);
			sounds.play(SND.time(game.state.clock + waitMin));
			desk.redraw();
		}, { size: 32 })
	);
	drawButton(g, p, 'wclr', 820, 590, 200, 80, 'Clear', () => ((waitMin = 0), desk.redraw()), { size: 32 });
	g.fillStyle = INK;
	g.font = `40px ${SERIF}`;
	g.fillText(waitMin ? `Wait until ${clockText(s.clock + waitMin, true)}` : 'Set the hands forward to wait.', 1060, 645);
	drawButton(g, p, 'wait', 820, 720, 640, 100, waitMin ? `Wait ${fmtDur(waitMin)}` : 'Wait', () => wait(), { enabled: waitMin > 0, size: 40 });
}
const fmtDur = (m) => (m >= 60 ? `${Math.floor(m / 60)} h ${m % 60 ? (m % 60) + ' min' : ''}` : `${m} min`).trim();
async function wait() {
	const m = waitMin;
	waitMin = 15;
	await runSteps(game.passTime(m));
}

// ---- Journal -------------------------------------------------------------------------------------------------
function drawJournal(g, p) {
	const entries = game.state.journal.filter((j) => j.date != null).map((j) => ({ ...j, page: data.journal[j.n] })).filter((e) => e.page?.text);
	const pages = Math.max(1, Math.ceil(entries.length / 2));
	journalPage = Math.max(0, Math.min(pages - 1, journalPage));
	g.fillStyle = '#21170f';
	g.fillRect(60, 210, DW - 120, 670);
	g.strokeStyle = '#4a3522';
	g.beginPath();
	g.moveTo(DW / 2, 210);
	g.lineTo(DW / 2, 880);
	g.stroke();
	g.textAlign = 'left';
	entries.slice(journalPage * 2, journalPage * 2 + 2).forEach((e, k) => {
		const x = 110 + k * (DW / 2 - 40);
		g.fillStyle = '#c0605a';
		g.font = `italic 34px ${SERIF}`;
		g.fillText(clockText(e.date).replace(/ - .*/, ''), x, 270);
		g.fillStyle = INK;
		g.font = `34px ${SERIF}`;
		wrap(g, e.page.text, DW / 2 - 200).slice(0, 14).forEach((l, i) => g.fillText(l, x, 330 + i * 42));
	});
	g.font = `30px ${SERIF}`;
	g.fillStyle = INK;
	g.textAlign = 'center';
	g.fillText(`${journalPage + 1} / ${pages}`, DW / 2, 920);
	drawButton(g, p, 'jprev', 600, 890, 260, 60, '‹ Earlier', () => ((journalPage -= 1), desk.redraw()), { enabled: journalPage > 0, size: 30 });
	drawButton(g, p, 'jnext', 1188, 890, 260, 60, 'Later ›', () => ((journalPage += 1), desk.redraw()), { enabled: journalPage < pages - 1, size: 30 });
}

// ---- Items: choose the one you carry --------------------------------------------------------------------------
function drawItems(g, p) {
	const s = game.state;
	g.fillStyle = INK;
	g.font = `italic 30px ${SERIF}`;
	g.textAlign = 'left';
	g.fillText('You can take one thing with you. Choose it before you set off.', 50, 250);
	const all = [0, ...s.items];
	all.forEach((n, i) => {
		const col = i % 8, row = Math.floor(i / 8);
		const x = 50 + col * 245, y = 280 + row * 205;
		const sel = s.carried === n;
		const hot = p.button('it' + n, x, y, 230, 190, () => {
			game.carry(n);
			autosave();
			if (n) sounds.play(SND.item(n));
			desk.redraw();
		});
		roundRect(g, x, y, 230, 190, 14);
		g.fillStyle = sel ? '#5a1414' : hot ? '#a8926a' : '#8a7654';
		g.fill();
		g.strokeStyle = sel ? '#e05a4a' : '#4a3522';
		g.lineWidth = sel ? 8 : 3;
		g.stroke();
		if (n) drawItem(g, n, x + 55, y + 8, 120);
		g.fillStyle = sel ? '#f6e6bf' : DARKINK;
		g.font = `24px ${SERIF}`;
		g.textAlign = 'center';
		g.fillText(n ? itemName(n) : 'Nothing', x + 115, y + (n ? 168 : 100), 220);
	});
}

// ---- At home: telegrams and sleep ------------------------------------------------------------------
function drawHome(g, p) {
	g.textAlign = 'left';
	g.fillStyle = INK;
	g.font = `40px ${SERIF}`;
	g.fillText('Telegrams', 60, 270);
	const opts = game.telegramOptions();
	if (!opts.length) {
		g.font = `italic 30px ${SERIF}`;
		g.fillText('No telegrams are waiting.', 60, 330);
	}
	opts.forEach((o, i) => {
		const y = 300 + i * 92;
		const hot = p.button('tg' + i, 60, y, 800, 80, () => runSteps([game.readTelegram(o)]));
		roundRect(g, 60, y, 800, 80, 10);
		g.fillStyle = hot ? '#4a3322' : '#2c1f16';
		g.fill();
		g.strokeStyle = '#4a3522';
		g.lineWidth = 3;
		g.stroke();
		drawGlyph(g, 'telegram', 72, y + 4, 72);
		g.fillStyle = INK;
		g.font = `34px ${SERIF}`;
		g.fillText(o.label, 160, y + 52);
	});
	g.font = `40px ${SERIF}`;
	g.fillText('The house', 1000, 270);
	drawButton(g, p, 'sleep', 1000, 310, 460, 110, 'Go to bed', () => sleep(), { size: 40 });
	g.font = `italic 28px ${SERIF}`;
	g.fillStyle = INK;
	wrap(g, 'You sleep longer the longer you have been awake. Telegrams arrive here at the house.', 900).forEach((l, i) => g.fillText(l, 1000, 640 + i * 38));
}
async function sleep() {
	const r = game.sleep();
	if (!r) return toast('You cannot sleep now.');
	await runSteps([r]);
}

// ---- Clue: uncovered a level at a time (src/hints.js) ------------------------------------------------------------
let clue = { key: null, step: null, level: 0 };
function drawClue(g, p) {
	const s = game.state;
	// a new clue once the game has moved on (what you carry does not count: a clue may tell you to pick something)
	const key = JSON.stringify([s.clock, s.location, s.flags, s.items, s.addresses]);
	if (clue.key !== key) clue = { key, step: null, level: 0 };
	g.textAlign = 'left';
	g.fillStyle = INK;
	g.font = `44px ${SERIF}`;
	g.fillText('A clue', 60, 275);
	g.font = `italic 30px ${SERIF}`;
	wrap(g, 'For when you are stuck. The clue is worked out from the game\'s own rules, from where you are now, and each press uncovers a little more: first what to do, then where, then when.', DW - 160).forEach((l, i) => g.fillText(l, 60, 330 + i * 40));
	if (clue.level && clue.step) {
		g.font = `38px ${SERIF}`;
		let y = 480;
		clueText(data, s, clue.step, clue.level, itemName).forEach((text, i) => {
			g.fillStyle = BLOOD;
			g.fillText(['I.', 'II.', 'III.'][i], 60, y);
			g.fillStyle = INK;
			for (const l of wrap(g, text, DW - 260)) g.fillText(l, 140, y), (y += 48);
			y += 22;
		});
	}
	const more = ['Uncover a clue', 'Where?', 'When?'][clue.level];
	if (more && !clue.step?.lost)
		drawButton(g, p, 'cluemore', 60, 790, 460, 90, more, () => {
			clue.step ||= nextStep(data, game.state);
			clue.level = clue.step?.lost ? 1 : clue.level + 1;
			desk.redraw();
		}, { size: 38 });
	if (clue.level) drawButton(g, p, 'clueless', 560, 790, 380, 90, 'Cover it up', () => ((clue.level = 0), desk.redraw()), { size: 34 });
}

// ---- Menu ------------------------------------------------------------------------------------------------------
function drawMenu(g, p) {
	g.textAlign = 'left';
	g.fillStyle = INK;
	if (!data) {
		g.font = `40px ${SERIF}`;
		wrap(g, loadError || 'Loading…', DW - 160).forEach((l, i) => g.fillText(l, 60, 300 + i * 52));
		return;
	}
	g.font = `40px ${SERIF}`;
	g.fillText('Game', 60, 270);
	drawButton(g, p, 'new', 60, 300, 420, 96, 'New game', () => newGame(), { size: 40 });
	let auto = null;
	try {
		auto = localStorage.getItem('dracula.auto');
	} catch {}
	drawButton(g, p, 'cont', 60, 420, 420, 96, 'Continue', () => load(auto), { enabled: !!auto, size: 40 });
	if (mode === 'play') drawButton(g, p, 'back', 60, 540, 420, 96, 'Back to the desk', () => ((tab = 'map'), desk.redraw()), { size: 36 });
	g.fillStyle = INK;
	g.font = `40px ${SERIF}`;
	g.fillText('Saved games', 600, 270);
	for (let i = 1; i <= 3; i++) {
		const y = 300 + (i - 1) * 130, info = slotInfo(i);
		g.font = `30px ${SERIF}`;
		g.fillStyle = INK;
		g.fillText(info || 'empty', 1080, y + 58);
		drawButton(g, p, 'save' + i, 600, y, 200, 96, `Save ${i}`, () => (localStorage.setItem(slotKey(i), game.save()), toast(`Saved in slot ${i}.`)), { enabled: !!game && mode === 'play', size: 34 });
		drawButton(g, p, 'load' + i, 830, y, 200, 96, `Load ${i}`, () => load(localStorage.getItem(slotKey(i))), { enabled: !!info, size: 34 });
	}
	g.fillStyle = INK;
	g.font = `40px ${SERIF}`;
	g.fillText('Scenes', 60, 690);
	drawButton(g, p, '3d', 60, 720, 200, 80, '3D', () => set3d(true), { active: want3d, size: 34 });
	drawButton(g, p, 'flat', 280, 720, 200, 80, 'Flat', () => set3d(false), { active: !want3d, size: 34 });
	drawButton(g, p, 'voices', 1060, 720, 300, 80, voicesOn ? 'Voices: on' : 'Voices: off', () => {
		voicesOn = !voicesOn;
		sounds.volume = voicesOn ? 0.9 : 0;
		try {
			localStorage.setItem('dracula.voices', voicesOn ? '1' : '0');
		} catch {}
		desk.redraw();
	}, { active: voicesOn, size: 30 });
	drawButton(g, p, 'music', 1380, 720, 300, 80, music.enabled ? 'Music: on' : 'Music: off', () => {
		music.enabled = !music.enabled;
		if (!music.enabled) music.fadeOut();
		try {
			localStorage.setItem('dracula.music', music.enabled ? '1' : '0');
		} catch {}
		desk.redraw();
	}, { active: music.enabled, size: 30 });
	g.fillStyle = INK;
	g.font = `40px ${SERIF}`;
	g.fillText('Guide and sound', 600, 690);
	drawButton(g, p, 'guide', 600, 720, 420, 80, guideOn ? 'Van Helsing: on' : 'Van Helsing: off', () => {
		guideOn = !guideOn;
		try {
			localStorage.setItem('dracula.guide', guideOn ? '1' : '0');
		} catch {}
		if (guideOn) guided.clear();
		desk.redraw();
	}, { active: guideOn, size: 32 });
	drawButton(g, p, 'clues', 1700, 720, 300, 80, cluesOn ? 'Clues: on' : 'Clues: off', () => {
		cluesOn = !cluesOn;
		try {
			localStorage.setItem('dracula.clues', cluesOn ? '1' : '0');
		} catch {}
		if (!cluesOn && tab === 'clue') tab = 'menu';
		toast(cluesOn ? 'Clues are on: the Clue tab on the desk uncovers one a little at a time.' : 'Clues are off.');
		desk.redraw();
	}, { active: cluesOn, size: 30 });
	if (mode === 'over') {
		g.fillStyle = BLOOD;
		g.font = `40px ${SERIF}`;
		g.fillText(game.state.over === 'win' ? 'You have Won! What would you like to do?' : 'You have died! What would you like to do?', 600, 760);
	}
	g.fillStyle = INK;
	g.font = `italic 26px ${SERIF}`;
	g.fillText('VR: point and pull the trigger · thumbstick click re-centres. Desktop: click · R re-centres.', 60, 900);
}

// canvas text needs the web font: redraw once it has loaded
document.fonts?.ready.then(() => (desk.redraw(), card.redraw()));

function set3d(on) {
	want3d = on;
	try {
		localStorage.setItem('dracula.scenes', on ? '3d' : 'flat');
	} catch {}
	if (playing) {
		// during a scene: reload it in the other form and carry on from the same moment
		const t = video.currentTime, paused = video.paused;
		video.src = `${MEDIA}video/${playing.name}${on ? '.3d' : ''}.mp4`;
		show3d(on);
		video.addEventListener('loadeddata', () => {
			video.currentTime = t;
			if (!paused) video.play().catch(() => {});
		}, { once: true });
	} else toast(on ? 'Scenes will play in 3D (where a 3D version has been made).' : 'Scenes will play flat.');
	desk.redraw();
}

// ---- start -------------------------------------------------------------------------------------------------------
let loadError = null;
fetch(`${MEDIA}game.json`)
	.then((r) => {
		if (!r.ok) throw new Error(r.status);
		return r.json();
	})
	.then((d) => {
		data = d;
		showCard({ kind: 'title' });
		desk.redraw();
	})
	.catch(() => {
		loadError = 'The game data was not found. Add the media zip made from your own disc with "Add media" on the page (outside VR), or start the local server with --media <folder> (see README).';
		showCard({ kind: 'title', sub: 'Game data not found: add your media (see the page).' });
		desk.redraw();
	});

let lastSecond = 0, lastFrame = 0;
renderer.setAnimationLoop((now) => {
	const { scroll, recentre } = input.update([desk.mesh, card.mesh]);
	if (scroll && tab === 'journal' && mode === 'play') {
		journalPage += scroll;
		desk.redraw();
	}
	if (recentre) {
		// turn the room so the screen is straight ahead of the head
		const dir = new THREE.Vector3();
		camera.getWorldDirection(dir);
		rig.rotation.y -= Math.atan2(-dir.x, -dir.z);
	}
	// desktop: look up at the screen while a scene plays, down at the desk otherwise (in VR the head decides)
	if (!renderer.xr.isPresenting) {
		camera.rotation.x += ((playing ? 0.2 : -0.24) - camera.rotation.x) * 0.08;
		const fov = playing ? 62 : 78; // zoom in on the screen during a scene
		if (Math.abs(camera.fov - fov) > 0.05) {
			camera.fov += (fov - camera.fov) * 0.08;
			camera.updateProjectionMatrix();
		}
	}
	const dt = Math.min(0.1, (now - (lastFrame || now)) / 1000);
	lastFrame = now;
	sampleScreen(now);
	study.update(dt, screenColor, !!playing);
	if (playing) music.fadeOut();
	music.update(dt, !!sounds.current);
	if (playing && now - lastSecond > 250) {
		lastSecond = now;
		desk.redraw();
	}
	if (toasts.length && now - (desk.lastToast || 0) > 1000) {
		desk.lastToast = now;
		desk.redraw();
	}
	desk.update();
	card.update();
	renderer.render(scene, camera);
});

// ?debug=1: a handle for automated tests (headless browser)
if (new URLSearchParams(location.search).has('debug'))
	window.__dracula = { get ready() { return !!data; }, desk, sounds, openTab, get playing() { return playing; }, get depthScreen() { return depthScreen; }, set3d, scene, screen, card, playVideo, newGame, sleep, readTelegram: (i) => runSteps([game.readTelegram(game.telegramOptions()[i])]), travel, wait: (m) => ((waitMin = m), wait()), setTab: (t) => ((tab = t), desk.redraw()), get game() { return game; }, get mode() { return mode; }, finishVideo, video };
