// Release works the Kiln: a brick foundry with a domed kiln, a chimney, a heat
// gauge and shelves of finished ware. Working: the kiln heats, its door
// glows, embers lift from the chimney and the gauge climbs. Complete: the
// door swings open and a fired vase rolls out on a cart and gleams, or, if
// the release failed, it cracks in two and smokes.

import * as THREE from "three/webgpu";
import type { PublicEvent } from "../../shared/public";
import { Office, Particles, box, canvasTex, clamp01, cyl, ease, failed, glow, mat, particleMat, rng, type OfficeOptions } from "./kit";

function vaseGeometry(): THREE.LatheGeometry {
  const pts = [[0, 0], [0.28, 0], [0.34, 0.1], [0.42, 0.35], [0.38, 0.6], [0.2, 0.8], [0.16, 0.95], [0.22, 1.02], [0.2, 1.04]];
  return new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), 32);
}

export class ReleaseOffice extends Office {
  camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  private heat = 0.1;
  private mouth: THREE.MeshStandardMaterial;
  private inner: THREE.PointLight;
  private door: THREE.Group;
  private embers: Particles;
  private smoke: Particles;
  private needle: THREE.Mesh;
  private cart: THREE.Group;
  private vase: THREE.Group;
  private halves: THREE.Mesh[];
  private vaseMat: THREE.MeshStandardMaterial;
  private fireT = 1;
  private cracked = false;
  private r = rng(97);

  constructor(o: OfficeOptions) {
    super(o);
    const s = this.scene;
    const r = this.r;
    s.background = new THREE.Color(0x0c0605);
    this.setEnv("#3a1a10", "#ff7a30", "#100604", 0.5);
    s.fog = new THREE.Fog(0x0c0605, 14, 30);
    s.add(new THREE.HemisphereLight(0xff9a60, 0x1a0a06, 1));
    const work = new THREE.PointLight(0xffc890, 30, 18, 1.4);
    work.position.set(3, 6, 5);
    s.add(work);

    // Brick walls.
    const brick = canvasTex(512, 512);
    brick.ctx.fillStyle = "#2a1410";
    brick.ctx.fillRect(0, 0, 512, 512);
    for (let row = 0; row < 16; row++) for (let c = 0; c < 9; c++) {
      brick.ctx.fillStyle = `hsl(${10 + r() * 10}, ${40 + r() * 15}%, ${16 + r() * 10}%)`;
      brick.ctx.fillRect(c * 60 - (row % 2) * 30 + 2, row * 32 + 2, 56, 28);
    }
    brick.flush();
    brick.tex.wrapS = brick.tex.wrapT = THREE.RepeatWrapping;
    brick.tex.repeat.set(3, 2);
    const brickM = new THREE.MeshStandardMaterial({ map: brick.tex, roughness: 0.95 });
    box(16, 8, 0.4, brickM, 0, 4, -5, s);
    box(0.4, 8, 14, brickM, -7, 4, 0, s);
    const floor = canvasTex(256, 256);
    floor.ctx.fillStyle = "#1e1a18"; floor.ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 2500; i++) { floor.ctx.fillStyle = `rgba(255,${120 + r() * 80},60,${r() * 0.04})`; floor.ctx.fillRect(r() * 256, r() * 256, 2, 2); }
    floor.flush();
    floor.tex.wrapS = floor.tex.wrapT = THREE.RepeatWrapping;
    floor.tex.repeat.set(4, 4);
    box(16, 0.2, 14, new THREE.MeshStandardMaterial({ map: floor.tex, roughness: 0.8 }), 0, -0.1, 0, s);

