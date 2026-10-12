// The studio floor: an isometric cyberpunk room with the Kiln at its heart.
// Each event sends a spark from the routine's station into the Kiln, and the
// Kiln's heat follows how busy the studio is.

import * as THREE from "three/webgpu";
import { float, pass, uniform, vec2 } from "three/tsl";
import { bloom } from "three/addons/tsl/display/BloomNode.js";
import { chromaticAberration } from "three/addons/tsl/display/ChromaticAberrationNode.js";
import type { Agent, PublicEvent } from "../shared/public";
import { GROUP_COLOR, STATIONS, stationFor, type Station } from "./crew";

interface Spark { mesh: THREE.Mesh; from: THREE.Vector3; to: THREE.Vector3; t: number; dur: number; heat: number }
interface Ring { mesh: THREE.Mesh; t: number }
interface Crew { station: Station; body: THREE.Mesh; mat: THREE.MeshStandardMaterial; label: HTMLElement; pulse: number; seed: number }

const KILN_HOT = new THREE.Color(0xff6a1a);
const KILN_FAIL = new THREE.Color(0xff1f3d);

export class StudioScene {
  readonly renderer: THREE.WebGPURenderer;
  private scene = new THREE.Scene();
  private camera: THREE.OrthographicCamera;
  private pipeline!: THREE.RenderPipeline;
  private crew = new Map<Agent, Crew>();
  private sparks: Spark[] = [];
  private rings: Ring[] = [];
  private heat = 0.2;
  private flash = 0;
  private kilnCore!: THREE.MeshStandardMaterial;
  private kilnMouth!: THREE.MeshStandardMaterial;
  private kilnLight!: THREE.PointLight;
  private clock = new THREE.Clock();
  private reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  private bloomStrength = uniform(1.15);

  constructor(private host: HTMLElement, private labels: HTMLElement) {
    this.renderer = new THREE.WebGPURenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    host.appendChild(this.renderer.domElement);
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
    this.camera.position.set(26, 24, 26);
    this.camera.lookAt(0, 0, 0);
  }

  /** Which backend the renderer picked: WebGPU where available, else WebGL 2. */
  get backend(): string {
    return (this.renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend ? "WebGPU" : "WebGL 2";
  }

  async start(): Promise<void> {
    await this.renderer.init();
    this.build();
    const scenePass = pass(this.scene, this.camera);
    const color = scenePass.getTextureNode("output");
    const glow = color.add(bloom(color, this.bloomStrength, 0.55, 0.12));
    this.pipeline = new THREE.RenderPipeline(this.renderer);
    this.pipeline.outputNode = this.reduced ? glow : chromaticAberration(glow, float(0.35), vec2(0.5, 0.5), float(1.05));
    addEventListener("resize", () => this.resize());
    this.resize();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  private build(): void {
    const s = this.scene;
    s.background = new THREE.Color(0x05060b);
    s.fog = new THREE.Fog(0x05060b, 40, 75);
    s.add(new THREE.HemisphereLight(0x3a4cff, 0x0a0410, 0.6));
    const key = new THREE.DirectionalLight(0x9fb4ff, 0.5);
    key.position.set(-10, 20, 8);
    s.add(key);

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(34, 34), new THREE.MeshStandardMaterial({ color: 0x0b0e18, roughness: 0.35, metalness: 0.7 }));
    floor.rotation.x = -Math.PI / 2;
    s.add(floor);
    const grid = new THREE.GridHelper(34, 34, 0x1d3cff, 0x121a3a);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.55;
    grid.position.y = 0.01;
    s.add(grid);
    this.buildWalls();
    this.buildKiln();
    for (const st of STATIONS) this.buildStation(st);
  }

  private neon(color: number, intensity = 2.2): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({ color: 0x000000, emissive: color, emissiveIntensity: intensity });
  }

