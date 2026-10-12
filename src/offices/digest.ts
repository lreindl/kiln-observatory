// The Approval digest's mail room: brass pneumatic tubes snake across the walls
// into a wall of pigeonholes; a sorting desk sits under a green lamp. Working:
// canisters race through the tubes and envelopes shuffle in their cubbies.
// Complete: an envelope is sealed with red wax and shot up the riser to the owner.

import * as THREE from "three/webgpu";
import type { PublicEvent } from "../../shared/public";
import { Office, Particles, box, canvasTex, clamp01, cyl, ease, mat, particleMat, rng, sphere, type OfficeOptions } from "./kit";

export class DigestOffice extends Office {
  camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  private tubes: THREE.CatmullRomCurve3[] = [];
  private canisters: { mesh: THREE.Mesh; tube: number; u: number; speed: number }[] = [];
  private cubbyLetters: THREE.Mesh[] = [];
  private envelope: THREE.Group;
  private seal: THREE.Mesh;
  private envT = 1;
  private riser: THREE.CatmullRomCurve3;
  private puff: Particles;
  private gauge: THREE.Mesh;
  private r = rng(59);

  constructor(o: OfficeOptions) {
    super(o);
    const s = this.scene;
    const r = this.r;
    s.background = new THREE.Color(0x140d07);
    this.setEnv("#ffd9a0", "#7a5a30", "#1a1006", 0.7);
    s.fog = new THREE.Fog(0x140d07, 14, 28);
    s.add(new THREE.HemisphereLight(0xffcf90, 0x1a0e04, 0.7));
    const warm = new THREE.PointLight(0xffb060, 30, 14, 1.4);
    warm.position.set(1, 5, 3);
    s.add(warm);

    // Tiled floor, green-painted lower walls, cream upper walls.
    const tiles = canvasTex(128, 128);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { tiles.ctx.fillStyle = (x + y) % 2 ? "#2a1a10" : "#c8b48a"; tiles.ctx.fillRect(x * 32, y * 32, 32, 32); }
    tiles.flush();
    tiles.tex.wrapS = tiles.tex.wrapT = THREE.RepeatWrapping;
    tiles.tex.repeat.set(5, 5);
    box(16, 0.2, 12, new THREE.MeshStandardMaterial({ map: tiles.tex, roughness: 0.35 }), 0, -0.1, 0, s);
    box(16, 2.2, 0.3, mat(0x1f3a2a, { rough: 0.6 }), 0, 1.1, -5, s);
    box(16, 5, 0.3, mat(0xb8a682, { rough: 0.9 }), 0, 4.7, -5, s);
    box(0.3, 2.2, 12, mat(0x1f3a2a, { rough: 0.6 }), -7, 1.1, 0, s);
    box(0.3, 5, 12, mat(0xb8a682, { rough: 0.9 }), -7, 4.7, 0, s);
    box(16, 0.1, 0.36, mat(0x7a5a2a, { metal: 0.7, rough: 0.35 }), 0, 2.2, -4.85, s);

    // Pigeonholes: a wooden grid with letters in some cubbies.
    const wood = mat(0x4a2c16, { rough: 0.6 });
    const px = -2.4;
    for (let c = 0; c <= 8; c++) box(0.05, 3.2, 0.6, wood, px + c * 0.5, 3.1, -4.55, s);
    for (let row = 0; row <= 6; row++) box(4.05, 0.05, 0.6, wood, px + 2, 1.5 + row * 0.53, -4.55, s);
    const paper = [0xf0e6d0, 0xe8d8b0, 0xd8e0f0, 0xf4d8d0];
    for (let c = 0; c < 8; c++) for (let row = 0; row < 6; row++) {
      if (r() < 0.55) {
        const l = box(0.4, 0.28, 0.03, mat(paper[Math.floor(r() * 4)], { rough: 0.9 }), px + 0.25 + c * 0.5, 1.68 + row * 0.53, -4.4, s);
        l.rotation.x = -0.3;
        l.rotation.z = (r() - 0.5) * 0.2;
        this.cubbyLetters.push(l);
      }
    }

    // Brass tubes.
    const brass = mat(0xc89a48, { metal: 0.95, rough: 0.28 });
    const routes: number[][][] = [
      [[-7, 6, 2], [-6.6, 6, 2], [-6.6, 4.5, 0], [-6.6, 4.5, -3], [-4, 5.6, -4.6], [-2.6, 5.4, -4.6], [-2.6, 4.9, -4.3]],
      [[8, 3.5, -4.6], [5, 3.5, -4.6], [3.5, 5, -4.6], [2, 5.2, -4.5], [1.7, 4.9, -4.3]],
      [[8, 6.6, -2], [4, 6.6, -3.5], [0, 6.4, -4.5], [-3, 6.5, -4.6], [-7, 6.5, -4.6]],
    ];
    for (const pts of routes) {
      const curve = new THREE.CatmullRomCurve3(pts.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
      this.tubes.push(curve);
      s.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 80, 0.16, 12), mat(0xbfe0e0, { transparent: true, opacity: 0.22, rough: 0.05, metal: 0.2 })));
      for (let k = 0; k <= 8; k++) {
        const p = curve.getPointAt(k / 8);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.04, 8, 20), brass);
        ring.position.copy(p);
        ring.lookAt(p.clone().add(curve.getTangentAt(k / 8)));
        s.add(ring);
      }
    }
    // The riser: from the desk up through the ceiling, toward the owner.
    this.riser = new THREE.CatmullRomCurve3([new THREE.Vector3(2.6, 1.6, 0.4), new THREE.Vector3(2.6, 3, 0.2), new THREE.Vector3(2.9, 6, -0.6), new THREE.Vector3(3.2, 9, -1.2)]);
    s.add(new THREE.Mesh(new THREE.TubeGeometry(this.riser, 60, 0.26, 14), mat(0xbfe0e0, { transparent: true, opacity: 0.18, rough: 0.05 })));
    cyl(0.42, 0.3, 0.5, brass, 2.6, 1.55, 0.4, s); // intake funnel
    for (const k of [0.3, 0.55, 0.8]) {
      const p = this.riser.getPointAt(k);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.29, 0.05, 8, 20), brass);
      ring.position.copy(p);
      ring.lookAt(p.clone().add(this.riser.getTangentAt(k)));
      s.add(ring);
    }
    // Pressure gauge.
    const gaugeFace = canvasTex(128, 128);
    gaugeFace.ctx.fillStyle = "#f2ead6";
    gaugeFace.ctx.beginPath(); gaugeFace.ctx.arc(64, 64, 62, 0, Math.PI * 2); gaugeFace.ctx.fill();
    gaugeFace.ctx.strokeStyle = "#2a1a0a";
    for (let i = 0; i <= 10; i++) { const a = Math.PI * 0.75 + (i / 10) * Math.PI * 1.5; gaugeFace.ctx.beginPath(); gaugeFace.ctx.moveTo(64 + Math.cos(a) * 46, 64 + Math.sin(a) * 46); gaugeFace.ctx.lineTo(64 + Math.cos(a) * 56, 64 + Math.sin(a) * 56); gaugeFace.ctx.stroke(); }
    gaugeFace.flush();
    const gf = new THREE.Mesh(new THREE.CircleGeometry(0.35, 32), new THREE.MeshStandardMaterial({ map: gaugeFace.tex, roughness: 0.5 }));
    gf.position.set(4.2, 3.2, -4.8);
    s.add(gf);
    const bezel = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.04, 8, 32), brass);
    bezel.position.copy(gf.position);
    s.add(bezel);
    this.gauge = box(0.02, 0.28, 0.01, mat(0x9a1010), 4.2, 3.2, -4.78, s);
    this.gauge.geometry.translate(0, 0.12, 0);

    // Canisters.
    for (let i = 0; i < 7; i++) {
      const c = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.3, 4, 10), brass);
      s.add(c);
      this.canisters.push({ mesh: c, tube: i % 3, u: r(), speed: 0.25 + r() * 0.2 });
    }

    // Sorting desk with a green lamp and a stack of mail.
    box(3.6, 0.12, 1.6, wood, 1.2, 1.3, 0.6, s);
    for (const [x, z] of [[-0.5, 0], [2.9, 0], [-0.5, 1.3], [2.9, 1.3]]) box(0.1, 1.25, 0.1, wood, x, 0.63, z, s);
    for (let i = 0; i < 6; i++) box(0.5, 0.03, 0.34, mat(paper[i % 4], { rough: 0.9 }), -0.1, 1.38 + i * 0.03, 0.8, s).rotation.y = (r() - 0.5) * 0.3;
    cyl(0.12, 0.15, 0.05, brass, 0.8, 1.38, 0.2, s);
    cyl(0.02, 0.02, 0.5, brass, 0.8, 1.62, 0.2, s);
    cyl(0.08, 0.3, 0.16, mat(0x0c4a20, { emissive: 0x40ff80, ei: 0.4 }), 0.8, 1.9, 0.3, s).rotation.x = 0.3;
    const lamp = new THREE.PointLight(0xfff0c0, 4, 5, 1.5);
    lamp.position.set(0.8, 1.75, 0.5);
    s.add(lamp);

    // The envelope that gets sealed and sent.
    this.envelope = new THREE.Group();
    box(0.6, 0.02, 0.4, mat(0xf6eedc, { rough: 0.85 }), 0, 0, 0, this.envelope);
    const flap = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.2, 3), mat(0xeadfc6, { rough: 0.85 }));
    flap.rotation.set(Math.PI / 2, 0, Math.PI);
    flap.scale.set(1, 0.05, 1);
    flap.position.set(0, 0.015, -0.05);
    this.envelope.add(flap);
    this.seal = cyl(0.07, 0.07, 0.03, mat(0xa0101c, { rough: 0.4, emissive: 0xff2030, ei: 0.3 }), 0, 0.03, 0.02, this.envelope);
    this.seal.visible = false;
    this.envelope.position.set(1.5, 1.37, 0.7);
    this.envelope.scale.setScalar(1.7);
    this.envelope.visible = false;
    s.add(this.envelope);
    this.puff = new Particles(s, 120, new THREE.SphereGeometry(1, 6, 4), particleMat(), 0.4, 1.5);

    this.camera.position.set(6.2, 3.8, 6.6);
    this.camera.lookAt(-0.2, 3, -2.4);
  }

  protected tick(dt: number, t: number): void {
    const b = this.busy;
    for (const c of this.canisters) {
      c.u = (c.u + dt * c.speed * (0.15 + b * 2.2)) % 1;
      const curve = this.tubes[c.tube];
      c.mesh.position.copy(curve.getPointAt(c.u));
      c.mesh.lookAt(c.mesh.position.clone().add(curve.getTangentAt(c.u)));
      c.mesh.rotateX(Math.PI / 2);
    }
    this.cubbyLetters.forEach((l, i) => { l.position.z = -4.4 + (b > 0.5 ? Math.max(0, Math.sin(t * 5 + i * 1.3)) * 0.12 : 0); });
    this.gauge.rotation.z = 1.2 - b * 1.9 - (b > 0.5 ? Math.sin(t * 13) * 0.05 : 0) - (this.envT < 1 ? 0.6 : 0);
    if (this.envT < 1) {
      this.envT = Math.min(1, this.envT + dt / 3.2);
      const k = this.envT;
      this.envelope.visible = true;
      if (k < 0.35) {
        // Seal presses down.
        this.envelope.position.set(1.5, 1.37, 0.7);
        this.envelope.rotation.set(0, 0, 0);
        this.seal.visible = k > 0.18;
        this.seal.scale.setScalar(k > 0.18 ? ease.back(clamp01((k - 0.18) / 0.12)) : 0.01);
      } else if (k < 0.5) {
        const f = ease.inOut((k - 0.35) / 0.15);
        this.envelope.position.lerpVectors(new THREE.Vector3(1.5, 1.37, 0.7), this.riser.getPointAt(0), f);
        this.envelope.rotation.x = -f * 1.4;
      } else {
        const f = ease.out((k - 0.5) / 0.5);
        this.envelope.position.copy(this.riser.getPointAt(f));
        this.envelope.rotation.set(-1.4, f * 8, 0);
        if (!this.opts.reduced) this.puff.spawn(this.envelope.position, new THREE.Vector3((Math.random() - 0.5) * 0.6, -0.5, (Math.random() - 0.5) * 0.6), 0.7, 0.05, 0xffe0a0);
      }
      if (k >= 1) this.envelope.visible = false;
    }
    this.puff.update(dt);
  }

  protected celebrate(_e: PublicEvent | null): void {
    this.envT = 0;
    this.seal.visible = false;
  }
}


