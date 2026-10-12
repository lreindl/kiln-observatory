// The Reviewer's study: tatami, shoji, a low desk, a paper lantern, and through
// the open screen a raked-sand garden. Sparse on purpose; the room is for
// reading carefully. Working: a brush writes ink strokes down the scroll.
// Complete: a red seal is pressed, the lantern brightens and a leaf falls.

import * as THREE from "three/webgpu";
import type { PublicEvent } from "../../shared/public";
import { Office, box, canvasTex, clamp01, cyl, ease, glow, mat, rng, sphere, type CanvasTex, type OfficeOptions } from "./kit";

export class ReviewerOffice extends Office {
  camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
  private scroll: CanvasTex;
  private strokes: { x: number; y: number; len: number; drawn: number }[] = [];
  private brush: THREE.Group;
  private lantern: THREE.MeshStandardMaterial;
  private lanternLight: THREE.PointLight;
  private sealT = 1;
  private sealMesh: THREE.Group;
  private leaf: THREE.Mesh;
  private leafT = 1;
  private r = rng(83);

  constructor(o: OfficeOptions) {
    super(o);
    const s = this.scene;
    const r = this.r;
    s.background = new THREE.Color(0xd8cfbf);
    this.setEnv("#fff4e0", "#d8cfbf", "#6a5a40", 0.8);
    s.fog = new THREE.Fog(0xd8cfbf, 16, 34);
    s.add(new THREE.HemisphereLight(0xfff4e0, 0x8a7a60, 1.5));
    const daylight = new THREE.DirectionalLight(0xfff0d8, 1.6);
    daylight.position.set(6, 8, -6);
    s.add(daylight);

    // Tatami mats with dark borders.
    const tatami = canvasTex(256, 512);
    tatami.ctx.fillStyle = "#b8b07a";
    tatami.ctx.fillRect(0, 0, 256, 512);
    for (let y = 0; y < 512; y += 3) { tatami.ctx.fillStyle = `rgba(90,80,40,${0.08 + r() * 0.08})`; tatami.ctx.fillRect(0, y, 256, 1); }
    tatami.ctx.fillStyle = "#2a2a22";
    tatami.ctx.fillRect(0, 0, 10, 512); tatami.ctx.fillRect(246, 0, 10, 512);
    tatami.flush();
    const tm = new THREE.MeshStandardMaterial({ map: tatami.tex, roughness: 0.95 });
    for (let i = 0; i < 4; i++) box(1.8, 0.08, 3.6, tm, -2.7 + i * 1.8, 0, 0, s);
    box(7.2, 0.08, 1.8, tm, 0, 0, -2.7, s).rotation.y = 0;

    // Walls: shoji screens with a dark wood lattice; the right side is open.
    const frame = mat(0x2a1a10, { rough: 0.6 });
    const paper = mat(0xf6efe0, { rough: 0.95, emissive: 0xfff2d8, ei: 0.25 });
    const shoji = (x: number, z: number, ry: number, w: number) => {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      g.rotation.y = ry;
      s.add(g);
      box(w, 3.4, 0.05, paper, 0, 1.75, 0, g);
      for (let k = 0; k <= 4; k++) box(0.05, 3.4, 0.08, frame, -w / 2 + (k * w) / 4, 1.75, 0, g);
      for (let k = 0; k <= 6; k++) box(w, 0.05, 0.08, frame, 0, 0.05 + k * 0.56, 0, g);
    };
    shoji(-1.8, -3.6, 0, 3.6);
    shoji(-3.6, 0, Math.PI / 2, 3.6);
    shoji(-3.6, -1.8 - 1.8, Math.PI / 2, 0.01);
    box(7.4, 0.2, 0.2, frame, 0, 3.5, -3.6, s);
    // Alcove (tokonoma) with a hanging scroll and an ikebana.
    box(1.8, 0.25, 0.9, mat(0x3a2414, { rough: 0.4 }), 1.4, 0.13, -3.1, s);
    box(1.9, 3.5, 0.1, mat(0xe8dcc4, { rough: 0.95 }), 1.4, 1.75, -3.6, s);
    const hang = canvasTex(64, 256);
    hang.ctx.fillStyle = "#efe4cc"; hang.ctx.fillRect(0, 0, 64, 256);
    hang.ctx.strokeStyle = "#1a1410"; hang.ctx.lineWidth = 6; hang.ctx.lineCap = "round";
    hang.ctx.beginPath(); hang.ctx.moveTo(32, 30); hang.ctx.lineTo(28, 120); hang.ctx.moveTo(14, 150); hang.ctx.quadraticCurveTo(32, 140, 50, 160); hang.ctx.moveTo(30, 175); hang.ctx.lineTo(34, 225); hang.ctx.stroke();
    hang.flush();
    const hm = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 1.9), new THREE.MeshStandardMaterial({ map: hang.tex, roughness: 0.95 }));
    hm.position.set(1.4, 2.1, -3.53);
    s.add(hm);
    cyl(0.12, 0.16, 0.3, mat(0x1a1a1a, { rough: 0.3 }), 0.9, 0.4, -3.1, s);
    for (let i = 0; i < 3; i++) { const st = cyl(0.01, 0.01, 0.7, mat(0x3a5a20), 0.9 + (i - 1) * 0.06, 0.8, -3.1, s); st.rotation.z = (i - 1) * 0.25; }
    sphere(0.07, mat(0xd04050), 0.75, 1.15, -3.1, s);

    // The garden beyond the open side: raked sand, three stones, a maple.
    const sand = canvasTex(512, 512);
    sand.ctx.fillStyle = "#e4dccb"; sand.ctx.fillRect(0, 0, 512, 512);
    sand.ctx.strokeStyle = "rgba(120,105,80,.35)"; sand.ctx.lineWidth = 2;
    for (let y = 6; y < 512; y += 12) { sand.ctx.beginPath(); for (let x = 0; x <= 512; x += 8) sand.ctx.lineTo(x, y + Math.sin(x * 0.02 + y * 0.01) * 3); sand.ctx.stroke(); }
    for (const [cx, cy, rr] of [[180, 260, 60], [340, 160, 40]]) for (let k = 1; k < 5; k++) { sand.ctx.beginPath(); sand.ctx.arc(cx, cy, rr + k * 12, 0, Math.PI * 2); sand.ctx.stroke(); }
    sand.flush();
    box(12, 0.1, 12, new THREE.MeshStandardMaterial({ map: sand.tex, roughness: 1 }), 8.6, -0.2, -2, s);
    box(0.3, 0.3, 8, mat(0x4a3420, { rough: 0.7 }), 3.85, -0.05, 0, s); // engawa edge
    for (const [x, z, sc] of [[6.2, -1.2, 0.9], [9.5, -4.2, 0.6], [7.5, 2.2, 0.45]] as const) {
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(sc, 0), mat(0x6a645a, { rough: 0.95, flat: true }));
      rock.position.set(x, sc * 0.35, z);
      rock.scale.y = 0.6;
      rock.rotation.y = r() * 3;
      s.add(rock);
    }
    const trunk = cyl(0.12, 0.2, 2.6, mat(0x3a2418, { rough: 0.9 }), 10, 1.2, 1, s);
    trunk.rotation.z = 0.2;
    for (let i = 0; i < 14; i++) {
      const leafBall = sphere(0.6 + r() * 0.4, mat(r() < 0.5 ? 0xc0301a : 0xd85020, { rough: 0.85 }), 9.6 + (r() - 0.5) * 2.2, 2.6 + r() * 1.2, 1 + (r() - 0.5) * 2, s);
      leafBall.scale.y = 0.7;
    }

    // Low desk, cushion, the review scroll, ink stone, brush.
    box(2.4, 0.08, 1.2, mat(0x2a1a10, { rough: 0.3 }), 0, 0.62, 0.2, s);
    for (const [x, z] of [[-1.1, -0.3], [1.1, -0.3], [-1.1, 0.7], [1.1, 0.7]]) box(0.08, 0.58, 0.08, mat(0x2a1a10), x, 0.3, z, s);
    box(1.1, 0.14, 1.1, mat(0x5a2030, { rough: 0.9 }), 0, 0.1, 1.4, s);
    this.scroll = canvasTex(512, 256);
    this.resetScroll();
    const sm = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.8), new THREE.MeshStandardMaterial({ map: this.scroll.tex, roughness: 0.95 }));
    sm.rotation.x = -Math.PI / 2;
    sm.position.set(0, 0.665, 0.2);
    s.add(sm);
    cyl(0.03, 0.03, 0.84, mat(0x3a2414), -0.82, 0.69, 0.2, s).rotation.x = Math.PI / 2;
    cyl(0.03, 0.03, 0.84, mat(0x3a2414), 0.82, 0.69, 0.2, s).rotation.x = Math.PI / 2;
    box(0.3, 0.06, 0.4, mat(0x18181a, { rough: 0.2 }), 0.95, 0.69, -0.15, s);
    this.brush = new THREE.Group();
    cyl(0.018, 0.018, 0.5, mat(0x8a6a3a, { rough: 0.5 }), 0, 0.25, 0, this.brush);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.1, 10), mat(0x101010));
    tip.rotation.x = Math.PI;
    tip.position.y = -0.03;
    this.brush.add(tip);
    s.add(this.brush);
    this.sealMesh = new THREE.Group();
    box(0.1, 0.25, 0.1, mat(0xd8c8a8, { rough: 0.6 }), 0, 0.12, 0, this.sealMesh);
    this.sealMesh.position.set(0.6, 0.9, 0.35);
    this.sealMesh.visible = false;
    s.add(this.sealMesh);

    // Paper lantern.
    this.lantern = mat(0xfff0d0, { emissive: 0xffc070, ei: 0.6, rough: 0.9 });
    const lantern = sphere(0.35, this.lantern, -2.6, 0.55, -2.4, s);
    lantern.scale.y = 1.35;
    cyl(0.18, 0.18, 0.05, frame, -2.6, 1.03, -2.4, s);
    cyl(0.18, 0.18, 0.05, frame, -2.6, 0.08, -2.4, s);
    this.lanternLight = new THREE.PointLight(0xffb060, 3, 6, 1.5);
    this.lanternLight.position.set(-2.6, 0.6, -2.4);
    s.add(this.lanternLight);

    this.leaf = new THREE.Mesh(new THREE.CircleGeometry(0.09, 5), mat(0xd03a1a, { side: THREE.DoubleSide }));
    this.leaf.visible = false;
    s.add(this.leaf);

    this.camera.position.set(-2.4, 2.5, 4.4);
    this.camera.lookAt(1.6, 0.7, -0.6);
  }

  private resetScroll(): void {
    const { ctx, w, h } = this.scroll;
    ctx.fillStyle = "#f3ead6";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(160,130,90,.25)";
    for (let x = 40; x < w; x += 48) { ctx.beginPath(); ctx.moveTo(x, 12); ctx.lineTo(x, h - 12); ctx.stroke(); }
    this.scroll.flush();
    this.strokes = [];
    for (let col = 0; col < 9; col++) for (let k = 0; k < 3; k++) this.strokes.push({ x: w - 40 - col * 48, y: 26 + k * 70 + this.r() * 10, len: 30 + this.r() * 30, drawn: 0 });
  }

  protected tick(dt: number, t: number): void {
    const b = this.busy;
    // Write the next unfinished stroke while working; the brush follows it.
    const next = this.strokes.find((st) => st.drawn < 1);
    const { ctx } = this.scroll;
    if (b > 0.5 && next) {
      const before = next.drawn;
      next.drawn = Math.min(1, next.drawn + dt * 1.6);
      ctx.strokeStyle = "#141010";
      ctx.lineCap = "round";
      ctx.lineWidth = 7 - next.drawn * 3;
      ctx.beginPath();
      ctx.moveTo(next.x + Math.sin(before * 3) * 4, next.y + before * next.len);
      ctx.lineTo(next.x + Math.sin(next.drawn * 3) * 4, next.y + next.drawn * next.len);
      ctx.stroke();
      this.scroll.flush();
      const u = next.x / this.scroll.w;
      const v = (next.y + next.drawn * next.len) / this.scroll.h;
      this.brush.position.set(-0.8 + u * 1.6, 0.68, 0.2 - 0.4 + v * 0.8);
      this.brush.rotation.set(-0.3, 0, 0.2);
    } else {
      this.brush.position.lerp(new THREE.Vector3(0.95, 0.75, -0.15), Math.min(1, dt * 2));
      this.brush.rotation.set(0, 0, 1.3);
    }
    if (!next) this.resetScroll();
    // Seal: lift, press, leave a red mark.
    if (this.sealT < 1) {
      this.sealT = Math.min(1, this.sealT + dt / 1.8);
      const k = this.sealT;
      this.sealMesh.visible = k < 0.9;
      const press = k < 0.5 ? 1 - ease.out(k / 0.5) : ease.out((k - 0.5) / 0.4);
      this.sealMesh.position.y = 0.68 + press * 0.4;
      if (k >= 0.5 && k - dt / 1.8 < 0.5) {
        ctx.fillStyle = "#c01a20";
        ctx.fillRect(60, 170, 46, 46);
        ctx.fillStyle = "#f3ead6";
        ctx.fillRect(68, 178, 12, 30); ctx.fillRect(86, 178, 12, 12); ctx.fillRect(86, 196, 12, 12);
        this.scroll.flush();
      }
    }
    const glowUp = this.sealT < 1 ? Math.sin(this.sealT * Math.PI) : 0;
    this.lantern.emissiveIntensity = 0.6 + b * 0.4 + glowUp * 2;
    this.lanternLight.intensity = 3 + b * 2 + glowUp * 10 + (this.opts.reduced ? 0 : Math.sin(t * 3) * 0.3);
    if (this.leafT < 1) {
      this.leafT = Math.min(1, this.leafT + dt / 5);
      const k = this.leafT;
      this.leaf.visible = true;
      this.leaf.position.set(9.4 - k * 3 + Math.sin(k * 12) * 0.4, 3.4 - k * 3.4, 1 - k * 1.2);
      this.leaf.rotation.set(k * 9, k * 5, k * 3);
      if (k >= 1) this.leaf.visible = false;
    }
  }

  protected celebrate(_e: PublicEvent | null): void {
    this.sealT = 0;
    this.leafT = 0;
  }
}



