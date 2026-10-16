// Alexander's study at night, built in code (original design): a dark gothic room lit by candles, a storm outside a
// pointed window, and a large screen in a carved ebony frame where the scenes play. You sit at a writing desk.
// Coordinates: seated, origin at the head when the session starts, -z forward. update(dt, light) animates the
// candles and the storm; light = the colour of the picture on the screen (it spills into the room).
import * as THREE from 'three';

function canvasTexture(w, h, paint, repeat = [1, 1]) {
	const c = document.createElement('canvas');
	c.width = w;
	c.height = h;
	paint(c.getContext('2d'), w, h);
	const t = new THREE.CanvasTexture(c);
	t.colorSpace = THREE.SRGBColorSpace;
	t.wrapS = t.wrapT = THREE.RepeatWrapping;
	t.repeat.set(...repeat);
	t.anisotropy = 8;
	return t;
}
const rnd = Math.random;

// dark red damask
const damask = () =>
	canvasTexture(256, 256, (g, w, h) => {
		g.fillStyle = '#1a0a0b';
		g.fillRect(0, 0, w, h);
		g.strokeStyle = 'rgba(90,20,24,0.55)';
		g.fillStyle = 'rgba(60,12,16,0.6)';
		g.lineWidth = 3;
		for (const [cx, cy] of [[64, 64], [192, 192], [192, 64 - 128], [64, 192 + 0]])
			for (const oy of [0, 256]) {
				const y = (cy + oy) % 256;
				g.beginPath();
				g.moveTo(cx, y - 46);
				g.bezierCurveTo(cx + 40, y - 20, cx + 30, y + 30, cx, y + 46);
				g.bezierCurveTo(cx - 30, y + 30, cx - 40, y - 20, cx, y - 46);
				g.fill();
				g.stroke();
				g.beginPath();
				g.arc(cx, y, 10, 0, 7);
				g.stroke();
			}
	}, [7, 3]);

const wood = (base = '#1c100a', grain = 'rgba(0,0,0,0.35)', repeat = [1, 1]) =>
	canvasTexture(256, 256, (g, w, h) => {
		g.fillStyle = base;
		g.fillRect(0, 0, w, h);
		g.strokeStyle = grain;
		for (let i = 0; i < 40; i++) {
			g.lineWidth = 1 + rnd() * 2;
			const y = rnd() * h;
			g.beginPath();
			g.moveTo(0, y);
			g.bezierCurveTo(w * 0.3, y + rnd() * 10 - 5, w * 0.7, y + rnd() * 10 - 5, w, y);
			g.stroke();
		}
	}, repeat);

const stone = () =>
	canvasTexture(512, 512, (g, w, h) => {
		g.fillStyle = '#121112';
		g.fillRect(0, 0, w, h);
		for (let y = 0; y < h; y += 128)
			for (let x = 0; x < w; x += 128) {
				const v = 14 + rnd() * 10;
				g.fillStyle = `rgb(${v},${v - 1},${v + 1})`;
				g.fillRect(x + 3, y + 3, 122, 122);
				for (let k = 0; k < 120; k++) {
					g.fillStyle = `rgba(0,0,0,${rnd() * 0.3})`;
					g.fillRect(x + rnd() * 128, y + rnd() * 128, 3, 3);
				}
			}
	}, [5, 5]);

const rug = () =>
	canvasTexture(512, 512, (g, w, h) => {
		g.fillStyle = '#260808';
		g.fillRect(0, 0, w, h);
		g.strokeStyle = '#4a3416';
		g.lineWidth = 10;
		g.strokeRect(24, 24, w - 48, h - 48);
		g.strokeStyle = '#0e0e16';
		g.lineWidth = 18;
		g.strokeRect(60, 60, w - 120, h - 120);
		g.fillStyle = '#3a0c0c';
		for (let i = 0; i < 5; i++) {
			g.save();
			g.translate(w / 2, h / 2);
			g.rotate((i * Math.PI) / 5);
			g.fillRect(-120, -18, 240, 36);
			g.restore();
		}
	});

