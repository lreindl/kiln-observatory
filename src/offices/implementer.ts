// The Implementer's workshop: polished concrete, hazard stripes, a pegboard of
// tools, and a six-axis arm over the bench with a CI stack light beside it.
// Working: the arm traces the crate's seams, welding, sparks spraying.
// Complete: the crate is stamped and rides the rollers out; a fresh frame drops
// in. Check results light the stack: green for passed, red for failed.

import * as THREE from "three/webgpu";
import type { PublicEvent } from "../../shared/public";
import { Office, Particles, box, canvasTex, clamp01, cyl, ease, failed, glow, mat, particleMat, rng, sphere, type OfficeOptions } from "./kit";

export class ImplementerOffice extends Office {
  camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  private arm: { yaw: THREE.Group; shoulder: THREE.Group; elbow: THREE.Group; wrist: THREE.Group; tip: THREE.Object3D };
  private sparks: Particles;
  private weldLight: THREE.PointLight;
  private crate: THREE.Group;
  private crateT = 1;
  private stack: { green: THREE.MeshStandardMaterial; amber: THREE.MeshStandardMaterial; red: THREE.MeshStandardMaterial };
  private stackState: "idle" | "pass" | "fail" = "idle";
  private stackT = 0;
  private rollers: THREE.Mesh[] = [];
  private stampMark: THREE.Mesh;
  private r = rng(71);

  constructor(o: OfficeOptions) {
    super(o);
    const s = this.scene;
    const r = this.r;
    s.background = new THREE.Color(0x0d0c0b);
    this.setEnv("#fff2dc", "#6a6460", "#1a1816", 0.6);
    s.add(new THREE.HemisphereLight(0xfff0d8, 0x201810, 0.8));
    const high = new THREE.SpotLight(0xfff2dc, 70, 20, 0.6, 0.5, 1.2);
    high.position.set(0, 8, 2);
    high.target.position.set(0, 1, 0);
    s.add(high, high.target);

    // Concrete floor with hazard striping.
    const floor = canvasTex(512, 512);
    floor.ctx.fillStyle = "#3a3936";
    floor.ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 4000; i++) { floor.ctx.fillStyle = `rgba(${r() < 0.5 ? 0 : 255},${r() < 0.5 ? 0 : 255},${r() < 0.5 ? 0 : 255},0.03)`; floor.ctx.fillRect(r() * 512, r() * 512, 3, 3); }
    floor.ctx.save();
    floor.ctx.beginPath(); floor.ctx.rect(0, 340, 512, 26); floor.ctx.clip();
    for (let x = -40; x < 560; x += 36) { floor.ctx.fillStyle = "#e8b400"; floor.ctx.beginPath(); floor.ctx.moveTo(x, 366); floor.ctx.lineTo(x + 18, 366); floor.ctx.lineTo(x + 44, 340); floor.ctx.lineTo(x + 26, 340); floor.ctx.fill(); }
    floor.ctx.restore();
    floor.flush();
    box(16, 0.2, 14, new THREE.MeshStandardMaterial({ map: floor.tex, roughness: 0.3, metalness: 0.2 }), 0, -0.1, 0, s);
    box(16, 7, 0.3, mat(0x2a2a2c, { rough: 0.85 }), 0, 3.5, -5, s);
    box(0.3, 7, 14, mat(0x26262a, { rough: 0.85 }), -7, 3.5, 0, s);

