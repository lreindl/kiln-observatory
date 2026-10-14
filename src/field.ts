// The dot field: one canvas, a pool of dots that spring toward the current
// formation, a camera that pans (for scrolling), hairline "construction"
// guides, and pulses of work running along circuits between agents.
// Everything on screen is drawn here, in white on black.

import type { Pt } from "./shapes";

export interface FPoint extends Pt { size?: number; alpha?: number; group?: string }
export type Guide =
  | { kind: "line"; a: Pt; b: Pt; alpha?: number; dash?: number[] }
  | { kind: "circle"; c: Pt; r: number; alpha?: number; dash?: number[] }
  | { kind: "ellipse"; c: Pt; rx: number; ry: number; alpha?: number; dash?: number[] }
  | { kind: "text"; at: Pt; text: string; alpha?: number; align?: CanvasTextAlign; size?: number };

export interface Formation {
  points: FPoint[];
  guides: Guide[];
  /** Group centres, for rotation, scale and fades. */
  groups: Record<string, Pt>;
}

interface GroupState { c: Pt; rot: number; scale: number; alpha: number; tScale: number; tAlpha: number; spin: number; jitter: number; scatter: number }
interface Camera { x: number; y: number; s: number }
interface Mover { pts: Pt[]; t: number; dur: number; from: Pt; to: Pt; lift: number; size: number; trail: number; path?: { pts: Pt[]; lens: number[]; total: number } }

const ease = {
  inOut: (k: number) => (k < 0.5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2),
  out: (k: number) => 1 - (1 - k) ** 4,
  in: (k: number) => k ** 3,
  expoOut: (k: number) => (k >= 1 ? 1 : 1 - 2 ** (-10 * k)),
  expoIn: (k: number) => (k <= 0 ? 0 : 2 ** (10 * k - 10)),
};
export type Ease = keyof typeof ease;

export class Field {
  readonly canvas = document.createElement("canvas");
  private ctx = this.canvas.getContext("2d")!;
  private n: number;
  private x: Float32Array; private y: Float32Array;
  private vx: Float32Array; private vy: Float32Array;
  private tx: Float32Array; private ty: Float32Array;
  private size: Float32Array; private tsize: Float32Array;
  private alpha: Float32Array; private talpha: Float32Array;
  private delay: Float32Array;
  private group: (string | null)[];
  private groups = new Map<string, GroupState>();
  private guides: Guide[] = [];
  private guideAlpha = 1;
  private formedAt = 0;
  private time = 0;
  cam: Camera = { x: 0, y: 0, s: 1 };
  private camTween: { from: Camera; to: Camera; t: number; dur: number; ease: Ease; done: () => void } | null = null;
  private movers: Mover[] = [];
  private w = 0; private h = 0; private dpr = 1;
  /** Dot grid spacing in world units; 0 hides it. */
  grid = 28;
  readonly reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  constructor(host: HTMLElement, count: number) {
    host.appendChild(this.canvas);
    this.n = count;
    const f = () => new Float32Array(count);
    this.x = f(); this.y = f(); this.vx = f(); this.vy = f(); this.tx = f(); this.ty = f();
    this.size = f(); this.tsize = f(); this.alpha = f(); this.talpha = f(); this.delay = f();
    this.group = new Array(count).fill(null);
    for (let i = 0; i < count; i++) {
      this.x[i] = (Math.random() - 0.5) * innerWidth * 1.1; this.y[i] = (Math.random() - 0.5) * innerHeight * 1.1;
      this.tx[i] = this.x[i]; this.ty[i] = this.y[i]; this.size[i] = this.tsize[i] = 1;
    }
    addEventListener("resize", () => this.resize());
    this.resize();
  }

  get width(): number { return this.w; }
  get height(): number { return this.h; }

  private resize(): void {
    this.dpr = Math.min(devicePixelRatio || 1, 2);
    this.w = innerWidth; this.h = innerHeight;
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.canvas.style.width = `${this.w}px`;
    this.canvas.style.height = `${this.h}px`;
  }

  /** Which dot holds which formation point, kept so a data-only redraw can reuse it. */
  private perm: number[] = [];

