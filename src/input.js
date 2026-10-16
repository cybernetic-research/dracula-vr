// Pointing at the desk and the screen. VR: each controller casts a ray; the trigger clicks; the thumbstick
// scrolls (journal pages) and its click re-centres. Desktop: the mouse is the ray; click; wheel scrolls; R re-centres.
import * as THREE from 'three';

const _m = new THREE.Matrix4();

function makeRay() {
	const g = new THREE.Group();
	const line = new THREE.Mesh(new THREE.CylinderGeometry(0.0015, 0.0015, 1, 6), new THREE.MeshBasicMaterial({ color: 0xffd98a, transparent: true, opacity: 0.55 }));
	line.rotation.x = Math.PI / 2;
	line.position.z = -0.5;
	g.add(line);
	const dot = new THREE.Mesh(new THREE.SphereGeometry(0.008, 12, 8), new THREE.MeshBasicMaterial({ color: 0xfff1c8 }));
	g.add(dot);
	g.userData = { line, dot };
	return g;
}

export class Input {
	constructor(renderer, scene, camera) {
		this.renderer = renderer;
		this.camera = camera;
		this.scene = scene;
		this.rays = { left: makeRay(), right: makeRay(), mouse: null };
		scene.add(this.rays.left, this.rays.right);
		this.taps = {};
		this.selectHeld = {};
		renderer.xr.addEventListener('sessionstart', () => {
			const s = renderer.xr.getSession();
			s.addEventListener('selectstart', (e) => {
				this.taps[e.inputSource.handedness] = true;
				this.selectHeld[e.inputSource.handedness] = true;
			});
			s.addEventListener('selectend', (e) => (this.selectHeld[e.inputSource.handedness] = false));
		});
		this.mouse = new THREE.Vector2();
		this.clicked = false;
		this.wheel = 0;
		this.keys = new Set();
		const dom = renderer.domElement;
		dom.addEventListener('pointermove', (e) => this.mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1));
		dom.addEventListener('pointerdown', (e) => {
			this.mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
			this.clicked = true;
		});
		dom.addEventListener('wheel', (e) => (this.wheel += Math.sign(e.deltaY)), { passive: true });
		addEventListener('keydown', (e) => this.keys.add(e.code));
		addEventListener('keyup', (e) => this.keys.delete(e.code));
		this.raycaster = new THREE.Raycaster();
		this._prev = {};
	}

	edge(name, down) {
		const was = this._prev[name];
		this._prev[name] = down;
		return down && !was;
	}

	// targets: meshes with userData.panel; returns {scroll, recentre}
	update(targets) {
		const aims = [];
		let scroll = 0, recentre = false;
		const xr = this.renderer.xr.isPresenting;
		this.rays.left.visible = this.rays.right.visible = false;
		if (xr) {
			const session = this.renderer.xr.getSession();
			const frame = this.renderer.xr.getFrame?.();
			const ref = this.renderer.xr.getReferenceSpace();
			const rig = this.camera.parent;
			for (const src of session?.inputSources ?? []) {
				if (src.targetRayMode !== 'tracked-pointer') continue;
				const pose = frame && ref ? frame.getPose(src.targetRaySpace, ref) : null;
				if (!pose) continue;
				_m.fromArray(pose.transform.matrix);
				if (rig) _m.premultiply(rig.matrixWorld);
				const id = src.handedness || 'none';
				const gp = src.gamepad;
				const trig = !!gp?.buttons[0]?.pressed;
				const pressed = this.edge('t' + id, trig) || !!this.taps[id];
				this.taps[id] = false;
				const sy = gp?.axes[3] ?? 0;
				if (this.edge('su' + id, sy < -0.7)) scroll -= 1;
				if (this.edge('sd' + id, sy > 0.7)) scroll += 1;
				recentre ||= this.edge('sc' + id, !!gp?.buttons[3]?.pressed);
				aims.push({ id, origin: new THREE.Vector3().setFromMatrixPosition(_m), dir: new THREE.Vector3(0, 0, -1).transformDirection(_m), pressed, src });
			}
		} else {
			this.raycaster.setFromCamera(this.mouse, this.camera);
			aims.push({ id: 'mouse', origin: this.raycaster.ray.origin.clone(), dir: this.raycaster.ray.direction.clone(), pressed: this.clicked });
			scroll = this.wheel;
			recentre = this.edge('r', this.keys.has('KeyR'));
		}
		this.clicked = false;
		this.wheel = 0;

		// hover / click
		const hovered = new Map();
		let clicks = [];
		for (const a of aims) {
			this.raycaster.set(a.origin, a.dir);
			const hit = this.raycaster.intersectObjects(targets.filter((t) => t.visible), false)[0];
			const ray = this.rays[a.id];
			if (ray) {
				ray.visible = true;
				ray.position.copy(a.origin);
				ray.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), a.dir);
				const len = hit ? hit.distance : 2.5;
				ray.userData.line.scale.y = len;
				ray.userData.line.position.z = -len / 2;
				ray.userData.dot.position.z = -len;
				ray.userData.dot.visible = !!hit;
			}
			if (!hit) continue;
			const panel = hit.object.userData.panel;
			const region = panel.regionAt(hit.uv);
			if (region) {
				hovered.set(panel, region.id);
				if (a.pressed) {
					clicks.push(region);
					a.src?.gamepad?.hapticActuators?.[0]?.pulse?.(0.3, 30);
				}
			}
		}
		for (const t of targets) t.userData.panel.setHover(hovered.get(t.userData.panel) ?? null);
		this.renderer.domElement.style.cursor = !xr && hovered.size ? 'pointer' : 'default';
		for (const r of clicks.slice(0, 1)) r.onClick?.();
		return { scroll, recentre };
	}
}
