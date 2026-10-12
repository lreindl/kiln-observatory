// The PM's war room, seen from above: a long table with the roadmap laid out as
// a board of cards in four lanes, chairs around it, coffee going cold. Working:
// cards hop between lanes while a laser pointer roams. Complete: one card lands
// in Ready, a pin drops into it and the lane lights up.

import * as THREE from "three/webgpu";
import type { PublicEvent } from "../../shared/public";
import { Office, Particles, box, canvasTex, clamp01, cyl, ease, glow, mat, particleMat, rng, sphere, type OfficeOptions } from "./kit";

const LANES = ["BACKLOG", "READY", "IN PR", "DONE"];
const LANE_X = [-3.3, -1.1, 1.1, 3.3];
const CARD_COLORS = [0xffd166, 0x9fe8ff, 0xff9ac8, 0xb6ff8a, 0xc9b0ff];

interface Card { mesh: THREE.Mesh; lane: number; slot: number; from: THREE.Vector3; to: THREE.Vector3; t: number }

export class PmOffice extends Office {
  camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 100);
  private cards: Card[] = [];
  private hopTimer = 0;
  private pointer: THREE.Mesh;
  private pointerLight: THREE.PointLight;
  private laneGlow: THREE.MeshStandardMaterial[] = [];
  private pin: THREE.Group;
  private pinT = 1;
  private pinCard: Card | null = null;
  private steam: Particles;
  private r = rng(47);

  constructor(o: OfficeOptions) {
    super(o);
    const s = this.scene;
    const r = this.r;
    s.background = new THREE.Color(0x0e0b16);
    this.setEnv("#d8ccff", "#4a3a6a", "#0e0b16", 0.5);
    s.add(new THREE.HemisphereLight(0xd8ccff, 0x1a1028, 1.2));
    const key = new THREE.DirectionalLight(0xfff2e0, 1.2);
    key.position.set(-3, 10, 4);
    s.add(key);

    // Carpet and walls just visible at the edges.
    const carpet = canvasTex(128, 128);
    carpet.ctx.fillStyle = "#1c1430";
    carpet.ctx.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 1600; i++) { carpet.ctx.fillStyle = `rgba(${150 + r() * 80},${120 + r() * 60},255,${r() * 0.08})`; carpet.ctx.fillRect(r() * 128, r() * 128, 1, 1); }
    carpet.flush();
    carpet.tex.wrapS = carpet.tex.wrapT = THREE.RepeatWrapping;
    carpet.tex.repeat.set(6, 6);
    box(20, 0.1, 16, new THREE.MeshStandardMaterial({ map: carpet.tex, roughness: 1 }), 0, -0.05, 0, s);

    // The table: dark glass over a lit edge.
    box(10, 0.16, 5.6, mat(0x15121e, { rough: 0.15, metal: 0.6 }), 0, 1, 0, s);
    box(10.1, 0.04, 5.7, glow(0xb48cff, 1.1), 0, 0.9, 0, s);
    // Lanes with headers.
    for (const [i, name] of LANES.entries()) {
      const g = glow(i === 1 ? 0xb48cff : 0x6a5a9a, i === 1 ? 0.5 : 0.25);
      this.laneGlow.push(g);
      box(2, 0.01, 4.6, g, LANE_X[i], 1.085, 0.2, s);
      const head = canvasTex(256, 64);
      head.ctx.fillStyle = "#000";
      head.ctx.fillRect(0, 0, 256, 64);
      head.ctx.fillStyle = "#e8e0ff";
      head.ctx.font = "bold 38px monospace";
      head.ctx.textAlign = "center";
      head.ctx.fillText(name, 128, 46);
      head.flush();
      const hm = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.45), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: head.tex, emissiveIntensity: 0.9 }));
      hm.rotation.x = -Math.PI / 2;
      hm.position.set(LANE_X[i], 1.1, -2.35);
      s.add(hm);
    }
    // Cards.
    for (let i = 0; i < 14; i++) {
      const lane = i < 6 ? 0 : i < 8 ? 1 : i < 10 ? 2 : 3;
      const m = box(1.5, 0.04, 0.62, mat(CARD_COLORS[i % CARD_COLORS.length], { rough: 0.8 }), 0, 0, 0, s);
      const lines = canvasTex(128, 48);
      lines.ctx.fillStyle = "#fff";
      lines.ctx.fillRect(0, 0, 128, 48);
      lines.ctx.fillStyle = "rgba(0,0,0,.45)";
      for (let k = 0; k < 3; k++) lines.ctx.fillRect(10, 10 + k * 11, 40 + r() * 70, 5);
      lines.flush();
      const face = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.5), new THREE.MeshStandardMaterial({ map: lines.tex, color: CARD_COLORS[i % CARD_COLORS.length], roughness: 0.9 }));
      face.rotation.x = -Math.PI / 2;
      face.position.y = 0.025;
      m.add(face);
      const card: Card = { mesh: m, lane, slot: 0, from: new THREE.Vector3(), to: new THREE.Vector3(), t: 1 };
      this.cards.push(card);
    }
    this.restack(true);

    // Chairs around the table.
    for (let i = 0; i < 8; i++) {
      const x = -3.6 + (i % 4) * 2.4;
      const z = i < 4 ? -3.7 : 3.7;
      const c = new THREE.Group();
      c.position.set(x, 0, z);
      c.rotation.y = i < 4 ? 0 : Math.PI;
      s.add(c);
      box(1, 0.12, 0.9, mat(0x2a2240, { rough: 0.7 }), 0, 0.7, 0, c);
      box(1, 0.9, 0.12, mat(0x2a2240, { rough: 0.7 }), 0, 1.2, -0.45, c);
    }
    // Coffee, a laptop, a phone.
    for (const [x, z] of [[-4.3, 2.2], [2.4, -2.1], [4.4, 1.9]]) {
      cyl(0.18, 0.15, 0.3, mat(0xf2efe8, { rough: 0.6 }), x, 1.23, z, s);
      cyl(0.15, 0.15, 0.01, mat(0x3a2010, { rough: 0.2 }), x, 1.37, z, s);
    }
    const laptop = box(1.3, 0.04, 0.9, mat(0x9aa0aa, { metal: 0.8, rough: 0.3 }), -4.3, 1.11, -0.6, s);
    laptop.rotation.y = 0.3;
    box(0.35, 0.02, 0.7, mat(0x111114, { rough: 0.2 }), 4.3, 1.1, -0.4, s);

    this.pointer = sphere(0.07, glow(0xff2040, 5), 0, 1.12, 0, s);
    this.pointerLight = new THREE.PointLight(0xff2040, 0, 2, 1.5);
    s.add(this.pointerLight);
    this.pin = new THREE.Group();
    sphere(0.16, mat(0xff2d4a, { rough: 0.3, emissive: 0xff2d4a, ei: 0.4 }), 0, 0.5, 0, this.pin);
    cyl(0.02, 0.005, 0.5, mat(0xcccccc, { metal: 0.9 }), 0, 0.25, 0, this.pin);
    this.pin.visible = false;
    s.add(this.pin);
    this.steam = new Particles(s, 90, new THREE.SphereGeometry(1, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25 }), 0.25, 0.4);

    this.camera.position.set(0, 14, 5.5);
    this.camera.lookAt(0, 0.6, 0.2);
    this.camera.zoom = 1.08;
  }

  protected fit(aspect: number): void {
    const h = Math.max(4.2, 5.3 / aspect); // keep the whole table in view
    this.camera.top = h; this.camera.bottom = -h;
    super.fit(aspect);
  }

  private slotPos(lane: number, slot: number): THREE.Vector3 {
    return new THREE.Vector3(LANE_X[lane], 1.12 + 0.0, -1.7 + slot * 0.76);
  }

  /** Lays each lane's cards out in order; animated unless `instant`. */
  private restack(instant = false): void {
    for (let lane = 0; lane < 4; lane++) {
      this.cards.filter((c) => c.lane === lane).forEach((c, slot) => {
        c.slot = slot;
        const to = this.slotPos(lane, Math.min(slot, 5));
        to.y += Math.max(0, slot - 5) * 0.05;
        if (instant) { c.mesh.position.copy(to); c.t = 1; c.to.copy(to); return; }
        if (!c.to.equals(to)) { c.from.copy(c.mesh.position); c.to.copy(to); c.t = 0; }
      });
    }
  }

  private hop(target?: number): Card {
    const movable = this.cards.filter((c) => c.lane < 3);
    const c = movable[Math.floor(this.r() * movable.length)];
    c.lane = target ?? Math.min(3, c.lane + 1);
    if (this.cards.filter((x) => x.lane === 3).length > 5) this.cards.find((x) => x.lane === 3)!.lane = 0; // done cards recycle
    this.restack();
    return c;
  }

  protected tick(dt: number, t: number): void {
    const b = this.busy;
    if (b > 0.5 && (this.hopTimer += dt) > 1.1) { this.hopTimer = 0; this.hop(); }
    for (const c of this.cards) {
      if (c.t >= 1) continue;
      c.t = Math.min(1, c.t + dt / 0.9);
      const k = ease.inOut(c.t);
      c.mesh.position.lerpVectors(c.from, c.to, k);
      c.mesh.position.y += Math.sin(k * Math.PI) * 1.2;
      c.mesh.rotation.y = Math.sin(k * Math.PI) * 0.4;
    }
    // Laser pointer roams the board while working.
    this.pointer.visible = b > 0.1;
    this.pointer.position.set(Math.sin(t * 1.3) * 3.4, 1.13, Math.sin(t * 2.1) * 1.6);
    this.pointerLight.position.copy(this.pointer.position).add(new THREE.Vector3(0, 0.3, 0));
    this.pointerLight.intensity = b * 3;
    if (this.pinT < 1 && this.pinCard) {
      this.pinT = Math.min(1, this.pinT + dt / 1.6);
      const k = clamp01((this.pinT - 0.4) / 0.35);
      this.pin.visible = this.pinT > 0.4;
      this.pin.position.copy(this.pinCard.mesh.position).add(new THREE.Vector3(0.55, 1.6 * (1 - ease.out(k)), -0.15));
      this.laneGlow[1].emissiveIntensity = 0.5 + Math.sin(clamp01(this.pinT) * Math.PI) * 2.5;
    } else if (this.pinCard) {
      this.pin.position.copy(this.pinCard.mesh.position).add(new THREE.Vector3(0.55, 0, -0.15));
      if (this.pinCard.lane !== 1) { this.pin.visible = false; this.pinCard = null; }
    }
    if (!this.opts.reduced && Math.random() < 0.3) {
      const cups = [[-4.3, 2.2], [2.4, -2.1], [4.4, 1.9]];
      const [x, z] = cups[Math.floor(Math.random() * 3)];
      this.steam.spawn(new THREE.Vector3(x, 1.4, z), new THREE.Vector3((Math.random() - 0.5) * 0.1, 0.3, (Math.random() - 0.5) * 0.1), 2.5, 0.06, 0xffffff);
    }
    this.steam.update(dt);
  }

  protected celebrate(_e: PublicEvent | null): void {
    const backlog = this.cards.filter((c) => c.lane === 0);
    const c = backlog[0] ?? this.hop(0);
    c.lane = 1;
    this.restack();
    this.pinCard = c;
    this.pinT = 0;
  }
}