  /**
   * Sends every dot to the formation. Dots beyond the formation drift as faint
   * dust. `from` gives the stagger origin: dots nearer it move first. `stable`
   * is for redrawing the same level with new data: each dot keeps the point it
   * had, so only what changed moves.
   */
  form(f: Formation, opts: { stagger?: number; from?: Pt; stable?: boolean } = {}): void {
    const stagger = this.reduced ? 0 : opts.stagger ?? 0.5;
    const origin = opts.from ?? { x: 0, y: 0 };
    let far = 1;
    for (const p of f.points) far = Math.max(far, Math.hypot(p.x - origin.x, p.y - origin.y));
    const keepGroups = new Map(this.groups);
    this.groups.clear();
    for (const [id, c] of Object.entries(f.groups)) {
      const prev = keepGroups.get(id);
      this.groups.set(id, { c, rot: prev?.rot ?? 0, scale: prev?.scale ?? 1, alpha: prev?.alpha ?? 1, tScale: 1, tAlpha: 1, spin: prev?.spin ?? 0, jitter: prev?.jitter ?? 0, scatter: 0 });
    }
    // Shuffle which dot takes which point, so dots travel interesting paths;
    // a stable redraw keeps the last assignment.
    let order = this.perm;
    if (!opts.stable || order.length !== this.n) {
      order = Array.from({ length: this.n }, (_, i) => i);
      for (let i = order.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [order[i], order[j]] = [order[j], order[i]]; }
      this.perm = order;
    }
    for (let k = 0; k < this.n; k++) {
      const i = order[k];
      const p = f.points[k];
      if (p) {
        this.tx[i] = p.x; this.ty[i] = p.y;
        this.tsize[i] = p.size ?? 1.3; this.talpha[i] = p.alpha ?? 0.92;
        this.group[i] = p.group ?? null;
        this.delay[i] = (Math.hypot(p.x - origin.x, p.y - origin.y) / far) * stagger + Math.random() * 0.08;
      } else if (opts.stable && !this.group[i] && this.talpha[i] < 0.2) {
        // Already dust: leave it be.
      } else {
        // Dust: dots with no place in the formation settle where they are, faint,
        // rather than streaking across the screen.
        this.tx[i] = this.x[i] + (Math.random() - 0.5) * 24; this.ty[i] = this.y[i] + (Math.random() - 0.5) * 24;
        this.tsize[i] = 0.7 + Math.random() * 0.4; this.talpha[i] = Math.random() < 0.12 ? 0.04 + Math.random() * 0.06 : 0;
        this.group[i] = null;
        this.delay[i] = Math.random() * stagger;
      }
    }
    this.guides = f.guides;
    if (!opts.stable) this.guideAlpha = 0;
    this.formedAt = this.time;
  }

  setGroup(id: string, g: Partial<Pick<GroupState, "tScale" | "tAlpha" | "spin" | "jitter">>): void {
    const s = this.groups.get(id);
    if (s) Object.assign(s, g);
  }

  /** Throws a group's dots outward for a moment (a failure). */
  scatter(id: string): void {
    const s = this.groups.get(id);
    if (s) s.scatter = 1;
  }

  private timers: { at: number; done: () => void }[] = [];

  /** Resolves after `seconds` of the field's own time (so a stepped clock moves it too). */
  wait(seconds: number): Promise<void> {
    if (this.reduced) seconds = Math.min(seconds, 0.25);
    return new Promise((done) => this.timers.push({ at: this.time + seconds, done }));
  }

  camera(to: Camera, dur: number, e: Ease = "inOut"): Promise<void> {
    if (this.reduced) dur = Math.min(dur, 0.25);
    return new Promise((done) => { this.camTween = { from: { ...this.cam }, to, t: 0, dur, ease: e, done }; });
  }