    // Pegboard with tool silhouettes.
    const peg = canvasTex(512, 256);
    peg.ctx.fillStyle = "#b58a5a";
    peg.ctx.fillRect(0, 0, 512, 256);
    peg.ctx.fillStyle = "#7a5a38";
    for (let y = 8; y < 256; y += 16) for (let x = 8; x < 512; x += 16) { peg.ctx.beginPath(); peg.ctx.arc(x, y, 2.2, 0, Math.PI * 2); peg.ctx.fill(); }
    peg.flush();
    const pegboard = new THREE.Mesh(new THREE.PlaneGeometry(6, 3), new THREE.MeshStandardMaterial({ map: peg.tex, roughness: 0.9 }));
    pegboard.position.set(-1.5, 3.6, -4.83);
    s.add(pegboard);
    const steel = mat(0x9aa0a8, { metal: 0.9, rough: 0.3 });
    const red = mat(0xc0201a, { rough: 0.5 });
    for (let i = 0; i < 7; i++) {
      const x = -4 + i * 0.8;
      box(0.06, 0.9 + r() * 0.5, 0.05, steel, x, 3.8, -4.75, s);
      box(0.22, 0.28, 0.07, i % 2 ? red : mat(0xe8b400, { rough: 0.5 }), x, 4.4, -4.73, s);
    }
    for (let i = 0; i < 4; i++) { const w = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.05, 8, 20), steel); w.position.set(-3.6 + i * 0.6, 2.7, -4.74); s.add(w); }
    // Shelf with parts bins.
    box(4, 0.08, 0.7, mat(0x444448, { metal: 0.6 }), 3.5, 3.1, -4.55, s);
    for (let i = 0; i < 5; i++) box(0.6, 0.4, 0.5, mat([0x2a6ad0, 0xe8b400, 0xc0201a][i % 3], { rough: 0.6 }), 2 + i * 0.75, 3.35, -4.5, s);

    // Bench.
    box(5, 0.14, 2.2, mat(0x3b2c1e, { rough: 0.5 }), 0, 1.2, 0, s);
    for (const [x, z] of [[-2.3, -0.9], [2.3, -0.9], [-2.3, 0.9], [2.3, 0.9]]) box(0.12, 1.2, 0.12, mat(0x2a2a2c, { metal: 0.7 }), x, 0.6, z, s);
    box(4.6, 0.08, 1.9, mat(0x2a2a2c, { metal: 0.7 }), 0, 0.3, 0, s);
    // Vice and a toolbox.
    box(0.4, 0.3, 0.3, mat(0x2a5aa0, { metal: 0.6, rough: 0.4 }), -2, 1.42, 0.6, s);
    box(1, 0.5, 0.5, red, 1.9, 1.52, -0.6, s);
    box(1.02, 0.06, 0.52, steel, 1.9, 1.8, -0.6, s);

    // Roller conveyor leading out to the right.
    for (let i = 0; i < 12; i++) {
      const roller = cyl(0.1, 0.1, 1.6, steel, 2.9 + i * 0.4, 1.15, 0, s, 12);
      roller.rotation.x = Math.PI / 2;
      this.rollers.push(roller);
    }
    box(4.9, 0.1, 0.08, mat(0x2a2a2c), 5.1, 1.1, 0.82, s);
    box(4.9, 0.1, 0.08, mat(0x2a2a2c), 5.1, 1.1, -0.82, s);

    // The crate being built: a frame of edges plus side panels that weld in.
    this.crate = new THREE.Group();
    this.crate.position.set(-0.4, 1.27, 0);
    s.add(this.crate);
    const ply = mat(0xc89a5a, { rough: 0.8 });
    const cs = 1.1;
    for (const [x, y, z, w, h, d] of [
      [0, 0, 0, cs, 0.06, cs], [0, cs, 0, cs, 0.06, cs],
      [-cs / 2, cs / 2, -cs / 2, 0.08, cs, 0.08], [cs / 2, cs / 2, -cs / 2, 0.08, cs, 0.08], [-cs / 2, cs / 2, cs / 2, 0.08, cs, 0.08], [cs / 2, cs / 2, cs / 2, 0.08, cs, 0.08],
    ]) box(w, h, d, mat(0x5a6068, { metal: 0.8, rough: 0.35 }), x, y, z, this.crate);
    for (const [x, z, ry] of [[0, cs / 2, 0], [cs / 2, 0, Math.PI / 2], [-cs / 2, 0, Math.PI / 2]] as const) {
      const p = box(cs - 0.1, cs - 0.1, 0.04, ply, x, cs / 2, z, this.crate);
      p.rotation.y = ry;
    }
    this.stampMark = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.25), glow(0x36d67a, 1.5));
    this.stampMark.position.set(0, cs / 2, cs / 2 + 0.03);
    this.stampMark.visible = false;
    this.crate.add(this.stampMark);

    // The arm: yaw base, shoulder, elbow, wrist, torch.
    const yellow = mat(0xf0a800, { rough: 0.45, metal: 0.3 });
    const dark = mat(0x222226, { metal: 0.7, rough: 0.4 });
    const yaw = new THREE.Group();
    yaw.position.set(-1.6, 1.27, -0.7);
    s.add(yaw);
    cyl(0.4, 0.48, 0.3, dark, 0, 0.15, 0, yaw);
    const shoulder = new THREE.Group();
    shoulder.position.y = 0.4;
    yaw.add(shoulder);
    sphere(0.24, dark, 0, 0, 0, shoulder);
    box(0.24, 1.3, 0.24, yellow, 0, 0.65, 0, shoulder);
    const elbow = new THREE.Group();
    elbow.position.y = 1.3;
    shoulder.add(elbow);
    sphere(0.2, dark, 0, 0, 0, elbow);
    box(0.2, 1.1, 0.2, yellow, 0, 0.55, 0, elbow);
    const wrist = new THREE.Group();
    wrist.position.y = 1.1;
    elbow.add(wrist);
    sphere(0.14, dark, 0, 0, 0, wrist);
    cyl(0.05, 0.08, 0.45, dark, 0, 0.25, 0, wrist);
    const tip = new THREE.Object3D();
    tip.position.y = 0.5;
    wrist.add(tip);
    this.arm = { yaw, shoulder, elbow, wrist, tip };

    // Stack light: green / amber / red.
    const stackPole = new THREE.Group();
    stackPole.position.set(2.3, 1.27, 0.95);
    s.add(stackPole);
    cyl(0.03, 0.03, 0.6, dark, 0, 0.3, 0, stackPole);
    this.stack = { green: glow(0x36d67a, 0.15), amber: glow(0xffa000, 0.15), red: glow(0xff2d2d, 0.15) };
    cyl(0.1, 0.1, 0.18, this.stack.red, 0, 0.7, 0, stackPole);
    cyl(0.1, 0.1, 0.18, this.stack.amber, 0, 0.9, 0, stackPole);
    cyl(0.1, 0.1, 0.18, this.stack.green, 0, 1.1, 0, stackPole);

    this.sparks = new Particles(s, 400, new THREE.BoxGeometry(1, 1, 3), particleMat(), -9, 0.4);
    this.weldLight = new THREE.PointLight(0x9fd8ff, 0, 5, 1.5);
    s.add(this.weldLight);

    this.camera.position.set(5.4, 4.8, 7.6);
    this.camera.lookAt(0.3, 1.6, -0.6);
  }

  protected tick(dt: number, t: number): void {
    const b = this.busy;
    // Idle pose vs. tracing the crate's seams.
    const a = t * 0.9;
    const weld = b > 0.4 && this.crateT >= 1;
    const yaw = weld ? 0.25 + Math.sin(a) * 0.35 : -0.2;
    const sh = weld ? 0.55 + Math.sin(a * 1.3) * 0.12 : 0.15;
    const el = weld ? 1.25 + Math.cos(a * 0.9) * 0.15 : 0.6;
    const wr = weld ? 0.8 + Math.sin(a * 2) * 0.2 : 0.3;
    const lerp = Math.min(1, dt * 3);
    this.arm.yaw.rotation.y += (yaw - this.arm.yaw.rotation.y) * lerp;
    this.arm.shoulder.rotation.z += (-sh - this.arm.shoulder.rotation.z) * lerp;
    this.arm.elbow.rotation.z += (-el - this.arm.elbow.rotation.z) * lerp;
    this.arm.wrist.rotation.z += (-wr - this.arm.wrist.rotation.z) * lerp;
    const tip = this.arm.tip.getWorldPosition(new THREE.Vector3());
    if (weld) {
      const flick = Math.random();
      this.weldLight.position.copy(tip);
      this.weldLight.intensity = 10 + flick * 20;
      const n = this.opts.reduced ? 1 : 6;
      for (let i = 0; i < n; i++) {
        const v = new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 2.5, (Math.random() - 0.5) * 3);
        this.sparks.spawn(tip, v, 0.4 + Math.random() * 0.5, 0.025, Math.random() < 0.7 ? 0xffb040 : 0xfff2c0);
      }
    } else this.weldLight.intensity = 0;
    this.sparks.update(dt);

    // Crate ships out along the rollers, then a fresh frame drops in.
    if (this.crateT < 1) {
      this.crateT = Math.min(1, this.crateT + dt / 4);
      const k = this.crateT;
      if (k < 0.2) this.stampMark.visible = k > 0.08;
      else if (k < 0.75) {
        const f = ease.inOut((k - 0.2) / 0.55);
        this.crate.position.x = -0.4 + f * 7.5;
        for (const roller of this.rollers) roller.rotation.y -= dt * 8;
      } else {
        const f = ease.out(clamp01((k - 0.75) / 0.25));
        this.stampMark.visible = false;
        this.crate.position.set(-0.4, 1.27 + (1 - f) * 2.5, 0);
        this.crate.rotation.y = (1 - f) * 0.6;
      }
    }
    // Stack light: amber pulses while working; green or red holds after a check.
    this.stackT = Math.max(0, this.stackT - dt / 6);
    const blink = Math.sin(t * 6) > 0 ? 1 : 0.2;
    this.stack.amber.emissiveIntensity = this.stackState === "idle" && b > 0.3 ? 0.4 + blink * 2.5 : 0.15;
    this.stack.green.emissiveIntensity = this.stackState === "pass" ? 0.4 + this.stackT * 3 : 0.15;
    this.stack.red.emissiveIntensity = this.stackState === "fail" ? (0.4 + this.stackT * 3) * blink : 0.15;
    if (this.stackT <= 0) this.stackState = "idle";
  }

  protected celebrate(e: PublicEvent | null): void {
    if (e?.kind === "check.passed" || e?.kind === "check.failed") {
      this.stackState = failed(e) ? "fail" : "pass";
      this.stackT = 1;
      return;
    }
    this.crateT = 0;
  }

  /** Check results are immediate: no welding first. */
  play(e: PublicEvent | null): void {
    super.play(e, e?.kind.startsWith("check") ? 0.2 : 4.5);
  }
}
