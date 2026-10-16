// The 3D screen: plays a packed video (picture on top, depth below, white = near; made by tools/depth3d.py) on a
// finely divided mesh. Every point is pushed back along the line from the seat (the origin) by its depth, so from
// the seat the picture lines up with the frame exactly, nearest things sit at the frame and the rest recede into the
// alcove behind it: a window into the scene, with real parallax when you lean.
import * as THREE from 'three';

export class DepthScreen {
	// centre: Vector3 of the screen's middle; w, h: its size in metres; depth: how far the farthest point goes, as a
	// fraction of its distance from the seat
	constructor(video, centre, w, h, depth = 0.55) {
		this.tex = new THREE.VideoTexture(video); // no colour space: the shader passes the video's colours through
		this.tex.generateMipmaps = false;
		this.tex.minFilter = THREE.LinearFilter;
		this.uniforms = { map: { value: this.tex }, depth: { value: depth } };
		const geo = new THREE.PlaneGeometry(w, h, 256, 160);
		geo.translate(centre.x, centre.y, centre.z);
		const mat = new THREE.ShaderMaterial({
			uniforms: this.uniforms,
			vertexShader: /* glsl */ `
				uniform sampler2D map;
				uniform float depth;
				varying vec2 vUv;
				float zAt(vec2 uv) { return texture2D(map, vec2(uv.x, uv.y * 0.5)).r; }
				void main() {
					vec2 px = vec2(1.0 / 256.0, 1.0 / 160.0);
					float z = (zAt(uv) * 2.0 + zAt(uv + vec2(px.x, 0.0)) + zAt(uv - vec2(px.x, 0.0))
						+ zAt(uv + vec2(0.0, px.y)) + zAt(uv - vec2(0.0, px.y))) / 6.0;
					vec3 p = position * (1.0 + depth * (1.0 - z)); // along the line from the seat
					vUv = vec2(uv.x, 0.5 + uv.y * 0.5);
					gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
				}`,
			fragmentShader: /* glsl */ `
				uniform sampler2D map;
				varying vec2 vUv;
				void main() { gl_FragColor = texture2D(map, vUv); }`
		});
		this.mesh = new THREE.Mesh(geo, mat);
		this.mesh.frustumCulled = false; // positions are made in the shader
	}

	dispose() {
		this.mesh.parent?.remove(this.mesh);
		this.mesh.geometry.dispose();
		this.mesh.material.dispose();
		this.tex.dispose();
	}
}