  private buildWalls(): void {
    const wall = new THREE.MeshStandardMaterial({ color: 0x0a0c16, roughness: 0.8, metalness: 0.3 });
    const back = new THREE.Mesh(new THREE.BoxGeometry(34, 7, 0.4), wall);
    back.position.set(0, 3.5, -17);
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.4, 7, 34), wall);
    side.position.set(-17, 3.5, 0);
    this.scene.add(back, side);
    // Neon strips along the walls.
    const strips: [number, number, number, number, number][] = [[0, 6.6, -16.75, 34, 0x19e3ff], [0, 0.4, -16.75, 34, 0xff2f92]];
    for (const [x, y, z, w, c] of strips) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.08, 0.08), this.neon(c, 3));
      m.position.set(x, y, z);
      this.scene.add(m);
    }
    for (const [y, c] of [[6.6, 0x19e3ff], [0.4, 0xff2f92]] as const) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 34), this.neon(c, 3));
      m.position.set(-16.75, y, 0);
      this.scene.add(m);
    }
  }

  private buildKiln(): void {
    const g = new THREE.Group();
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 2.2, 3.2, 8), new THREE.MeshStandardMaterial({ color: 0x151826, roughness: 0.4, metalness: 0.9, flatShading: true }));
    shell.position.y = 1.6;
    this.kilnCore = this.neon(0xff6a1a, 0.6);
    const core = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.25, 24), this.kilnCore);
    core.position.y = 3.25;
    this.kilnMouth = this.neon(0xff8a3d, 2);
    const mouth = new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.09, 8, 48), this.kilnMouth);
    mouth.rotation.x = Math.PI / 2;
    mouth.position.y = 3.25;
    // Vents around the base glow with the same heat.
    for (let i = 0; i < 8; i++) {
      const vent = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.05), this.kilnCore);
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      vent.position.set(Math.cos(a) * 2.07, 0.5, Math.sin(a) * 2.07);
      vent.lookAt(0, 0.5, 0);
      g.add(vent);
    }
    const base = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 0.12, 8), new THREE.MeshStandardMaterial({ color: 0x10131f, metalness: 0.8, roughness: 0.35 }));
    base.position.y = 0.06;
    const baseEdge = new THREE.LineSegments(new THREE.EdgesGeometry(base.geometry), new THREE.LineBasicMaterial({ color: 0xff6a1a }));
    baseEdge.position.y = 0.06;
    const shellEdge = new THREE.LineSegments(new THREE.EdgesGeometry(shell.geometry), new THREE.LineBasicMaterial({ color: 0x8a3a12 }));
    shellEdge.position.y = 1.6;
    g.add(baseEdge, shellEdge);
    this.kilnLight = new THREE.PointLight(0xff6a1a, 30, 22, 1.6);
    this.kilnLight.position.y = 4.5;
    g.add(shell, core, mouth, base, this.kilnLight);
    this.scene.add(g);
  }

  private buildStation(st: Station): void {
    const color = GROUP_COLOR[st.group];
    const y = st.y ?? 0;
    const g = new THREE.Group();
    g.position.set(st.x, y, st.z);
    if (y > 0) {
      const riser = new THREE.Mesh(new THREE.BoxGeometry(4.4, y, 3.4), new THREE.MeshStandardMaterial({ color: 0x0d1020, metalness: 0.6, roughness: 0.5 }));
      riser.position.y = -y / 2;
      g.add(riser);
    }
    const pad = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.16, 2.6), new THREE.MeshStandardMaterial({ color: 0x0f1222, metalness: 0.8, roughness: 0.3 }));
    pad.position.y = 0.08;
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(pad.geometry), new THREE.LineBasicMaterial({ color }));
    edge.position.copy(pad.position);
    // A console with a glowing screen facing the Kiln.
    const desk = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.7, 0.5), new THREE.MeshStandardMaterial({ color: 0x141829, metalness: 0.7, roughness: 0.4 }));
    desk.position.set(0, 0.5, -0.7);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.8), this.neon(color, 0.9));
    screen.position.set(0, 1.35, -0.92);
    g.add(pad, edge, desk, screen);
    g.lookAt(0, y, 0);
    g.rotateY(Math.PI);

    const mat = this.neon(color, 0.9);
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.7, 6, 16), mat);
    body.position.set(st.x, y + 0.95, st.z);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), this.neon(0xffffff, 1.4));
    head.position.y = 0.62;
    body.add(head);
    this.scene.add(g, body);

    const label = document.createElement("div");
    label.className = `tag tag-${st.group}`;
    label.textContent = st.name;
    this.labels.appendChild(label);
    this.crew.set(st.agent, { station: st, body, mat, label, pulse: 0, seed: Math.random() * 10 });
  }

  /** Animate one public event: a spark from the actor's station to the Kiln. */
  play(e: PublicEvent): void {
    const crew = this.crew.get(stationFor(e.actor).agent);
    if (!crew) return;
    crew.pulse = 1;
    const failed = e.ok === false || e.kind === "check.failed";
    const big = e.kind === "pr.merged" || e.kind === "workflow.finished";
    const color = failed ? 0xff1f3d : big ? 0xffd166 : GROUP_COLOR[crew.station.group];
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(big ? 0.28 : 0.18, 16, 12), this.neon(color, 4));
    const from = crew.body.position.clone().add(new THREE.Vector3(0, 0.6, 0));
    mesh.position.copy(from);
    this.scene.add(mesh);
    this.sparks.push({ mesh, from, to: new THREE.Vector3(0, 3.3, 0), t: 0, dur: this.reduced ? 0.4 : 1.3, heat: failed ? -0.2 : big ? 0.9 : 0.35 });
    if (failed) this.flash = 1;
  }

  private frame(): void {
    const dt = Math.min(this.clock.getDelta(), 0.1);
    const t = this.clock.elapsedTime;

    for (const sp of [...this.sparks]) {
      sp.t += dt / sp.dur;
      const k = Math.min(sp.t, 1);
      const mid = sp.from.clone().lerp(sp.to, 0.5).add(new THREE.Vector3(0, 4, 0));
      // Quadratic Bézier arc over the floor.
      sp.mesh.position.copy(sp.from).multiplyScalar((1 - k) ** 2).add(mid.multiplyScalar(2 * (1 - k) * k)).add(sp.to.clone().multiplyScalar(k * k));
      if (sp.t >= 1) {
        this.scene.remove(sp.mesh);
        this.sparks.splice(this.sparks.indexOf(sp), 1);
        this.heat = THREE.MathUtils.clamp(this.heat + sp.heat, 0.12, 3);
        this.addRing(sp.heat > 0.5);
      }
    }
    for (const r of [...this.rings]) {
      r.t += dt / 1.1;
      r.mesh.scale.setScalar(1 + r.t * 4);
      (r.mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = 3 * (1 - r.t);
      if (r.t >= 1) { this.scene.remove(r.mesh); this.rings.splice(this.rings.indexOf(r), 1); }
    }

    // Heat cools toward embers; a failure flashes red.
    this.heat += (0.15 - this.heat) * dt * 0.06;
    this.flash = Math.max(0, this.flash - dt * 1.5);
    const flicker = this.reduced ? 1 : 0.92 + Math.sin(t * 11) * 0.04 + Math.sin(t * 23.7) * 0.04;
    const glow = (0.35 + this.heat * 1.1) * flicker;
    this.kilnCore.emissive.copy(KILN_HOT).lerp(KILN_FAIL, this.flash);
    this.kilnCore.emissiveIntensity = glow;
    this.kilnMouth.emissiveIntensity = 1.2 + this.heat * 1.4;
    this.kilnLight.intensity = 18 + this.heat * 40;
    this.kilnLight.color.copy(KILN_HOT).lerp(KILN_FAIL, this.flash);

    const v = new THREE.Vector3();
    const { clientWidth: w, clientHeight: h } = this.host;
    for (const c of this.crew.values()) {
      c.pulse = Math.max(0, c.pulse - dt * 0.9);
      c.body.position.y = (c.station.y ?? 0) + 0.95 + (this.reduced ? 0 : Math.sin(t * 1.6 + c.seed) * 0.08);
      c.mat.emissiveIntensity = 0.9 + c.pulse * 3;
      v.copy(c.body.position).add(new THREE.Vector3(0, 1.1, 0)).project(this.camera);
      c.label.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px) translate(-50%, -100%)`;
      c.label.classList.toggle("hot", c.pulse > 0.2);
    }
    this.pipeline.render();
  }

  private addRing(big: boolean): void {
    const mesh = new THREE.Mesh(new THREE.TorusGeometry(1.4, big ? 0.07 : 0.04, 8, 64), this.neon(big ? 0xffd166 : 0xff8a3d, 3));
    mesh.rotation.x = Math.PI / 2;
    mesh.position.y = 3.3;
    this.scene.add(mesh);
    this.rings.push({ mesh, t: 0 });
  }

  /** 0..1, for the HUD. */
  get heatLevel(): number {
    return THREE.MathUtils.clamp((this.heat - 0.12) / 2.2, 0, 1);
  }

  private resize(): void {
    const { clientWidth: w, clientHeight: h } = this.host;
    this.renderer.setSize(w, h);
    const aspect = w / h;
    // Fit the floor to the space between the HUD panels: on wide screens the
    // panels take the sides, so the view widens with the window.
    const panels = w > 760 ? 620 : 0;
    const usable = Math.max(w - panels, w * 0.5);
    const view = aspect < 1 ? 34 / aspect : 34;
    this.camera.left = (-view * aspect) / 2;
    this.camera.right = (view * aspect) / 2;
    this.camera.top = view / 2 - 1.5;
    this.camera.bottom = -view / 2 - 1.5;
    this.camera.zoom = aspect < 1 ? 1.1 : THREE.MathUtils.clamp((usable / w) * 2.6, 1, 2);
    this.camera.updateProjectionMatrix();
  }
}
