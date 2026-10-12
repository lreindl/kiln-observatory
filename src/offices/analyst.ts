// The Analyst's archive: two storeys of shelves, a rolling ladder, a reading
// desk under a banker's lamp, dust drifting in a shaft of light. Working: books
// lift off the shelves and orbit the open tome while a holographic chart
// builds. Complete: one bound, glowing volume flies home to its shelf.

import * as THREE from "three/webgpu";
import type { PublicEvent } from "../../shared/public";
import { Office, Particles, box, canvasTex, clamp01, cyl, ease, glow, mat, particleMat, rng, screen, sphere, type CanvasTex, type OfficeOptions } from "./kit";

interface Flyer { mesh: THREE.Mesh; home: THREE.Vector3; phase: number; radius: number; height: number }

export class AnalystOffice extends Office {
  camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  private flyers: Flyer[] = [];
  private dust: Particles;
  private chart: CanvasTex;
  private chartMesh: THREE.Mesh;
  private globe: THREE.Mesh;
  private lamp: THREE.PointLight;
  private volume: THREE.Mesh;
  private volumeT = 1;
  private volumeFrom = new THREE.Vector3(0.3, 1.7, 1.1);
  private volumeTo = new THREE.Vector3(-3.2, 4.62, -3.75);
  private sparkle: Particles;
  private r = rng(11);

  constructor(o: OfficeOptions) {
    super(o);
    const s = this.scene;
    const r = this.r;
    s.background = new THREE.Color(0x120a06);
    this.setEnv("#ffd7a0", "#6a4020", "#120a06", 0.6);
    s.fog = new THREE.Fog(0x120a06, 14, 30);
    s.add(new THREE.HemisphereLight(0xffd7a0, 0x2a1a0e, 1.1));
    const fill = new THREE.PointLight(0xffb070, 25, 16, 1.3);
    fill.position.set(2, 5, 4);
    s.add(fill);
    const sun = new THREE.SpotLight(0xffc77a, 60, 30, 0.35, 0.8, 1.2);
    sun.position.set(5, 11, 3);
    sun.target.position.set(0, 0, 0);
    s.add(sun, sun.target);

    const wood = mat(0x3a2112, { rough: 0.55 });
    const dark = mat(0x22130a, { rough: 0.6 });
    // Floor: parquet.
    const floor = canvasTex(256, 256);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      floor.ctx.fillStyle = `hsl(26, 45%, ${(x + y) % 2 ? 16 : 20}%)`;
      floor.ctx.fillRect(x * 32, y * 32, 32, 32);
    }
    floor.flush();
    floor.tex.wrapS = floor.tex.wrapT = THREE.RepeatWrapping;
    floor.tex.repeat.set(3, 3);
    box(14, 0.2, 12, new THREE.MeshStandardMaterial({ map: floor.tex, roughness: 0.4 }), 0, -0.1, 0, s);
    box(14, 9, 0.3, dark, 0, 4.5, -4.6, s);
    box(0.3, 9, 12, dark, -6, 4.5, 0, s);