    // The kiln: a brick dome on a drum, with an arched mouth and an iron door.
    const kiln = new THREE.Group();
    kiln.position.set(-1.2, 0, -2);
    s.add(kiln);
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.4, 2.2, 32, 1, true), brickM);
    drum.position.y = 1.1;
    kiln.add(drum);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(2.2, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), brickM);
    dome.position.y = 2.2;
    kiln.add(dome);
    for (const y of [0.6, 1.6]) { const band = new THREE.Mesh(new THREE.TorusGeometry(2.32, 0.06, 8, 48), mat(0x2a2a2c, { metal: 0.9, rough: 0.4 })); band.rotation.x = Math.PI / 2; band.position.y = y; kiln.add(band); }
    // Chimney.
    cyl(0.4, 0.5, 4, brickM, 0.6, 5, -1.2, kiln);
    cyl(0.55, 0.55, 0.25, mat(0x2a2a2c, { metal: 0.8 }), 0.6, 7, -1.2, kiln);
    // Mouth: glowing interior visible through an arch on the front.
    this.mouth = glow(0xff5a10, 1);
    const mouthShape = new THREE.Shape();
    mouthShape.moveTo(-0.7, 0); mouthShape.lineTo(-0.7, 0.9); mouthShape.absarc(0, 0.9, 0.7, Math.PI, 0, true); mouthShape.lineTo(0.7, 0); mouthShape.lineTo(-0.7, 0);
    const mouthMesh = new THREE.Mesh(new THREE.ShapeGeometry(mouthShape, 24), this.mouth);
    mouthMesh.position.set(0, 0.25, 2.42);
    kiln.add(mouthMesh);
    this.inner = new THREE.PointLight(0xff6a1a, 20, 12, 1.4);
    this.inner.position.set(0, 1, 3.2);
    kiln.add(this.inner);
    // The door, hinged on its left edge.
    this.door = new THREE.Group();
    this.door.position.set(-0.75, 0.25, 2.5);
    kiln.add(this.door);
    const doorMesh = new THREE.Mesh(new THREE.ExtrudeGeometry(mouthShape, { depth: 0.08, bevelEnabled: false }), mat(0x1a1a1c, { metal: 0.85, rough: 0.45 }));
    doorMesh.position.x = 0.75;
    this.door.add(doorMesh);
    box(0.5, 0.08, 0.1, mat(0x8a8a8c, { metal: 0.9 }), 1.2, 0.8, 0.12, this.door);
    const peep = new THREE.Mesh(new THREE.CircleGeometry(0.1, 16), glow(0xff8a30, 2));
    peep.position.set(0.75, 1.1, 0.09);
    this.door.add(peep);

    // Gauge on a post.
    const face = canvasTex(256, 256);
    face.ctx.fillStyle = "#e8e0cc"; face.ctx.beginPath(); face.ctx.arc(128, 128, 124, 0, Math.PI * 2); face.ctx.fill();
    face.ctx.lineWidth = 14;
    for (const [a0, a1, c] of [[0.75, 1.5, "#3a8a3a"], [1.5, 2, "#d0a020"], [2, 2.25, "#c02020"]] as const) { face.ctx.strokeStyle = c; face.ctx.beginPath(); face.ctx.arc(128, 128, 96, Math.PI * a0, Math.PI * a1); face.ctx.stroke(); }
    face.ctx.fillStyle = "#222"; face.ctx.font = "bold 28px monospace"; face.ctx.textAlign = "center"; face.ctx.fillText("°C ×100", 128, 190);
    face.flush();
    const gauge = new THREE.Group();
    gauge.position.set(2.2, 2.2, 0.6);
    gauge.rotation.y = -0.5;
    s.add(gauge);
    box(0.12, 2.2, 0.12, mat(0x2a2a2c, { metal: 0.8 }), 0, -1.1, -0.1, gauge);
    gauge.add(new THREE.Mesh(new THREE.CircleGeometry(0.45, 32), new THREE.MeshStandardMaterial({ map: face.tex, roughness: 0.5 })));
    const bez = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.05, 8, 32), mat(0xb08840, { metal: 0.9, rough: 0.3 }));
    gauge.add(bez);
    this.needle = box(0.03, 0.36, 0.02, mat(0x101010), 0, 0, 0.02, gauge);
    this.needle.geometry.translate(0, 0.15, 0);

    // Shelves of finished ware on the left wall.
    const vg = vaseGeometry();
    const glazes = [0x2a6a8a, 0xd8d0c0, 0x8a2a1a, 0x3a5a3a, 0xc89a48, 0x1a1a3a];
    for (let row = 0; row < 3; row++) {
      box(0.8, 0.08, 6, mat(0x3a2414, { rough: 0.7 }), -6.4, 1 + row * 1.4, 0.5, s);
      for (let i = 0; i < 6; i++) {
        const v = new THREE.Mesh(vg, mat(glazes[(i + row) % glazes.length], { rough: 0.25, metal: 0.1 }));
        v.position.set(-6.4, 1.04 + row * 1.4, -2 + i * 0.95);
        v.scale.setScalar(0.5 + r() * 0.35);
        s.add(v);
      }
    }
    // Tongs and a bucket by the kiln.
    cyl(0.35, 0.3, 0.6, mat(0x4a4a4c, { metal: 0.8, rough: 0.5 }), 1.8, 0.3, 2.2, s);
    for (const dz of [-0.05, 0.05]) { const tong = box(0.04, 1.6, 0.04, mat(0x2a2a2c, { metal: 0.9 }), 1.6, 0.9, 2.2 + dz, s); tong.rotation.z = 0.25; }

    // The cart and the piece being fired.
    this.cart = new THREE.Group();
    s.add(this.cart);
    box(1.1, 0.08, 0.9, mat(0x3a3a3c, { metal: 0.8, rough: 0.4 }), 0, 0.35, 0, this.cart);
    for (const [x, z] of [[-0.45, -0.35], [0.45, -0.35], [-0.45, 0.35], [0.45, 0.35]]) cyl(0.1, 0.1, 0.06, mat(0x111111), x, 0.12, z, this.cart).rotation.x = Math.PI / 2;
    for (const [x, z] of [[-0.45, -0.35], [0.45, -0.35], [-0.45, 0.35], [0.45, 0.35]]) box(0.04, 0.22, 0.04, mat(0x3a3a3c), x, 0.24, z, this.cart);
    this.vaseMat = mat(0x8a3a1a, { rough: 0.3, metal: 0.2, emissive: 0xff5010, ei: 0 });
    this.vase = new THREE.Group();
    this.vase.position.y = 0.4;
    this.cart.add(this.vase);
    const whole = new THREE.Mesh(vg, this.vaseMat);
    whole.scale.setScalar(0.9);
    this.vase.add(whole);
    this.halves = [0, 1].map((i) => {
      const h = new THREE.Mesh(new THREE.LatheGeometry(vg.parameters.points, 16, i * Math.PI, Math.PI), this.vaseMat);
      h.scale.setScalar(0.9);
      h.visible = false;
      this.vase.add(h);
      return h;
    });
    this.cart.position.set(-1.2, 0, 0.2);
    this.cart.visible = false;

    this.embers = new Particles(s, 300, new THREE.SphereGeometry(1, 6, 4), particleMat(), 1.2, 0.6);
    this.smoke = new Particles(s, 160, new THREE.SphereGeometry(1, 8, 6), new THREE.MeshBasicMaterial({ color: 0x5a5a5a, transparent: true, opacity: 0.35 }), 0.6, 0.8);

    this.camera.position.set(3.4, 3.8, 8.2);
    this.camera.lookAt(-1, 2.3, -1.5);
  }

  protected tick(dt: number, t: number): void {
    const b = this.busy;
    this.heat += ((0.1 + b * 0.9) - this.heat) * dt * 0.7;
    const flicker = this.opts.reduced ? 1 : 0.9 + Math.sin(t * 13) * 0.05 + Math.sin(t * 29) * 0.05;
    this.mouth.emissiveIntensity = (0.35 + this.heat * 1.6) * flicker;
    this.mouth.emissive.setRGB(1, 0.16 + this.heat * 0.2, 0.02);
    this.inner.intensity = (6 + this.heat * 60) * flicker;
    this.needle.rotation.z = 2.3 - this.heat * 3.8 - (b > 0.5 ? Math.sin(t * 9) * 0.03 : 0);
    if (Math.random() < this.heat * (this.opts.reduced ? 0.2 : 1.2)) {
      const p = new THREE.Vector3(-0.6 + (Math.random() - 0.5) * 0.5, 7.2, -3.2 + (Math.random() - 0.5) * 0.5);
      this.embers.spawn(p, new THREE.Vector3((Math.random() - 0.5) * 0.8, 1.5 + Math.random(), (Math.random() - 0.5) * 0.8), 2 + Math.random() * 2, 0.03, Math.random() < 0.5 ? 0xff6a1a : 0xffc060);
    }
    this.embers.update(dt);
    this.smoke.update(dt);

    if (this.fireT < 1) {
      this.fireT = Math.min(1, this.fireT + dt / 5);
      const k = this.fireT;
      // Door opens (0–0.25), cart rolls out (0.2–0.55), piece glows then cools, or cracks.
      const open = k < 0.85 ? ease.out(clamp01(k / 0.25)) : 1 - ease.inOut((k - 0.85) / 0.15);
      this.door.rotation.y = -open * 1.9;
      this.cart.visible = true;
      const roll = ease.inOut(clamp01((k - 0.2) / 0.35));
      this.cart.position.set(-1.2 + roll * 0.9, 0, 0.4 + roll * 1.5);
      const cool = clamp01((k - 0.45) / 0.5);
      this.vaseMat.emissiveIntensity = (1 - cool) * 2.5;
      if (!this.cracked) {
        this.vaseMat.color.setHex(0x8a3a1a).lerp(new THREE.Color(0x2a7ab0), cool);
        this.vaseMat.metalness = 0.2 + cool * 0.5;
        this.vase.rotation.y += dt * (0.5 + cool);
      } else if (k > 0.55) {
        const split = ease.out(clamp01((k - 0.55) / 0.2));
        this.halves[0].position.x = -split * 0.12; this.halves[0].rotation.z = split * 0.35;
        this.halves[1].position.x = split * 0.12; this.halves[1].rotation.z = -split * 0.35;
        this.halves.forEach((h) => (h.visible = true));
        (this.vase.children[0] as THREE.Mesh).visible = false;
        if (Math.random() < 0.5) this.smoke.spawn(this.cart.position.clone().add(new THREE.Vector3(0, 1.2, 0)), new THREE.Vector3((Math.random() - 0.5) * 0.3, 0.8, (Math.random() - 0.5) * 0.3), 2.5, 0.18, 0x5a5a5a);
      }
      if (k >= 1) this.cart.visible = false;
    }
  }

  protected celebrate(e: PublicEvent | null): void {
    this.cracked = failed(e);
    this.halves.forEach((h) => { h.visible = false; h.position.x = 0; h.rotation.z = 0; });
    (this.vase.children[0] as THREE.Mesh).visible = true;
    this.vaseMat.color.setHex(0x8a3a1a);
    this.fireT = 0;
  }
}
