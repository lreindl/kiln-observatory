// Growth works from a rooftop at dusk: gravel, a water tower, a neon arrow,
// and a tri-vision billboard over the street. Working: the billboard's prisms
// turn in a wave to the next ad and the spotlights sweep. Complete: fireworks.

import * as THREE from "three/webgpu";
import type { PublicEvent } from "../../shared/public";
import { Office, Particles, box, canvasTex, clamp01, cyl, ease, glow, mat, particleMat, rng, sphere, type OfficeOptions } from "./kit";

const ADS = [
  { bg: ["#ff3d7f", "#ffb347"], text: "PLAY", sub: "DAILY GOLF" },
  { bg: ["#2a1bff", "#00e0ff"], text: "★★★★★", sub: "HOLE IN ONE" },
  { bg: ["#0f2027", "#2c5364"], text: "NEW", sub: "COURSE TODAY" },
];
const PRISMS = 10;

export class GrowthOffice extends Office {
  camera = new THREE.PerspectiveCamera(46, 1, 0.1, 300);
  private prisms: THREE.Group[] = [];
  private fromA = 0;
  private toA = 0;
  private turnT = 1;
  private fireworks: Particles;
  private shells: { pos: THREE.Vector3; vel: THREE.Vector3; color: number; fuse: number; at: number }[] = [];
  private spots: THREE.SpotLight[] = [];
  private arrow: THREE.MeshStandardMaterial;
  private r = rng(31);

