// Ops: a network operations centre in blue half-light. A curved wall of
// monitors traces each game's vitals over two console desks; a beacon waits on
// the ceiling. Working: the graphs spike red and the beacon spins its light
// across the room. Complete: the ticket printer feeds out a ticket and tears it.

import * as THREE from "three/webgpu";
import type { PublicEvent } from "../../shared/public";
import { Office, box, canvasTex, cyl, ease, failed, glow, mat, rng, screen, sphere, type CanvasTex, type OfficeOptions } from "./kit";

export class OpsOffice extends Office {
  camera = new THREE.PerspectiveCamera(44, 1, 0.1, 100);
  private monitors: { ct: CanvasTex; kind: number; seed: number }[] = [];
  private beacon: THREE.Group;
  private beaconLight: THREE.SpotLight;
  private beaconDome: THREE.MeshStandardMaterial;
  private ticket: THREE.Mesh;
  private ticketT = 1;
  private keys: THREE.MeshStandardMaterial;
  private redraw = 0;
  private alarm = 0;

  constructor(o: OfficeOptions) {
    super(o);
    const s = this.scene;
    const r = rng(23);
    s.background = new THREE.Color(0x030812);
    this.setEnv("#3fa9ff", "#0a1a30", "#02040a", 0.5);
    s.add(new THREE.HemisphereLight(0x2a5aa0, 0x02040a, 0.7));
    const fill = new THREE.PointLight(0x3a8cff, 18, 14, 1.5);
    fill.position.set(0, 3, 1);
    s.add(fill);

    // Raised floor tiles with vents.
    const tiles = canvasTex(256, 256);
    tiles.ctx.fillStyle = "#0b1220";
    tiles.ctx.fillRect(0, 0, 256, 256);
    tiles.ctx.strokeStyle = "#1a2a44";
    tiles.ctx.lineWidth = 3;
    for (let i = 0; i <= 4; i++) { tiles.ctx.beginPath(); tiles.ctx.moveTo(i * 64, 0); tiles.ctx.lineTo(i * 64, 256); tiles.ctx.moveTo(0, i * 64); tiles.ctx.lineTo(256, i * 64); tiles.ctx.stroke(); }
    tiles.ctx.fillStyle = "#06090f";
    for (let i = 0; i < 6; i++) tiles.ctx.fillRect(70, 72 + i * 8, 52, 3);
    tiles.flush();
    tiles.tex.wrapS = tiles.tex.wrapT = THREE.RepeatWrapping;
    tiles.tex.repeat.set(4, 4);
    box(16, 0.2, 14, new THREE.MeshStandardMaterial({ map: tiles.tex, roughness: 0.5, metalness: 0.5 }), 0, -0.1, 0, s);
    box(16, 0.3, 14, mat(0x070b14), 0, 6, 0, s);
    // Cable trays on the ceiling.
    for (const x of [-3, 3]) box(0.6, 0.12, 12, mat(0x1a2333, { metal: 0.7 }), x, 5.6, 0, s);

    // A curved wall of monitors: three rows of five.
    const arc = new THREE.Group();
    arc.position.set(0, 0, 2.5);
    s.add(arc);
    for (let row = 0; row < 3; row++) for (let col = 0; col < 5; col++) {
      const a = (col - 2) * 0.24;
      const ct = canvasTex(256, 150);
      const m = screen(ct, 1.6, 0.94, 1.15);
      const g = new THREE.Group();
      g.rotation.y = -a;
      arc.add(g);
      m.position.set(0, 1.55 + row * 1.02, -7);
      g.add(m);
      box(1.68, 1.0, 0.08, mat(0x0a0e16, { metal: 0.6 }), 0, 1.55 + row * 1.02, -7.05, g);
      this.monitors.push({ ct, kind: (row * 5 + col) % 4, seed: r() * 10 });
    }
    // Status strip across the top.
    const strip = canvasTex(1024, 64);
    strip.ctx.fillStyle = "#020610";
    strip.ctx.fillRect(0, 0, 1024, 64);
    strip.ctx.font = "bold 34px monospace";
    strip.ctx.fillStyle = "#3fa9ff";
    strip.ctx.fillText("GAME HEALTH  ▪  ERRORS  ▪  LATENCY  ▪  CRASH-FREE  ▪  STORE", 24, 44);
    strip.flush();
    const stripMesh = screen(strip, 8, 0.5, 1.4);
    stripMesh.position.set(0, 5.05, -4.3);
    s.add(stripMesh);

    // Two tiers of consoles with chairs.
    this.keys = glow(0x3fa9ff, 0.6);
    for (const [z, y] of [[-1.3, 0], [0.9, 0.35]] as const) {
      if (y) box(9, y, 2.2, mat(0x0a0f19), 0, y / 2, z + 0.4, s);
      const desk = box(7.5, 0.12, 1.1, mat(0x121a28, { metal: 0.5, rough: 0.4 }), 0, y + 1.05, z, s);
      box(7.5, 1, 0.08, mat(0x0c121e), 0, y + 0.55, z + 0.5, s);
      box(7.5, 0.02, 0.02, glow(0x3fa9ff, 1.4), 0, y + 1.12, z - 0.55, s);
      for (let i = -2; i <= 2; i++) {
        box(0.9, 0.02, 0.3, this.keys, i * 1.45, y + 1.12, z + 0.15, s);
        const mm = screen(this.monitors[(i + 7) % this.monitors.length].ct, 0.7, 0.42, 0.9);
        mm.position.set(i * 1.45, y + 1.5, z - 0.3);
        mm.rotation.x = -0.15;
        s.add(mm);
        if (i % 2 === 0) {
          const chair = new THREE.Group();
          chair.position.set(i * 1.45 + 0.3, y, z + 1.1);
          s.add(chair);
          box(0.6, 0.1, 0.6, mat(0x1a1f2a), 0, 0.7, 0, chair);
          box(0.6, 0.8, 0.08, mat(0x1a1f2a), 0, 1.15, 0.28, chair);
          cyl(0.04, 0.04, 0.6, mat(0x444a55, { metal: 0.9 }), 0, 0.35, 0, chair);
        }
      }
      void desk;
    }

    // The beacon, and the ticket printer at the end of the front desk.
    this.beacon = new THREE.Group();
    this.beacon.position.set(0, 5.75, -0.2);
    s.add(this.beacon);
    this.beaconDome = mat(0x400008, { emissive: 0xff2030, ei: 0.2, transparent: true, opacity: 0.85 });
    const dome = sphere(0.3, this.beaconDome, 0, -0.25, 0, this.beacon);
    dome.scale.y = 0.8;
    this.beaconLight = new THREE.SpotLight(0xff2030, 0, 22, 0.45, 0.5, 1);
    this.beaconLight.position.set(0, -0.25, 0);
    this.beaconLight.target.position.set(4, -4, 0);
    this.beacon.add(this.beaconLight, this.beaconLight.target);

    const printer = new THREE.Group();
    printer.position.set(3.4, 1.11, -1.3);
    s.add(printer);
    box(0.7, 0.35, 0.6, mat(0xd8dde6, { rough: 0.5 }), 0, 0.17, 0, printer);
    box(0.5, 0.02, 0.05, mat(0x111111), 0, 0.34, -0.2, printer);
    sphere(0.03, glow(0x4dff9a, 3), 0.25, 0.3, 0.29, printer);
    const tct = canvasTex(64, 160);
    tct.ctx.fillStyle = "#f4f1e8";
    tct.ctx.fillRect(0, 0, 64, 160);
    tct.ctx.fillStyle = "#222";
    for (let i = 0; i < 14; i++) tct.ctx.fillRect(6, 10 + i * 10, 20 + ((i * 37) % 30), 3);
    tct.ctx.fillStyle = "#c01020";
    tct.ctx.fillRect(6, 8, 30, 5);
    tct.flush();
    this.ticket = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 1), new THREE.MeshStandardMaterial({ map: tct.tex, roughness: 0.9, side: THREE.DoubleSide }));
    this.ticket.geometry.translate(0, 0.5, 0);
    this.ticket.position.set(3.4, 1.45, -1.5);
    this.ticket.scale.y = 0.001;
    s.add(this.ticket);

    this.camera.position.set(2.6, 3.6, 5.6);
    this.camera.lookAt(-0.4, 2.6, -3.5);
  }

  protected tick(dt: number, t: number): void {
    const b = this.busy;
    this.alarm = Math.max(0, this.alarm - dt * 0.35);
    const red = Math.max(b * 0.7, this.alarm);
    this.beacon.rotation.y += dt * (this.opts.reduced ? 1 : 5) * (red > 0.05 ? 1 : 0);
    this.beaconLight.intensity = red * 90;
    this.beaconDome.emissiveIntensity = 0.2 + red * 4;
    this.keys.emissiveIntensity = 0.5 + b * 0.8 + (b > 0.5 ? Math.random() * 0.4 : 0);
    if ((this.redraw += dt) > 0.08) { this.redraw = 0; this.drawMonitors(t, red); }
    if (this.ticketT < 1) {
      this.ticketT = Math.min(1, this.ticketT + dt / 3);
      const k = this.ticketT;
      if (k < 0.6) {
        this.ticket.scale.y = ease.out(k / 0.6) * 0.9;
        this.ticket.position.set(3.4, 1.45, -1.5);
        this.ticket.rotation.set(-0.3, 0, 0);
      } else {
        const f = (k - 0.6) / 0.4;
        this.ticket.position.set(3.4 + f * 0.6, 1.45 + Math.sin(f * Math.PI) * 0.5 - f * 0.3, -1.5 + f * 0.9);
        this.ticket.rotation.set(-0.3 - f * 1.2, f * 0.8, f * 0.4);
      }
    }
  }

  private drawMonitors(t: number, red: number): void {
    for (const m of this.monitors) {
      const { ctx, w, h } = m.ct;
      ctx.fillStyle = "#020814";
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "rgba(63,169,255,.18)";
      ctx.lineWidth = 1;
      for (let x = 0; x < w; x += 32) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
      for (let y = 0; y < h; y += 30) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
      const hot = red > 0.3 && m.kind !== 3;
      ctx.strokeStyle = hot ? "#ff3048" : ["#3fa9ff", "#4dff9a", "#ffd166", "#b48cff"][m.kind];
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 4) {
        const p = x / w;
        let v = Math.sin(p * 9 + t * 1.6 + m.seed) * 0.18 + Math.sin(p * 23 + t * 3 + m.seed) * 0.06;
        if (hot) v += Math.exp(-(((p - 0.75 + Math.sin(t) * 0.05) * 9) ** 2)) * 0.6 * red;
        ctx.lineTo(x, h * (0.62 - v));
      }
      ctx.stroke();
      if (m.kind === 3) {
        ctx.fillStyle = red > 0.3 ? "#ff3048" : "#4dff9a";
        ctx.font = "bold 40px monospace";
        ctx.fillText(red > 0.3 ? "ALERT" : "99.9%", 20, 60);
      }
      m.ct.flush();
    }
  }

  protected celebrate(e: PublicEvent | null): void {
    this.ticketT = 0;
    if (failed(e) || e?.stage === "incident") this.alarm = 1;
  }
}
