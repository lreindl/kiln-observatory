// The owner's penthouse at night: a walnut desk before a wall of glass, the city
// below. Working: the lamp comes up and papers slide across the desk.
// Complete (a merge): the approval stamp slams down and the city lights surge.

import * as THREE from "three/webgpu";
import type { PublicEvent } from "../../shared/public";
import { Office, box, canvasTex, cyl, ease, glow, mat, rng, sphere, type OfficeOptions } from "./kit";

export class OwnerOffice extends Office {
  camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
  private lamp: THREE.PointLight;
  private lampShade: THREE.MeshStandardMaterial;
  private papers: THREE.Mesh[] = [];
  private stamp: THREE.Group;
  private stampT = 1;
  private ink: THREE.Mesh;
  private windowsMat: THREE.MeshStandardMaterial;
  private surge = 0;
  private monitor: THREE.MeshStandardMaterial;
  private beacons: THREE.Mesh[] = [];

  constructor(o: OfficeOptions) {
    super(o);
    const s = this.scene;
    const r = rng(7);
    s.background = new THREE.Color(0x060a1a);
    this.setEnv("#2a3a7a", "#ffcf7a", "#140c08", 0.5);
    s.fog = new THREE.Fog(0x060a1a, 30, 90);
    s.add(new THREE.HemisphereLight(0x5068c0, 0x140c08, 0.9));
    const moon = new THREE.DirectionalLight(0xaab8ff, 0.8);
    moon.position.set(-6, 10, -10);
    s.add(moon);

    // Room: walnut floor, side wall with panelling, a wall of glass.
    const floorTex = canvasTex(512, 512);
    for (let i = 0; i < 16; i++) {
      floorTex.ctx.fillStyle = `hsl(25, ${35 + r() * 10}%, ${14 + r() * 6}%)`;
      floorTex.ctx.fillRect(0, i * 32, 512, 31);
      floorTex.ctx.fillStyle = "rgba(0,0,0,.35)";
      floorTex.ctx.fillRect(r() * 512, i * 32, 2, 32);
    }
    floorTex.flush();
    const floorM = new THREE.MeshStandardMaterial({ map: floorTex.tex, roughness: 0.35, metalness: 0.1 });
    box(14, 0.2, 12, floorM, 0, -0.1, 0, s);
    const rug = box(6, 0.04, 4, mat(0x3a1424, { rough: 0.95 }), 0.3, 0.02, 0.8, s);
    rug.receiveShadow = true;
    box(0.3, 7, 12, mat(0x1d1612, { rough: 0.6 }), -7, 3.5, 0, s);
    for (let z = -4.5; z <= 4.5; z += 1.5) box(0.05, 6.2, 0.04, mat(0x2a201a), -6.83, 3.4, z, s);
    box(14, 0.3, 12, mat(0x0d0b10), 0, 7, 0, s); // ceiling
    // Glass wall with mullions.
    const frame = mat(0x101218, { metal: 0.8, rough: 0.3 });
    for (let x = -7; x <= 7; x += 2.33) box(0.08, 7, 0.12, frame, x, 3.5, -6, s);
    box(14, 0.1, 0.12, frame, 0, 0.05, -6, s);
    box(14, 0.1, 0.12, frame, 0, 6.9, -6, s);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(14, 7), mat(0x8fa8ff, { transparent: true, opacity: 0.06, rough: 0.05, metal: 0.9 }));
    glass.position.set(0, 3.5, -6);
    s.add(glass);

    // The city: towers with lit windows, beacons on the tallest.
    const win = canvasTex(64, 128);
    win.ctx.fillStyle = "#000";
    win.ctx.fillRect(0, 0, 64, 128);
    for (let y = 2; y < 128; y += 6) for (let x = 2; x < 64; x += 5) {
      if (r() < 0.45) { win.ctx.fillStyle = r() < 0.8 ? "#ffcf7a" : "#9fd4ff"; win.ctx.fillRect(x, y, 3, 3); }
    }
    win.flush();
    win.tex.wrapS = win.tex.wrapT = THREE.RepeatWrapping;
    this.windowsMat = new THREE.MeshStandardMaterial({ color: 0x0b0f1c, emissive: 0xffffff, emissiveMap: win.tex, emissiveIntensity: 0.9, roughness: 0.8 });
    for (let i = 0; i < 46; i++) {
      const h = 6 + r() * 26;
      const w = 2 + r() * 3;
      const x = -40 + r() * 80;
      const z = -16 - r() * 40;
      const t = box(w, h, w, this.windowsMat, x, h / 2 - 8, z, s);
      t.scale.set(1, 1, 1);
      if (h > 26) this.beacons.push(sphere(0.25, glow(0xff2b3a, 4), x, h - 7.7, z, s));
    }
    sphere(2.2, glow(0xfff1d0, 1.6), 22, 26, -70, s); // moon