  constructor(o: OfficeOptions) {
    super(o);
    const s = this.scene;
    const r = this.r;
    // Dusk sky on a big backdrop.
    const sky = canvasTex(512, 512);
    const g = sky.ctx.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0, "#120a2e"); g.addColorStop(0.45, "#5a2a6e"); g.addColorStop(0.75, "#e0607a"); g.addColorStop(1, "#ffb067");
    sky.ctx.fillStyle = g;
    sky.ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 80; i++) { sky.ctx.fillStyle = `rgba(255,255,255,${r() * 0.7})`; sky.ctx.fillRect(r() * 512, r() * 200, 1.5, 1.5); }
    sky.flush();
    s.background = sky.tex;
    this.setEnv("#5a2a6e", "#ffb067", "#2a1a2a", 0.8);
    s.fog = new THREE.Fog(0x8a4a7a, 40, 140);
    s.add(new THREE.HemisphereLight(0xff9ab0, 0x221030, 1.1));
    const sun = new THREE.DirectionalLight(0xffa060, 1.6);
    sun.position.set(-20, 6, -30);
    s.add(sun);
    sphere(5, glow(0xffc070, 2.5), -40, 4, -110, s);

    // Distant skyline silhouettes with a few lit windows.
    const silhouette = mat(0x1a0f2a, { rough: 0.9 });
    for (let i = 0; i < 40; i++) {
      const h = 6 + r() * 30;
      const x = -80 + r() * 160;
      box(3 + r() * 6, h, 4, silhouette, x, h / 2 - 12, -50 - r() * 40, s);
      if (r() < 0.5) box(0.6, 0.6, 0.1, glow(0xffd28a, 2), x, h - 14 - r() * 6, -47.9, s);
    }

    // Roof: gravel, parapet, AC units, water tower.
    const gravel = canvasTex(256, 256);
    gravel.ctx.fillStyle = "#4a4048";
    gravel.ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 3000; i++) { gravel.ctx.fillStyle = `hsl(300, 6%, ${20 + r() * 30}%)`; gravel.ctx.fillRect(r() * 256, r() * 256, 2, 2); }
    gravel.flush();
    gravel.tex.wrapS = gravel.tex.wrapT = THREE.RepeatWrapping;
    gravel.tex.repeat.set(4, 4);
    box(24, 0.4, 18, new THREE.MeshStandardMaterial({ map: gravel.tex, roughness: 1 }), 0, -0.2, 0, s);
    const parapet = mat(0x5a4650, { rough: 0.9 });
    box(24, 0.9, 0.4, parapet, 0, 0.45, -9, s);
    box(0.4, 0.9, 18, parapet, -12, 0.45, 0, s);
    for (const [x, z] of [[-7, 4], [-4.5, 5]]) {
      box(2, 1.2, 1.4, mat(0x9a9aa6, { metal: 0.6, rough: 0.4 }), x, 0.6, z, s);
      cyl(0.5, 0.5, 0.1, mat(0x333338, { metal: 0.8 }), x, 1.25, z, s);
    }
    const tower = new THREE.Group();
    tower.position.set(-8, 0, -4);
    s.add(tower);
    for (const [x, z] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) box(0.12, 4, 0.12, mat(0x2a1e1a), x, 2, z, tower);
    cyl(1.4, 1.4, 2.6, mat(0x6a4a34, { rough: 0.85 }), 0, 5.3, 0, tower);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.5, 1, 24), mat(0x3a2a22));
    roof.position.y = 7.1;
    tower.add(roof);
    // Neon arrow pointing up.
    this.arrow = glow(0xff3d9a, 2.5);
    const arrowShape = new THREE.Shape([new THREE.Vector2(0, 1.4), new THREE.Vector2(0.8, 0.4), new THREE.Vector2(0.3, 0.4), new THREE.Vector2(0.3, -1), new THREE.Vector2(-0.3, -1), new THREE.Vector2(-0.3, 0.4), new THREE.Vector2(-0.8, 0.4)]);
    const arrowMesh = new THREE.Mesh(new THREE.ExtrudeGeometry(arrowShape, { depth: 0.12, bevelEnabled: false }), this.arrow);
    arrowMesh.position.set(9.2, 3.2, -6);
    arrowMesh.rotation.y = -0.4;
    s.add(arrowMesh);
    box(0.1, 2.5, 0.1, mat(0x222222), 9.2, 1.2, -6.1, s);

    // The billboard: steel frame, catwalk, and the prisms.
    const steel = mat(0x2a2a30, { metal: 0.8, rough: 0.4 });
    const bb = new THREE.Group();
    bb.position.set(2.2, 0, -6);
    bb.rotation.y = -0.15;
    s.add(bb);
    for (const x of [-4, 4]) box(0.3, 5, 0.3, steel, x, 2.5, 0.4, bb);
    box(9.6, 0.2, 1.2, steel, 0, 4.7, 0.9, bb);
    box(9.6, 0.05, 0.05, steel, 0, 5.6, 1.45, bb);
    box(9.4, 0.3, 0.6, steel, 0, 5.1, 0, bb);
    box(9.4, 0.3, 0.6, steel, 0, 9.3, 0, bb);
    const adTex = ADS.map((ad) => this.adTexture(ad));
    const pw = 9 / PRISMS;
    const fh = 4;
    const apothem = pw / (2 * Math.tan(Math.PI / 3));
    for (let i = 0; i < PRISMS; i++) {
      const prism = new THREE.Group();
      prism.position.set(-4.5 + pw * (i + 0.5), 7.2, 0);
      bb.add(prism);
      for (let f = 0; f < 3; f++) {
        const tex = adTex[f].clone();
        tex.repeat.set(1 / PRISMS, 1);
        tex.offset.set(i / PRISMS, 0);
        tex.needsUpdate = true;
        const face = new THREE.Mesh(new THREE.PlaneGeometry(pw * 0.99, fh), new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.55, roughness: 0.6 }));
        const a = (f * Math.PI * 2) / 3;
        face.position.set(0, 0, apothem);
        const holder = new THREE.Group();
        holder.rotation.y = a;
        holder.add(face);
        prism.add(holder);
      }
      this.prisms.push(prism);
    }
    for (const x of [-3, 0, 3]) {
      const sp = new THREE.SpotLight(0xfff0d0, 0, 14, 0.4, 0.6, 1);
      sp.position.set(x, 4.9, 1.6);
      sp.target.position.set(x, 7.2, 0);
      bb.add(sp, sp.target);
      cyl(0.12, 0.2, 0.3, mat(0x111111, { metal: 0.8 }), x, 4.95, 1.5, bb);
      this.spots.push(sp);
    }

    this.fireworks = new Particles(s, 600, new THREE.SphereGeometry(1, 6, 4), particleMat(), -2.2, 0.9);
    this.camera.position.set(4.5, 2.6, 9.5);
    this.camera.lookAt(0.5, 5, -6);
  }

  private adTexture(ad: (typeof ADS)[number]): THREE.CanvasTexture {
    const c = canvasTex(1024, 450);
    const g = c.ctx.createLinearGradient(0, 0, 1024, 450);
    g.addColorStop(0, ad.bg[0]); g.addColorStop(1, ad.bg[1]);
    c.ctx.fillStyle = g;
    c.ctx.fillRect(0, 0, 1024, 450);
    c.ctx.fillStyle = "rgba(255,255,255,.12)";
    for (let i = 0; i < 6; i++) { c.ctx.beginPath(); c.ctx.arc(100 + i * 180, 380, 90, 0, Math.PI * 2); c.ctx.fill(); }
    c.ctx.fillStyle = "#fff";
    c.ctx.textAlign = "center";
    c.ctx.font = "bold 190px sans-serif";
    c.ctx.fillText(ad.text, 512, 230);
    c.ctx.font = "bold 64px monospace";
    c.ctx.fillText(ad.sub, 512, 340);
    c.flush();
    return c.tex;
  }

  protected tick(dt: number, t: number): void {
    const b = this.busy;
    // While working, turn to the next ad every few seconds.
    if (b > 0.5 && this.turnT >= 1 && Math.sin(t * 0.9) > 0.98) this.turn();
    if (this.turnT < 1) this.turnT = Math.min(1, this.turnT + dt / 2.4);
    for (const [i, p] of this.prisms.entries()) {
      const k = this.turnT >= 1 ? 1 : ease.back(clamp01(this.turnT * 1.8 - i * 0.08));
      p.rotation.y = -(this.fromA + (this.toA - this.fromA) * k);
    }
    for (const [i, sp] of this.spots.entries()) {
      sp.intensity = 6 + b * 40;
      sp.target.position.x = (i - 1) * 3 + (this.opts.reduced ? 0 : Math.sin(t * 1.2 + i * 2) * 2 * b);
    }
    this.arrow.emissiveIntensity = Math.sin(t * 7) > -0.85 || b > 0.5 ? 2.5 : 0.3;
    for (const sh of [...this.shells]) {
      if (t < sh.at) continue;
      sh.vel.y -= 6 * dt;
      sh.pos.addScaledVector(sh.vel, dt);
      this.fireworks.spawn(sh.pos, new THREE.Vector3(0, -0.5, 0), 0.4, 0.07, 0xffe0b0);
      if ((sh.fuse -= dt) <= 0) {
        this.shells.splice(this.shells.indexOf(sh), 1);
        for (let i = 0; i < 90; i++) {
          const v = new THREE.Vector3().randomDirection().multiplyScalar(6 + Math.random() * 3);
          this.fireworks.spawn(sh.pos, v, 1.6 + Math.random() * 0.8, 0.17, sh.color);
        }
      }
    }
    this.fireworks.update(dt);
  }

  protected celebrate(_e: PublicEvent | null): void {
    const colors = [0xff3d9a, 0xffd166, 0x3fd0ff, 0x9dff6a];
    const n = this.opts.reduced ? 1 : 4;
    for (let i = 0; i < n; i++) {
      this.shells.push({
        pos: new THREE.Vector3(-14 + this.r() * 28, 2, -20 - this.r() * 10),
        vel: new THREE.Vector3((this.r() - 0.5) * 2, 15 + this.r() * 4, 0),
        color: colors[i % colors.length], fuse: 1.3 + this.r() * 0.4, at: this.t + i * 0.45,
      });
    }
    this.turn();
  }

  /** Each prism turns a third of a revolution, left to right, to show the next ad. */
  private turn(): void {
    this.fromA = this.toA;
    this.toA += (Math.PI * 2) / 3;
    this.turnT = 0;
  }
}
