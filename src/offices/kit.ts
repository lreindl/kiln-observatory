// Shared building blocks for the offices: the Office base class, material and
// mesh helpers, canvas textures, and an instanced particle pool (WebGPU draws
// points one pixel wide, so particles are tiny instanced meshes).

import * as THREE from "three/webgpu";
import type { PublicEvent } from "../../shared/public";

export interface OfficeOptions {
  reduced: boolean;
}

/**
 * One agent's room. `busy` eases between 0 (idle) and 1 (working); subclasses
 * read it in `tick` and play their own flourish in `celebrate`.
 */
export abstract class Office {
  readonly scene = new THREE.Scene();
  abstract camera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
  busy = 0;
  protected target = 0;
  protected t = 0;
  private pending: { at: number; e: PublicEvent | null }[] = [];
  private workUntil = 0;

  constructor(protected opts: OfficeOptions) {}

  /** Start working on an event; the flourish follows after `workFor` seconds. */
  play(e: PublicEvent | null, workFor = 4.5): void {
    this.workUntil = Math.max(this.workUntil, this.t + workFor + 1.5);
    this.pending.push({ at: this.t + workFor, e });
  }

  /** Called each frame with the cell's aspect ratio and whether the routine is in its run window. */
  frame(dt: number, aspect: number, scheduled: boolean): void {
    this.t += dt;
    this.target = scheduled || this.t < this.workUntil ? 1 : 0;
    this.busy += (this.target - this.busy) * Math.min(1, dt * 2.5);
    for (const p of [...this.pending]) {
      if (this.t >= p.at) {
        this.pending.splice(this.pending.indexOf(p), 1);
        this.celebrate(p.e);
      }
    }
    this.fit(aspect);
    this.tick(dt, this.t);
  }

  private baseFov = 0;

  /**
   * Rooms are composed for a landscape cell. In narrower cells the vertical
   * field of view widens so the room keeps its horizontal framing.
   */
  protected fit(aspect: number): void {
    const c = this.camera;
    if (c instanceof THREE.PerspectiveCamera) {
      if (!this.baseFov) this.baseFov = c.fov;
      if (c.aspect !== aspect) {
        const COMPOSED = 1.3;
        const half = Math.tan(THREE.MathUtils.degToRad(this.baseFov) / 2);
        c.fov = aspect >= COMPOSED ? this.baseFov : THREE.MathUtils.radToDeg(2 * Math.atan(Math.min(half * (COMPOSED / aspect), 2.2)));
        c.aspect = aspect;
        c.updateProjectionMatrix();
      }
    } else {
      const h = (c.top - c.bottom) / 2;
      c.left = -h * aspect; c.right = h * aspect; c.updateProjectionMatrix();
    }
  }

  /** A soft gradient for metals to reflect, tinted to the room: sky, horizon, floor. */
  protected setEnv(sky: string, horizon: string, floor: string, intensity = 1): void {
    const c = canvasTex(256, 128);
    const g = c.ctx.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, sky); g.addColorStop(0.5, horizon); g.addColorStop(1, floor);
    c.ctx.fillStyle = g;
    c.ctx.fillRect(0, 0, 256, 128);
    c.tex.mapping = THREE.EquirectangularReflectionMapping;
    c.flush();
    this.scene.environment = c.tex;
    this.scene.environmentIntensity = intensity;
  }

  protected abstract tick(dt: number, t: number): void;
  protected abstract celebrate(e: PublicEvent | null): void;
}

export const failed = (e: PublicEvent | null) => !!e && (e.ok === false || e.kind === "check.failed");

// ---------- materials and meshes ----------

type MatOpts = { rough?: number; metal?: number; emissive?: number; ei?: number; flat?: boolean; transparent?: boolean; opacity?: number; side?: THREE.Side };

export function mat(color: number, o: MatOpts = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color, roughness: o.rough ?? 0.7, metalness: o.metal ?? 0.1,
    emissive: o.emissive ?? 0x000000, emissiveIntensity: o.ei ?? 1, flatShading: o.flat ?? false,
    transparent: o.transparent ?? false, opacity: o.opacity ?? 1, side: o.side ?? THREE.FrontSide,
  });
}

export const glow = (color: number, ei = 2) => mat(0x000000, { emissive: color, ei });

export function box(w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0, parent?: THREE.Object3D): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  parent?.add(mesh);
  return mesh;
}

export function cyl(rt: number, rb: number, h: number, m: THREE.Material, x = 0, y = 0, z = 0, parent?: THREE.Object3D, seg = 24): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
  mesh.position.set(x, y, z);
  parent?.add(mesh);
  return mesh;
}

export function sphere(r: number, m: THREE.Material, x = 0, y = 0, z = 0, parent?: THREE.Object3D): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), m);
  mesh.position.set(x, y, z);
  parent?.add(mesh);
  return mesh;
}

/** A seeded random source, so each room is the same on every load. */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export const ease = {
  out: (k: number) => 1 - (1 - k) ** 3,
  inOut: (k: number) => (k < 0.5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2),
  back: (k: number) => 1 + 2.70158 * (k - 1) ** 3 + 1.70158 * (k - 1) ** 2,
};
export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

// ---------- canvas textures ----------

export interface CanvasTex {
  tex: THREE.CanvasTexture;
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
  /** Mark the texture for re-upload after drawing. */
  flush(): void;
}

export function canvasTex(w: number, h: number): CanvasTex {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return { tex, ctx, w, h, flush: () => { tex.needsUpdate = true; } };
}

/** A flat screen showing a canvas texture, glowing on its own. */
export function screen(ct: CanvasTex, w: number, h: number, ei = 1.2): THREE.Mesh {
  const m = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: ct.tex, emissiveIntensity: ei, map: ct.tex });
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
}

// ---------- particles ----------

interface P { pos: THREE.Vector3; vel: THREE.Vector3; life: number; max: number; size: number; color: THREE.Color }

/** A pool of small glowing instanced shapes with velocity, gravity and drag. */
export class Particles {
  readonly mesh: THREE.InstancedMesh;
  private ps: P[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3();

  constructor(parent: THREE.Object3D, private cap: number, geo: THREE.BufferGeometry, material: THREE.Material, public gravity = -4, public drag = 0.6) {
    this.mesh = new THREE.InstancedMesh(geo, material, cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    for (let i = 0; i < cap; i++) this.mesh.setColorAt(i, new THREE.Color(0));
    this.mesh.count = 0;
    parent.add(this.mesh);
  }

  spawn(pos: THREE.Vector3, vel: THREE.Vector3, life: number, size: number, color: THREE.ColorRepresentation): void {
    if (this.ps.length >= this.cap) this.ps.shift();
    this.ps.push({ pos: pos.clone(), vel: vel.clone(), life, max: life, size, color: new THREE.Color(color) });
  }

  update(dt: number): void {
    this.ps = this.ps.filter((p) => (p.life -= dt) > 0);
    this.ps.forEach((p, i) => {
      p.vel.y += this.gravity * dt;
      p.vel.multiplyScalar(Math.max(0, 1 - this.drag * dt));
      p.pos.addScaledVector(p.vel, dt);
      const k = p.life / p.max;
      this.m.compose(p.pos, this.q, this.s.setScalar(p.size * (0.3 + 0.7 * k)));
      this.mesh.setMatrixAt(i, this.m);
      this.mesh.setColorAt(i, p.color.clone().multiplyScalar(0.4 + 0.6 * k));
    });
    this.mesh.count = this.ps.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  get alive(): number {
    return this.ps.length;
  }
}

/** A material whose colour comes from each particle's instance colour, glowing. */
export const particleMat = () => new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