    // Desk, chair, lamp, monitor, stamp.
    const walnut = mat(0x3b2416, { rough: 0.4 });
    const desk = new THREE.Group();
    desk.position.set(0.5, 0, 0.6);
    s.add(desk);
    box(4.2, 0.14, 1.9, walnut, 0, 1.45, 0, desk);
    box(0.14, 1.4, 1.8, walnut, -2, 0.72, 0, desk);
    box(0.14, 1.4, 1.8, walnut, 2, 0.72, 0, desk);
    box(3.9, 1, 0.08, walnut, 0, 0.9, 0.85, desk);
    box(4.24, 0.03, 1.94, mat(0xc8a46a, { metal: 0.9, rough: 0.25 }), 0, 1.53, 0, desk); // brass inlay edge
    this.monitor = glow(0x4a7dff, 0.4);
    const mon = box(1.5, 0.9, 0.05, this.monitor, -0.9, 2.15, -0.5, desk);
    mon.rotation.y = 0.35;
    box(0.06, 0.5, 0.06, mat(0x222222, { metal: 0.8 }), -0.9, 1.75, -0.55, desk);
    // Lamp: brass stem and green glass shade.
    cyl(0.18, 0.22, 0.06, mat(0xc8a46a, { metal: 0.9, rough: 0.3 }), 1.4, 1.55, -0.4, desk);
    cyl(0.025, 0.025, 0.7, mat(0xc8a46a, { metal: 0.9, rough: 0.3 }), 1.4, 1.9, -0.4, desk);
    this.lampShade = mat(0x0b5a2a, { emissive: 0x3cff8a, ei: 0.2, rough: 0.2 });
    const shade = cyl(0.12, 0.38, 0.22, this.lampShade, 1.4, 2.3, -0.4, desk);
    shade.rotation.z = 0.2;
    this.lamp = new THREE.PointLight(0xffd9a0, 2, 8, 1.5);
    this.lamp.position.set(1.4, 2.1, -0.3);
    desk.add(this.lamp);
    // Papers.
    for (let i = 0; i < 4; i++) {
      const p = box(0.62, 0.012, 0.85, mat(0xf2ede0, { rough: 0.9 }), 1.6, 1.53 + i * 0.012, 0.5, desk);
      p.rotation.y = 0.2;
      this.papers.push(p);
    }
    this.ink = new THREE.Mesh(new THREE.CircleGeometry(0.2, 24), glow(0xd4142a, 1.2));
    this.ink.rotation.x = -Math.PI / 2;
    this.ink.position.set(0, 1.6, 0.3);
    this.ink.visible = false;
    desk.add(this.ink);
    this.stamp = new THREE.Group();
    cyl(0.24, 0.24, 0.12, mat(0x8a1020, { rough: 0.5 }), 0, 0, 0, this.stamp);
    cyl(0.07, 0.09, 0.4, mat(0x2b1a10, { rough: 0.4 }), 0, 0.26, 0, this.stamp);
    sphere(0.13, mat(0x2b1a10, { rough: 0.4 }), 0, 0.52, 0, this.stamp);
    this.stamp.position.set(-0.3, 1.6, 0.6);
    desk.add(this.stamp);
    // Chair (high back, facing the desk from behind).
    const leather = mat(0x15100e, { rough: 0.45 });
    const chair = new THREE.Group();
    chair.position.set(0.5, 0, -1.2);
    s.add(chair);
    box(1.1, 0.18, 1, leather, 0, 1, 0, chair);
    box(1.1, 1.6, 0.18, leather, 0, 1.85, -0.45, chair);
    cyl(0.05, 0.05, 0.9, mat(0x333333, { metal: 0.9 }), 0, 0.5, 0, chair);
    // Side table with a decanter and a plant.
    box(0.8, 0.9, 0.8, walnut, -5.5, 0.45, -3.6, s);
    cyl(0.12, 0.2, 0.5, mat(0xd0a060, { transparent: true, opacity: 0.55, rough: 0.05 }), -5.5, 1.15, -3.6, s);
    const pot = cyl(0.35, 0.28, 0.6, mat(0xd8d0c0), 5.6, 0.3, -4.6, s);
    for (let i = 0; i < 9; i++) {
      const leaf = sphere(0.35, mat(0x1d4a2a, { rough: 0.8 }), 5.6 + (r() - 0.5) * 0.7, 1 + r() * 1.3, -4.6 + (r() - 0.5) * 0.7, s);
      leaf.scale.set(1, 1.6, 0.4);
      leaf.rotation.set(r(), r() * 3, r());
    }
    void pot;
    // Art on the side wall.
    const art = canvasTex(256, 192);
    const g = art.ctx.createLinearGradient(0, 0, 256, 192);
    g.addColorStop(0, "#ff6a1a"); g.addColorStop(0.5, "#b0185a"); g.addColorStop(1, "#1a1a5a");
    art.ctx.fillStyle = g; art.ctx.fillRect(0, 0, 256, 192);
    art.ctx.fillStyle = "rgba(255,255,255,.85)"; art.ctx.beginPath(); art.ctx.arc(170, 80, 34, 0, Math.PI * 2); art.ctx.fill();
    art.flush();
    const canvasArt = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.8), new THREE.MeshStandardMaterial({ map: art.tex, roughness: 0.8 }));
    canvasArt.position.set(-6.84, 3.6, 1.5);
    canvasArt.rotation.y = Math.PI / 2;
    s.add(canvasArt);
    const pic = new THREE.SpotLight(0xffe2b0, 18, 8, 0.5, 0.6);
    pic.position.set(-4.5, 6.5, 1.5);
    pic.target = canvasArt;
    s.add(pic);

    this.camera.position.set(6.2, 3.9, 7.2);
    this.camera.lookAt(-0.6, 2.2, -2.5);
  }

  protected tick(dt: number, t: number): void {
    const b = this.busy;
    const flick = this.opts.reduced ? 1 : 1 + Math.sin(t * 2.1) * 0.02;
    this.lamp.intensity = (1.2 + b * 7) * flick;
    this.lampShade.emissiveIntensity = 0.2 + b * 1.2;
    this.monitor.emissiveIntensity = 0.35 + b * 1.1 + (b > 0.5 ? Math.sin(t * 9) * 0.08 : 0);
    // Papers slide from the inbox to the middle of the desk while working.
    this.papers.forEach((p, i) => {
      const k = ease.inOut(Math.min(1, Math.max(0, b * 1.4 - i * 0.12)));
      p.position.x = 1.6 - k * (1.3 + i * 0.12);
      p.position.z = 0.5 - k * 0.1 + Math.sin(i) * 0.05 * k;
      p.rotation.y = 0.2 - k * (0.25 + i * 0.07);
    });
    // Stamp: lift, slam, lift.
    if (this.stampT < 1) {
      this.stampT = Math.min(1, this.stampT + dt / 1.4);
      const k = this.stampT;
      const y = k < 0.45 ? 1.6 + ease.out(k / 0.45) * 0.9 : k < 0.55 ? 2.5 - ((k - 0.45) / 0.1) * 0.95 : 1.55 + ease.out((k - 0.55) / 0.45) * 0.05;
      this.stamp.position.set(-0.3 + Math.min(1, k / 0.45) * 0.3, y, 0.6 - Math.min(1, k / 0.45) * 0.3);
      if (k >= 0.55 && !this.ink.visible) { this.ink.visible = true; this.surge = 1; }
    }
    this.surge = Math.max(0, this.surge - dt * 0.5);
    this.windowsMat.emissiveIntensity = 0.85 + this.surge * 2.4 + b * 0.15;
    for (const [i, bc] of this.beacons.entries()) bc.visible = Math.sin(t * 2.4 + i * 1.7) > 0.2;
    if (!this.opts.reduced) {
      this.camera.position.x = 6.2 + Math.sin(t * 0.13) * 0.35;
      this.camera.lookAt(-0.6, 2.2, -2.5);
    }
  }

  protected celebrate(_e: PublicEvent | null): void {
    this.ink.visible = false;
    this.stampT = 0;
  }
}