// a pointed (gothic) arch outline, width w, straight sides to height h, apex above
function archShape(w, h, apex) {
	const s = new THREE.Shape();
	s.moveTo(-w / 2, 0);
	s.lineTo(-w / 2, h);
	s.quadraticCurveTo(-w / 2, h + apex * 0.75, 0, h + apex);
	s.quadraticCurveTo(w / 2, h + apex * 0.75, w / 2, h);
	s.lineTo(w / 2, 0);
	s.closePath();
	return s;
}

function flameTexture() {
	return canvasTexture(64, 128, (g, w, h) => {
		const grd = g.createRadialGradient(32, 84, 2, 32, 76, 40);
		grd.addColorStop(0, 'rgba(255,250,220,1)');
		grd.addColorStop(0.3, 'rgba(255,190,90,0.9)');
		grd.addColorStop(1, 'rgba(255,120,30,0)');
		g.fillStyle = grd;
		g.beginPath();
		g.moveTo(32, 10);
		g.quadraticCurveTo(58, 80, 32, 120);
		g.quadraticCurveTo(6, 80, 32, 10);
		g.fill();
	});
}

export function buildStudy(scene) {
	const room = new THREE.Group();
	scene.add(room);
	scene.background = new THREE.Color(0x020203);
	scene.fog = new THREE.FogExp2(0x040306, 0.16);

	const floorY = -1.2; // seated: the floor is about 1.2 m below the eyes
	const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, ...o });

	// floor, rug, walls, beams, ceiling
	const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), std({ map: stone() }));
	floor.rotation.x = -Math.PI / 2;
	floor.position.y = floorY;
	room.add(floor);
	const r = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2.4), std({ map: rug() }));
	r.rotation.x = -Math.PI / 2;
	r.position.set(0, floorY + 0.005, -1.1);
	room.add(r);
	const paper = std({ map: damask() });
	const panelling = std({ map: wood('#140b07') });
	const wall = (w, x, z, ry) => {
		const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 4.8), paper);
		m.position.set(x, floorY + 2.4, z);
		m.rotation.y = ry;
		room.add(m);
		const wain = new THREE.Mesh(new THREE.BoxGeometry(w, 1.0, 0.05), panelling);
		wain.position.set(x, floorY + 0.5, z);
		wain.rotation.y = ry;
		wain.translateZ(0.025);
		room.add(wain);
	};
	// (the back wall is built with the screen below: it has an opening for the 3D alcove)
	wall(8, -3.2, 0, Math.PI / 2);
	wall(8, 3.2, 0, -Math.PI / 2);
	wall(8, 0, 3.2, Math.PI);
	const ceil = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), std({ color: 0x050404 }));
	ceil.rotation.x = Math.PI / 2;
	ceil.position.y = floorY + 4.8;
	room.add(ceil);
	for (const z of [-2.6, -1.2, 0.2, 1.6]) {
		const beam = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.22, 0.26), std({ map: wood('#0f0805') }));
		beam.position.set(0, floorY + 4.65, z);
		room.add(beam);
	}

	// writing desk
	const deskTop = floorY + 0.74;
	const top = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.05, 0.85), std({ map: wood('#24140c'), roughness: 0.6 }));
	top.position.set(0, deskTop - 0.025, -0.72);
	room.add(top);
	for (const x of [-0.65, 0.65]) {
		const ped = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.7, 0.8), std({ map: wood('#1a0e08') }));
		ped.position.set(x, floorY + 0.35, -0.72);
		room.add(ped);
	}

	// candles: a candlestick at each back corner of the desk, and a candelabrum on a stand by the screen
	const flameTex = flameTexture();
	const flames = [];
	const wax = std({ color: 0xd8ccb0, roughness: 0.5 });
	const iron = std({ color: 0x1a1612, metalness: 0.6, roughness: 0.5 });
	function candle(x, y, z, h = 0.14, light = true) {
		const c = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.013, h, 10), wax);
		c.position.set(x, y + h / 2, z);
		room.add(c);
		const f = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
		f.scale.set(0.025, 0.05, 1);
		f.position.set(x, y + h + 0.022, z);
		room.add(f);
		let l = null;
		if (light) {
			l = new THREE.PointLight(0xff9a4a, 1.2, 4, 1.8);
			l.position.set(x, y + h + 0.06, z);
			room.add(l);
		}
		flames.push({ f, l, base: l ? l.intensity : 0, seed: rnd() * 100 });
	}
	for (const x of [-0.72, 0.72]) {
		const holder = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.04, 16), iron);
		holder.position.set(x, deskTop + 0.02, -1.0);
		room.add(holder);
		candle(x, deskTop + 0.04, -1.0, 0.16);
	}
	for (const side of [-1, 1]) {
		const x = side * 2.95, z = -2.7;
		const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.12, 1.5, 12), iron);
		stand.position.set(x, floorY + 0.75, z);
		room.add(stand);
		const arm = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.02, 0.02), iron);
		arm.position.set(x, floorY + 1.5, z);
		room.add(arm);
		for (const dx of [-0.2, 0, 0.2]) candle(x + dx, floorY + 1.51, z, dx ? 0.12 : 0.16, dx === 0);
	}

	room.add(new THREE.AmbientLight(0x1a1c2e, 0.35));
	const moon = new THREE.DirectionalLight(0x6f88c8, 0.25);
	moon.position.set(-3, 2, 0.5);
	room.add(moon);
	// the light of the picture on the screen, thrown into the room
	const glow = new THREE.PointLight(0x8899aa, 0.0, 6, 1.4);
	glow.position.set(0, 0.75, -2.4);
	room.add(glow);

	// bookshelves in the corners
	const books = std({ map: canvasTexture(256, 256, (g, w, h) => {
		g.fillStyle = '#0c0705';
		g.fillRect(0, 0, w, h);
		const cols = ['#2a0c0c', '#0f1d15', '#14142a', '#2e2410', '#1d0c15', '#221a12'];
		for (let row = 0; row < 4; row++)
			for (let x = 4; x < w - 8; ) {
				const bw = 8 + rnd() * 12;
				g.fillStyle = cols[Math.floor(rnd() * cols.length)];
				g.fillRect(x, row * 64 + 8 + rnd() * 8, bw - 2, 52);
				x += bw;
			}
	}) });
	for (const x of [-3.0, 3.0]) {
		const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.35, 2.6, 1.4), [books, books, std({ map: wood() }), std({ map: wood() }), std({ map: wood() }), std({ map: wood() })]);
		shelf.position.set(x, floorY + 1.3, 1.0);
		room.add(shelf);
	}

	// a tall pointed window on the left wall: storm clouds, the moon, lightning
	const sky = canvasTexture(256, 512, (g, w, h) => {
		const grd = g.createLinearGradient(0, 0, 0, h);
		grd.addColorStop(0, '#05070d');
		grd.addColorStop(1, '#151a2a');
		g.fillStyle = grd;
		g.fillRect(0, 0, w, h);
		g.fillStyle = 'rgba(210,220,240,0.9)';
		g.beginPath();
		g.arc(170, 120, 26, 0, 7);
		g.fill();
		for (let i = 0; i < 40; i++) {
			g.fillStyle = `rgba(20,24,36,${0.4 + rnd() * 0.5})`;
			g.beginPath();
			g.ellipse(rnd() * w, rnd() * h * 0.6, 40 + rnd() * 60, 10 + rnd() * 16, 0, 0, 7);
			g.fill();
		}
		g.fillStyle = '#06070a';
		for (let x = 0; x < w; x += 18) g.fillRect(x, h * 0.78 - rnd() * 60, 16, h);
	});
	const winMat = new THREE.MeshBasicMaterial({ map: sky, color: 0x5a6070, fog: false });
	const win = new THREE.Mesh(new THREE.ShapeGeometry(archShape(1.1, 1.7, 0.6)), winMat);
	win.geometry.computeBoundingBox();
	// map the texture over the arch
	const uv = win.geometry.attributes.uv, pos = win.geometry.attributes.position;
	for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / 1.1 + 0.5, pos.getY(i) / 2.3);
	win.position.set(-3.18, floorY + 1.0, -1.2);
	win.rotation.y = Math.PI / 2;
	room.add(win);
	const mull = std({ color: 0x0a0605 });
	for (const [w, h, y, zz] of [[0.05, 2.3, 1.15, 0], [1.1, 0.05, 1.0, 0], [1.1, 0.05, 1.7, 0]]) {
		const m = new THREE.Mesh(new THREE.BoxGeometry(0.04, h, w), mull);
		m.position.set(-3.16, floorY + 1.0 + y, -1.2 + zz);
		room.add(m);
	}

	// the screen: 16:10, large, in a carved ebony frame with a pointed crest
	const screenW = 5.2, screenH = 3.25;
	const screenPos = new THREE.Vector3(0, 0.75, -3.42);
	const frame = new THREE.Group();
	const ebony = std({ color: 0x0b0706, roughness: 0.45 });
	const gilt = std({ color: 0x6a5020, metalness: 0.7, roughness: 0.45 });
	const bar = (w, h, x, y, mat = ebony, d = 0.1) => {
		const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
		m.position.set(x, y, 0);
		frame.add(m);
	};
	const t = 0.16;
	bar(screenW + 2 * t, t, 0, screenH / 2 + t / 2);
	bar(screenW + 2 * t, t, 0, -screenH / 2 - t / 2);
	bar(t, screenH, -screenW / 2 - t / 2, 0);
	bar(t, screenH, screenW / 2 + t / 2, 0);
	bar(screenW + 0.04, 0.02, 0, screenH / 2 + 0.01, gilt, 0.12);
	bar(screenW + 0.04, 0.02, 0, -screenH / 2 - 0.01, gilt, 0.12);
	bar(0.02, screenH, -screenW / 2 - 0.01, 0, gilt, 0.12);
	bar(0.02, screenH, screenW / 2 + 0.01, 0, gilt, 0.12);
	const crest = new THREE.Mesh(new THREE.ExtrudeGeometry(archShape(2.0, 0, 0.6), { depth: 0.08, bevelEnabled: false }), ebony);
	crest.position.set(0, screenH / 2 + t - 0.01, -0.04);
	frame.add(crest);
	for (const side of [-1, 1]) {
		const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.14, screenH + 0.9, 0.16), ebony);
		pillar.position.set(side * (screenW / 2 + t + 0.1), -0.05, 0.02);
		frame.add(pillar);
		const spire = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.4, 4), ebony);
		spire.position.set(side * (screenW / 2 + t + 0.1), screenH / 2 + 0.6, 0.02);
		frame.add(spire);
	}
	frame.position.copy(screenPos);

	// the back wall, with an opening behind the screen, and the alcove behind it (for the 3D scenes): its sides run
	// along the lines from the seat through the frame's edges, so from the seat they never cut into the picture
	const wallZ = -3.5, k = wallZ / screenPos.z;
	const ox = (screenW / 2) * k, oy0 = (screenPos.y - screenH / 2) * k, oy1 = (screenPos.y + screenH / 2) * k;
	const back = new THREE.Shape();
	back.moveTo(-4, floorY);
	back.lineTo(4, floorY);
	back.lineTo(4, floorY + 4.8);
	back.lineTo(-4, floorY + 4.8);
	back.closePath();
	const hole = new THREE.Path();
	hole.moveTo(-ox, oy0);
	hole.lineTo(-ox, oy1);
	hole.lineTo(ox, oy1);
	hole.lineTo(ox, oy0);
	hole.closePath();
	back.holes.push(hole);
	const backGeo = new THREE.ShapeGeometry(back);
	const bp = backGeo.attributes.position, buv = backGeo.attributes.uv;
	for (let i = 0; i < bp.count; i++) buv.setXY(i, bp.getX(i) / 8 + 0.5, (bp.getY(i) - floorY) / 4.8);
	const backWall = new THREE.Mesh(backGeo, paper);
	backWall.position.z = wallZ;
	room.add(backWall);
	const skirting = new THREE.Mesh(new THREE.BoxGeometry(8, 0.3, 0.05), panelling);
	skirting.position.set(0, floorY + 0.15, wallZ + 0.025);
	room.add(skirting);
	const farZ = -7.2, f = farZ / wallZ;
	const near = [[-ox, oy0], [ox, oy0], [ox, oy1], [-ox, oy1]];
	const pts = [];
	for (let i = 0; i < 4; i++) {
		const [ax, ay] = near[i], [bx, by] = near[(i + 1) % 4];
		const q = [[ax, ay, wallZ], [bx, by, wallZ], [bx * f, by * f, farZ], [ax * f, ay * f, farZ]];
		pts.push(...q[0], ...q[1], ...q[2], ...q[0], ...q[2], ...q[3]);
	}
	pts.push(-ox * f, oy0 * f, farZ, ox * f, oy0 * f, farZ, ox * f, oy1 * f, farZ, -ox * f, oy0 * f, farZ, ox * f, oy1 * f, farZ, -ox * f, oy1 * f, farZ);
	const alcoveGeo = new THREE.BufferGeometry();
	alcoveGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
	alcoveGeo.computeVertexNormals();
	const alcove = new THREE.Mesh(alcoveGeo, new THREE.MeshBasicMaterial({ color: 0x010101, side: THREE.DoubleSide }));
	room.add(alcove);
	room.add(frame);

	// ---- animation: candle flicker, the storm, the screen's light ------------------------------------------------
	let time = 0, nextFlash = 8 + rnd() * 15, flash = 0;
	const sound = { thunder: null };
	function update(dt, screenColor, quiet) {
		time += dt;
		for (const c of flames) {
			const k = 0.82 + 0.12 * Math.sin(time * 11 + c.seed) + 0.08 * Math.sin(time * 23.7 + c.seed * 2) + (rnd() - 0.5) * 0.08;
			c.f.scale.set(0.025 * (0.9 + k * 0.1), 0.05 * k, 1);
			if (c.l) c.l.intensity = c.base * k;
		}
		// lightning: a double flash in the window and on the walls, thunder a moment later (not during scenes)
		nextFlash -= dt;
		if (nextFlash <= 0 && !quiet) {
			flash = 1;
			nextFlash = 18 + rnd() * 40;
			setTimeout(() => sound.thunder?.(), 600 + rnd() * 1800);
		}
		const f = flash > 0 ? (flash > 0.75 || (flash > 0.4 && flash < 0.55) ? 1 : 0.15) * flash : 0;
		flash = Math.max(0, flash - dt * 1.6);
		moon.intensity = 0.25 + f * 3.5;
		winMat.color.setRGB(0.35 + f * 0.65, 0.38 + f * 0.62, 0.45 + f * 0.55);
		if (screenColor) {
			glow.color.copy(screenColor);
			glow.intensity = 0.9;
		} else glow.intensity = 0.25;
	}

	return { room, deskTop, screenW, screenH, screenPos, update, sound };
}

// distant thunder, synthesized (brown noise through a low-pass filter); returns a function to trigger a rumble
export function makeThunder() {
	let ctx = null;
	return () => {
		try {
			ctx ||= new (window.AudioContext || window.webkitAudioContext)();
			if (ctx.state === 'suspended') ctx.resume();
			const len = 4 * ctx.sampleRate, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
			let last = 0;
			for (let i = 0; i < len; i++) {
				last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
				d[i] = last * 3.5;
			}
			const src = ctx.createBufferSource();
			src.buffer = buf;
			const lp = ctx.createBiquadFilter();
			lp.type = 'lowpass';
			lp.frequency.value = 180;
			const g = ctx.createGain();
			const t = ctx.currentTime;
			g.gain.setValueAtTime(0, t);
			g.gain.linearRampToValueAtTime(0.5, t + 0.25);
			g.gain.exponentialRampToValueAtTime(0.25, t + 1.2);
			g.gain.exponentialRampToValueAtTime(0.001, t + 4);
			src.connect(lp).connect(g).connect(ctx.destination);
			src.start();
		} catch {}
	};
}