  /** A pulse running along a circuit (a polyline), like current along a trace. */
  pulse(path: Pt[], size = 1.6): void {
    const lens = [0];
    for (let i = 1; i < path.length; i++) lens.push(lens[i - 1] + Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y));
    const total = lens[lens.length - 1] || 1;
    this.movers.push({ pts: [], t: 0, dur: this.reduced ? 0.3 : Math.min(2.6, 0.7 + total / 420), from: path[0], to: path[path.length - 1], lift: 0, size, trail: 9, path: { pts: path, lens, total } });
  }

  private along(m: Mover, t: number): Pt {
    const p = m.path!;
    const d = t * p.total;
    let i = 1;
    while (i < p.lens.length - 1 && p.lens[i] < d) i++;
    const a = p.pts[i - 1], b = p.pts[i];
    const k = (d - p.lens[i - 1]) / ((p.lens[i] - p.lens[i - 1]) || 1);
    return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
  }

  /** World to screen. */
  toScreen(p: Pt): Pt {
    return { x: (p.x - this.cam.x) * this.cam.s + this.w / 2, y: (p.y - this.cam.y) * this.cam.s + this.h / 2 };
  }

  step(dt: number): void {
    this.time += dt;
    for (const t of [...this.timers]) if (this.time >= t.at) { this.timers.splice(this.timers.indexOf(t), 1); t.done(); }
    if (this.camTween) {
      const c = this.camTween;
      c.t = Math.min(1, c.t + dt / c.dur);
      const k = ease[c.ease](c.t);
      // Interpolate scale geometrically so zooms feel even.
      this.cam.s = c.from.s * (c.to.s / c.from.s) ** k;
      this.cam.x = c.from.x + (c.to.x - c.from.x) * k;
      this.cam.y = c.from.y + (c.to.y - c.from.y) * k;
      if (c.t >= 1) { this.camTween = null; c.done(); }
    }
    for (const g of this.groups.values()) {
      g.scale += (g.tScale - g.scale) * Math.min(1, dt * 6);
      g.alpha += (g.tAlpha - g.alpha) * Math.min(1, dt * 4);
      g.rot += g.spin * dt;
      g.scatter = Math.max(0, g.scatter - dt * 0.8);
    }
    const since = this.time - this.formedAt;
    const K = 70, C = 2 * Math.sqrt(K) * 0.82;
    for (let i = 0; i < this.n; i++) {
      if (since < this.delay[i]) continue;
      const ax = K * (this.tx[i] - this.x[i]) - C * this.vx[i];
      const ay = K * (this.ty[i] - this.y[i]) - C * this.vy[i];
      this.vx[i] += ax * dt; this.vy[i] += ay * dt;
      this.x[i] += this.vx[i] * dt; this.y[i] += this.vy[i] * dt;
      this.size[i] += (this.tsize[i] - this.size[i]) * Math.min(1, dt * 5);
      this.alpha[i] += (this.talpha[i] - this.alpha[i]) * Math.min(1, dt * 3);
    }
    this.guideAlpha = Math.min(1, this.guideAlpha + dt * 0.9);
    for (const m of [...this.movers]) {
      m.t += dt / m.dur;
      if (m.t >= 1 + 0.15) this.movers.splice(this.movers.indexOf(m), 1);
    }
  }

  private pos(i: number): Pt | null {
    let x = this.x[i], y = this.y[i];
    const gid = this.group[i];
    if (gid) {
      const g = this.groups.get(gid);
      if (g) {
        const dx = x - g.c.x, dy = y - g.c.y;
        const cos = Math.cos(g.rot), sin = Math.sin(g.rot);
        let rx = (dx * cos - dy * sin) * g.scale, ry = (dx * sin + dy * cos) * g.scale;
        if (g.scatter > 0) { const k = 1 + g.scatter * (0.6 + ((i * 7919) % 100) / 60); rx *= k; ry *= k; }
        if (g.jitter > 0) { rx += Math.sin(this.time * 9 + i) * g.jitter; ry += Math.cos(this.time * 7 + i * 1.3) * g.jitter; }
        x = g.c.x + rx; y = g.c.y + ry;
      }
    }
    return { x, y };
  }

  render(): void {
    const { ctx, w, h, dpr, cam } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);
    const sx = (x: number) => (x - cam.x) * cam.s + w / 2;
    const sy = (y: number) => (y - cam.y) * cam.s + h / 2;
    const dotScale = Math.min(Math.sqrt(cam.s), 5);

    // Dot grid, in world space so it moves with the zoom.
    if (this.grid > 0) {
      const gs = this.grid;
      const step = gs * cam.s < 9 ? gs * Math.ceil(9 / (gs * cam.s)) : gs;
      const x0 = Math.floor((cam.x - w / 2 / cam.s) / step) * step, x1 = cam.x + w / 2 / cam.s;
      const y0 = Math.floor((cam.y - h / 2 / cam.s) / step) * step, y1 = cam.y + h / 2 / cam.s;
      ctx.fillStyle = "rgba(255,255,255,0.075)";
      const r = Math.max(0.5, Math.min(1.2, 0.6 * dotScale));
      for (let gx = x0; gx <= x1; gx += step) for (let gy = y0; gy <= y1; gy += step) ctx.fillRect(sx(gx) - r / 2, sy(gy) - r / 2, r, r);
    }

    // Construction guides.
    ctx.lineWidth = 0.6;
    for (const g of this.guides) {
      const a = (g.alpha ?? 0.18) * this.guideAlpha;
      ctx.strokeStyle = `rgba(255,255,255,${a})`;
      ctx.fillStyle = `rgba(255,255,255,${a * 2.2})`;
      ctx.setLineDash("dash" in g && g.dash ? g.dash : []);
      ctx.beginPath();
      if (g.kind === "line") { ctx.moveTo(sx(g.a.x), sy(g.a.y)); ctx.lineTo(sx(g.b.x), sy(g.b.y)); ctx.stroke(); }
      else if (g.kind === "circle") { ctx.arc(sx(g.c.x), sy(g.c.y), g.r * cam.s, 0, Math.PI * 2); ctx.stroke(); }
      else if (g.kind === "ellipse") { ctx.ellipse(sx(g.c.x), sy(g.c.y), g.rx * cam.s, g.ry * cam.s, 0, 0, Math.PI * 2); ctx.stroke(); }
      else {
        ctx.font = `400 ${g.size ?? 12}px "IBM Plex Mono", ui-monospace, monospace`;
        ctx.textAlign = g.align ?? "left";
        ctx.fillText(g.text, sx(g.at.x), sy(g.at.y));
      }
    }
    ctx.setLineDash([]);

    // Dots, batched by alpha.
    const BINS = 10;
    const paths = Array.from({ length: BINS }, () => new Path2D());
    const used = new Array(BINS).fill(false);
    for (let i = 0; i < this.n; i++) {
      let a = this.alpha[i];
      const gid = this.group[i];
      if (gid) a *= this.groups.get(gid)?.alpha ?? 1;
      if (a < 0.03) continue;
      const p = this.pos(i)!;
      const X = sx(p.x), Y = sy(p.y);
      if (X < -10 || Y < -10 || X > w + 10 || Y > h + 10) continue;
      const r = Math.max(0.55, this.size[i] * dotScale * 0.9);
      const b = Math.min(BINS - 1, Math.floor(a * BINS));
      paths[b].moveTo(X + r, Y);
      paths[b].arc(X, Y, r, 0, Math.PI * 2);
      used[b] = true;
    }
    for (let b = 0; b < BINS; b++) if (used[b]) { ctx.fillStyle = `rgba(255,255,255,${(b + 0.5) / BINS})`; ctx.fill(paths[b]); }

    // Streams and packets.
    for (const m of this.movers) {
      const mid = { x: (m.from.x + m.to.x) / 2 - (m.to.y - m.from.y) * m.lift * 0.5, y: (m.from.y + m.to.y) / 2 + (m.to.x - m.from.x) * m.lift * 0.5 };
      for (let k = 0; k < m.trail; k++) {
        const t = ease.inOut(Math.min(1, Math.max(0, m.t - k * 0.025)));
        const q = m.path ? this.along(m, t) : null;
        const x = q ? q.x : (1 - t) ** 2 * m.from.x + 2 * (1 - t) * t * mid.x + t * t * m.to.x;
        const y = q ? q.y : (1 - t) ** 2 * m.from.y + 2 * (1 - t) * t * mid.y + t * t * m.to.y;
        const fade = m.trail > 1 ? 1 - k / m.trail : Math.min(1, m.t * 4) * (1 - Math.max(0, (m.t - 0.85) / 0.15));
        const r = Math.max(0.5, m.size * dotScale * 0.75 * (m.trail > 1 ? 1 - k * 0.08 : 1));
        ctx.fillStyle = `rgba(255,255,255,${Math.max(0, fade) * (m.trail > 1 ? 1 : 0.55)})`;
        ctx.beginPath();
        ctx.arc(sx(x), sy(y), r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}