    // Shelves: back wall and left wall, two storeys, a gallery rail between.
    const books = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.75 }), 900);
    const m4 = new THREE.Matrix4();
    const palette = [0x6b1a1a, 0x1c3a5c, 0x2d4a24, 0x5c3a12, 0x3a1f4a, 0x7a5a20, 0x161616, 0x8a2a1a];
    let n = 0;
    const shelfRow = (x0: number, x1: number, y: number, z: number, alongZ: boolean) => {
      const len = x1 - x0;
      box(alongZ ? 0.9 : len, 0.08, alongZ ? len : 0.9, wood, alongZ ? z : (x0 + x1) / 2, y, alongZ ? (x0 + x1) / 2 : z, s);
      let p = x0 + 0.05;
      while (p < x1 - 0.2 && n < 900) {
        const w = 0.1 + r() * 0.12;
        const h = 0.55 + r() * 0.3;
        if (!(Math.abs(p - this.volumeTo.x) < 0.25 && Math.abs(y + 0.5 - this.volumeTo.y) < 0.6 && !alongZ)) {
          const tilt = r() < 0.06 ? 0.25 : 0;
          m4.makeRotationFromEuler(new THREE.Euler(alongZ ? tilt : 0, 0, alongZ ? 0 : tilt));
          m4.setPosition(alongZ ? z + 0.1 : p, y + 0.04 + h / 2, alongZ ? p : z + 0.1);
          m4.scale(alongZ ? new THREE.Vector3(0.7, h, w) : new THREE.Vector3(w, h, 0.7));
          books.setMatrixAt(n, m4);
          books.setColorAt(n, new THREE.Color(palette[Math.floor(r() * palette.length)]).multiplyScalar(0.7 + r() * 0.6));
          n++;
        }
        p += w + 0.01;
      }
    };
    for (const y of [0.1, 1.15, 2.2, 3.25, 4.3, 5.35, 6.4, 7.45]) {
      shelfRow(-5.6, 5.6, y, -4.1, false);
      shelfRow(-3.8, 3.8, y, -5.4, true);
    }
    books.count = n;
    s.add(books);
    for (let x = -5.6; x <= 5.6; x += 2.8) box(0.12, 8.6, 0.95, wood, x, 4.3, -4.1, s);
    // Gallery walkway and brass rail.
    box(14, 0.12, 1.4, wood, 0.5, 4.1, -3.2, s);
    const brass = mat(0xc8a050, { metal: 0.9, rough: 0.3 });
    box(12, 0.05, 0.05, brass, 0.5, 5, -2.55, s);
    for (let x = -5.5; x <= 6.5; x += 0.8) box(0.03, 0.9, 0.03, brass, x, 4.55, -2.55, s);
    // Rolling ladder.
    const ladder = new THREE.Group();
    ladder.position.set(3.6, 0, -3.4);
    ladder.rotation.x = -0.18;
    s.add(ladder);
    box(0.06, 4.6, 0.06, wood, -0.35, 2.3, 0, ladder);
    box(0.06, 4.6, 0.06, wood, 0.35, 2.3, 0, ladder);
    for (let y = 0.4; y < 4.5; y += 0.4) box(0.7, 0.04, 0.06, wood, 0, y, 0, ladder);

    // Reading desk, open tome, banker's lamp, globe, chair.
    box(3, 0.1, 1.6, wood, 0.3, 1.25, 1.1, s);
    for (const [x, z] of [[-1.1, 0.4], [1.7, 0.4], [-1.1, 1.8], [1.7, 1.8]]) box(0.12, 1.2, 0.12, dark, x, 0.6, z, s);
    const page = mat(0xf0e4c4, { rough: 0.9 });
    const left = box(0.55, 0.02, 0.75, page, 0.04, 1.34, 1.1, s);
    left.rotation.z = 0.1;
    const right = box(0.55, 0.02, 0.75, page, 0.56, 1.34, 1.1, s);
    right.rotation.z = -0.1;
    box(1.12, 0.06, 0.8, mat(0x5a1414), 0.3, 1.3, 1.1, s);
    cyl(0.1, 0.14, 0.05, brass, -0.9, 1.33, 0.7, s);
    cyl(0.02, 0.02, 0.5, brass, -0.9, 1.58, 0.7, s);
    const shade = cyl(0.08, 0.26, 0.16, mat(0x0d4a24, { emissive: 0x38d070, ei: 0.5, rough: 0.2 }), -0.9, 1.86, 0.78, s);
    shade.rotation.x = 0.4;
    this.lamp = new THREE.PointLight(0xffe0a8, 4, 6, 1.4);
    this.lamp.position.set(-0.85, 1.7, 0.9);
    s.add(this.lamp);
    cyl(0.04, 0.2, 0.9, brass, 2.6, 0.45, 2.2, s);
    this.globe = sphere(0.45, new THREE.MeshStandardMaterial({ map: this.globeTex(), roughness: 0.6 }), 2.6, 1.35, 2.2, s);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.02, 8, 48), brass);
    ring.position.copy(this.globe.position);
    ring.rotation.y = Math.PI / 2;
    s.add(ring);
    const chair = new THREE.Group();
    chair.position.set(0.3, 0, 2.4);
    s.add(chair);
    box(0.9, 0.1, 0.9, mat(0x5a1414, { rough: 0.6 }), 0, 0.85, 0, chair);
    box(0.9, 1.1, 0.12, wood, 0, 1.4, 0.45, chair);

    // The holographic chart over the tome.
    this.chart = canvasTex(256, 160);
    this.chartMesh = screen(this.chart, 1.6, 1, 1.6);
    (this.chartMesh.material as THREE.MeshStandardMaterial).transparent = true;
    this.chartMesh.position.set(0.3, 2.5, 1.0);
    s.add(this.chartMesh);

    // Books that fly while working.
    for (let i = 0; i < 9; i++) {
      const b = box(0.13, 0.6, 0.45, mat(palette[i % palette.length], { emissive: 0xffc070, ei: 0 }), 0, 0, 0, s);
      const home = new THREE.Vector3(-5 + r() * 10, 0.5 + Math.floor(r() * 7) * 1.05, -4);
      b.position.copy(home);
      this.flyers.push({ mesh: b, home, phase: (i / 9) * Math.PI * 2, radius: 1 + r() * 0.5, height: 2.2 + r() * 0.8 });
    }
    this.volume = box(0.18, 0.7, 0.5, mat(0x7a1a1a, { emissive: 0xffc070, ei: 1.5 }), 0, 0, 0, s);
    this.volume.visible = false;

    this.dust = new Particles(s, 90, new THREE.SphereGeometry(1, 6, 4), particleMat(), 0, 0);
    for (let i = 0; i < 90; i++) this.spawnDust(true);
    this.sparkle = new Particles(s, 80, new THREE.OctahedronGeometry(1), particleMat(), -1.5, 1);

    this.camera.position.set(6.4, 3.4, 7.6);
    this.camera.lookAt(-0.4, 3, -2);
  }

  private globeTex(): THREE.CanvasTexture {
    const g = canvasTex(256, 128);
    g.ctx.fillStyle = "#1f4f6a";
    g.ctx.fillRect(0, 0, 256, 128);
    g.ctx.fillStyle = "#c9b27a";
    for (let i = 0; i < 26; i++) { g.ctx.beginPath(); g.ctx.ellipse(this.r() * 256, 20 + this.r() * 88, 8 + this.r() * 22, 5 + this.r() * 14, this.r() * 3, 0, Math.PI * 2); g.ctx.fill(); }
    g.flush();
    return g.tex;
  }

  private spawnDust(anywhere = false): void {
    const p = new THREE.Vector3(-3 + this.r() * 8, anywhere ? this.r() * 7 : 0.2, -2 + this.r() * 5);
    this.dust.spawn(p, new THREE.Vector3((this.r() - 0.5) * 0.08, 0.05 + this.r() * 0.06, (this.r() - 0.5) * 0.08), 20 + this.r() * 20, 0.011, 0xffd9a0);
  }

  protected tick(dt: number, t: number): void {
    const b = this.busy;
    if (this.dust.alive < 90) this.spawnDust();
    this.dust.update(dt);
    this.sparkle.update(dt);
    this.globe.rotation.y += dt * (0.1 + b * 0.9);
    this.lamp.intensity = 3 + b * 5;
    const centre = new THREE.Vector3(0.3, 0, 1.1);
    for (const [i, f] of this.flyers.entries()) {
      const k = ease.inOut(clamp01(b * 1.6 - i * 0.07));
      const a = f.phase + t * 0.8;
      const orbit = new THREE.Vector3(centre.x + Math.cos(a) * f.radius, f.height + Math.sin(t * 1.3 + i) * 0.2, centre.z + Math.sin(a) * f.radius * 0.7);
      f.mesh.position.lerpVectors(f.home, orbit, k);
      f.mesh.rotation.set(k * Math.sin(t + i) * 0.6, k * a, k * 0.3);
      (f.mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = k * 0.35;
    }
    this.drawChart(t, b);
    if (this.volumeT < 1) {
      this.volumeT = Math.min(1, this.volumeT + dt / 2.2);
      const k = ease.inOut(this.volumeT);
      const mid = this.volumeFrom.clone().lerp(this.volumeTo, 0.5).add(new THREE.Vector3(0, 2.4, 1.5));
      const p = this.volumeFrom.clone().multiplyScalar((1 - k) ** 2).add(mid.multiplyScalar(2 * (1 - k) * k)).add(this.volumeTo.clone().multiplyScalar(k * k));
      this.volume.position.copy(p);
      this.volume.rotation.y = (1 - k) * 6;
      if (!this.opts.reduced && Math.random() < 0.6) this.sparkle.spawn(p, new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.3, (Math.random() - 0.5) * 0.6), 1.2, 0.035, 0xffd070);
      if (this.volumeT >= 1) for (let i = 0; i < 24; i++) this.sparkle.spawn(this.volumeTo, new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 2, Math.random() * 1.5), 1.4, 0.04, 0xffe3a0);
    }
    (this.volume.material as THREE.MeshStandardMaterial).emissiveIntensity = this.volumeT >= 1 ? 0.6 + Math.sin(t * 2) * 0.2 : 1.6;
  }

  private drawChart(t: number, b: number): void {
    const { ctx, w, h } = this.chart;
    ctx.clearRect(0, 0, w, h);
    if (b < 0.02) { this.chartMesh.visible = false; return; }
    this.chartMesh.visible = true;
    ctx.globalAlpha = b;
    ctx.strokeStyle = "rgba(120,220,255,.6)";
    ctx.strokeRect(4, 4, w - 8, h - 8);
    for (let i = 0; i < 9; i++) {
      const v = 0.25 + 0.6 * Math.abs(Math.sin(i * 1.7 + t * 0.9));
      const bh = v * (h - 30) * clamp01(b * 2 - i * 0.08);
      ctx.fillStyle = i === 6 ? "rgba(255,200,110,.95)" : "rgba(110,210,255,.8)";
      ctx.fillRect(16 + i * 26, h - 12 - bh, 18, bh);
    }
    ctx.strokeStyle = "rgba(255,230,160,.9)";
    ctx.beginPath();
    for (let x = 0; x < w - 24; x += 6) ctx.lineTo(12 + x, 40 + Math.sin(x * 0.05 + t * 2) * 14);
    ctx.stroke();
    ctx.globalAlpha = 1;
    this.chart.flush();
  }

  protected celebrate(_e: PublicEvent | null): void {
    this.volume.visible = true;
    this.volumeT = 0;
  }
}


