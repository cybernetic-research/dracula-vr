// A flat interactive surface: a canvas drawn by a callback, shown on a plane, with clickable regions.
// Controllers and the mouse aim at it with a ray; the region under the ray is highlighted; a press clicks it.
import * as THREE from 'three';

export class Panel {
	// w, h: canvas pixels; width: metres; draw(ctx, panel) paints the canvas and adds regions with panel.button()
	constructor({ w, h, width, draw, transparent = false }) {
		this.canvas = document.createElement('canvas');
		this.canvas.width = w;
		this.canvas.height = h;
		this.ctx = this.canvas.getContext('2d');
		this.texture = new THREE.CanvasTexture(this.canvas);
		this.texture.colorSpace = THREE.SRGBColorSpace;
		this.texture.anisotropy = 8;
		this.mesh = new THREE.Mesh(
			new THREE.PlaneGeometry(width, (width * h) / w),
			new THREE.MeshBasicMaterial({ map: this.texture, transparent, toneMapped: false, fog: false })
		);
		this.mesh.userData.panel = this;
		this.drawFn = draw;
		this.regions = [];
		this.hover = null; // id of the region under a ray
		this.dirty = true;
	}

	// adds a clickable region while drawing; returns whether it is hovered (to draw it highlighted)
	button(id, x, y, w, h, onClick, enabled = true) {
		this.regions.push({ id, x, y, w, h, onClick, enabled });
		return enabled && this.hover === id;
	}

	redraw() {
		this.dirty = true;
	}

	update() {
		if (!this.dirty || !this.mesh.visible) return;
		this.dirty = false;
		this.regions = [];
		this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
		this.drawFn(this.ctx, this);
		this.texture.needsUpdate = true;
	}

	regionAt(uv) {
		const x = uv.x * this.canvas.width, y = (1 - uv.y) * this.canvas.height;
		for (let i = this.regions.length - 1; i >= 0; i--) {
			const r = this.regions[i];
			if (r.enabled && x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return r;
		}
		return null;
	}

	setHover(id) {
		if (id !== this.hover) {
			this.hover = id;
			this.dirty = true;
		}
	}
}

// ---- drawing helpers shared by the panels --------------------------------------------------------------------

// a dark theme: aged leather, light ink, muted brass
export const INK = '#d4bf96', PAPER = '#17100c', BRASS = '#a8873e', BLOOD = '#a8302c', DIM = 'rgba(212,191,150,0.35)', DARKINK = '#1a120c';
export const SERIF = "'IM Fell English', 'Iowan Old Style', Georgia, serif";

export function roundRect(ctx, x, y, w, h, r) {
	ctx.beginPath();
	ctx.moveTo(x + r, y);
	ctx.arcTo(x + w, y, x + w, y + h, r);
	ctx.arcTo(x + w, y + h, x, y + h, r);
	ctx.arcTo(x, y + h, x, y, r);
	ctx.arcTo(x, y, x + w, y, r);
	ctx.closePath();
}

// a brass-edged label button; returns nothing (registers the region)
export function drawButton(ctx, panel, id, x, y, w, h, label, onClick, { enabled = true, active = false, size = 34 } = {}) {
	const hot = panel.button(id, x, y, w, h, onClick, enabled);
	ctx.save();
	roundRect(ctx, x, y, w, h, 10);
	ctx.fillStyle = !enabled ? 'rgba(60,45,35,0.35)' : active ? BLOOD : hot ? '#4a2c18' : '#2a1a10';
	ctx.fill();
	ctx.lineWidth = hot ? 5 : 3;
	ctx.strokeStyle = enabled ? BRASS : 'rgba(201,162,74,0.35)';
	ctx.stroke();
	ctx.fillStyle = enabled ? (hot || active ? '#fff3d6' : '#f1dcae') : 'rgba(241,220,174,0.4)';
	ctx.font = `${size}px ${SERIF}`;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillText(label, x + w / 2, y + h / 2 + 2, w - 16);
	ctx.restore();
}

// wraps text into lines that fit a width
export function wrap(ctx, text, width) {
	const out = [];
	for (const para of String(text).split(/\r?\n/)) {
		let line = '';
		for (const word of para.split(/\s+/)) {
			const t = line ? line + ' ' + word : word;
			if (ctx.measureText(t).width > width && line) {
				out.push(line);
				line = word;
			} else line = t;
		}
		out.push(line);
	}
	return out;
}
