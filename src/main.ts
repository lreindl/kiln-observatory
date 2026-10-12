import "./style.css";
import * as THREE from "three/webgpu";
import type { Counts, PublicEvent } from "../shared/public";
import { CELLS, ROOMY, cellFor, describe, schedule, type Cell, type CellId } from "./crew";
import { connect, type Status } from "./feed";
import { OFFICES } from "./offices";
import type { Office } from "./offices/kit";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const STATUS_TEXT: Record<Status, string> = { connecting: "Connecting", live: "Live", offline: "Reconnecting", demo: "Demo feed" };

interface Room { cell: Cell; el: HTMLElement; office: Office | null; state: HTMLElement; last: HTMLElement; lastAt: string | null }

// ---------- the grid ----------

const grid = $("grid");
const rooms = new Map<CellId, Room>();
for (const cell of CELLS) {
  const el = document.createElement("article");
  el.className = "cell";
  el.style.setProperty("--accent", cell.accent);
  el.dataset.id = cell.id;
  el.tabIndex = 0;
  el.setAttribute("aria-label", `${cell.name}: ${cell.role}. Select to preview its work.`);
  el.innerHTML = `
    <header><h2></h2><p class="role"></p><a class="expand" aria-label="Open this office on its own">⤢</a></header>
    <footer><span class="state"></span><span class="last"></span></footer>`;
  el.querySelector("h2")!.textContent = cell.name;
  el.querySelector(".role")!.textContent = cell.role;
  const expand = el.querySelector<HTMLAnchorElement>(".expand")!;
  expand.href = `#${cell.id}`;
  expand.addEventListener("click", (e) => e.stopPropagation());
  grid.appendChild(el);
  const factory = OFFICES[cell.id];
  const room: Room = { cell, el, office: factory ? factory({ reduced }) : null, state: el.querySelector(".state")!, last: el.querySelector(".last")!, lastAt: null };
  rooms.set(cell.id, room);
  const preview = () => { room.office?.play(null); el.classList.add("preview"); setTimeout(() => el.classList.remove("preview"), 6500); };
  el.addEventListener("click", preview);
  el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); preview(); } });
}

/** `#<office>` shows one office on its own; anything else shows them all. */
function focused(): CellId | null {
  const id = location.hash.slice(1) as CellId;
  return rooms.has(id) ? id : null;
}

/** Columns by width; when ten cells don't divide evenly, the roomiest cells span two columns. */
function layout(): void {
  const only = focused();
  document.body.classList.toggle("focus", !!only);
  for (const [id, room] of rooms) room.el.hidden = !!only && id !== only;
  $("all").hidden = !only;
  if (only) {
    grid.style.gridTemplateColumns = "1fr";
    grid.style.gridAutoRows = `${innerHeight - $("bar").offsetHeight - 12}px`;
    rooms.get(only)!.el.style.gridColumn = "";
    return;
  }
  const w = innerWidth;
  const cols = w >= 1500 ? 5 : w >= 1080 ? 4 : w >= 720 ? 3 : w >= 440 ? 2 : 1;
  const extra = cols > 1 ? (cols - (CELLS.length % cols)) % cols : 0;
  const rows = Math.ceil((CELLS.length + extra) / cols);
  grid.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
  const fit = (innerHeight - $("bar").offsetHeight - 12) / rows;
  grid.style.gridAutoRows = `${Math.max(cols === 1 ? Math.min(w * 0.8, 420) : 230, cols === 1 ? 0 : fit)}px`;
  for (const [i, id] of ROOMY.entries()) rooms.get(id)!.el.style.gridColumn = i < extra ? "span 2" : "";
}
addEventListener("resize", layout);
addEventListener("hashchange", layout);
addEventListener("keydown", (e) => { if (e.key === "Escape" && focused()) location.hash = ""; });
layout();

// ---------- one renderer, scissored into each cell ----------

const canvasHost = $("stage");
const renderer = new THREE.WebGPURenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.setClearColor(0x05060b, 1);
canvasHost.appendChild(renderer.domElement);
const resize = () => renderer.setSize(innerWidth, innerHeight);
addEventListener("resize", resize);
resize();

const timer = new THREE.Timer();
let clockTick = 0;
renderer.init().then(() => {
  // WebGPU measures viewport and scissor Y from the top; WebGL from the bottom.
  const webgpu = !!(renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend;
  $("backend").textContent = webgpu ? "WebGPU" : "WebGL 2";
  const frame = (dt: number) => {
    const now = Date.now();
    renderer.setScissorTest(false);
    renderer.clear();
    renderer.setScissorTest(true);
    const H = innerHeight;
    for (const room of rooms.values()) {
      if (!room.office || room.el.hidden) continue;
      const r = room.el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > H || r.width < 2) continue;
      const { running } = schedule(room.cell, now);
      room.office.frame(dt, r.width / r.height, running);
      const y = webgpu ? r.top : H - r.bottom;
      renderer.setViewport(r.left, y, r.width, r.height);
      renderer.setScissor(r.left, y, r.width, r.height);
      renderer.render(room.office.scene, room.office.camera);
    }
    if ((clockTick += dt) > 1) { clockTick = 0; refreshText(now); }
  };
  renderer.setAnimationLoop((time) => {
    timer.update(time);
    frame(Math.min(timer.getDelta(), 0.1));
  });
  // Dev only: step the clock by hand, for checking animations when the page isn't painting.
  if (import.meta.env.DEV) Object.assign(window, { kilnStep: (seconds: number, fps = 30) => { for (let i = 0; i < seconds * fps; i++) frame(1 / fps); } });
}, (e) => { $("backend").textContent = "No GPU"; console.error(e); });

// ---------- text ----------

function ago(iso: string, now: number): string {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)}m ago` : s < 86400 ? `${Math.round(s / 3600)}h ago` : `${Math.round(s / 86400)}d ago`;
}
const until = (at: number, now: number) => {
  const m = Math.round((at - now) / 60_000);
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
};

function refreshText(now: number): void {
  for (const room of rooms.values()) {
    const { running, next } = schedule(room.cell, now);
    const working = (room.office?.busy ?? 0) > 0.5;
    room.el.classList.toggle("working", working || running);
    room.state.textContent = working || running ? "Working" : next ? `Next run in ${until(next, now)}` : room.cell.id === "owner" ? "On call" : "Idle";
    if (room.lastAt) room.last.dataset.ago = ago(room.lastAt, now);
  }
}

function record(id: CellId, e: PublicEvent): void {
  const room = rooms.get(id)!;
  room.last.textContent = `${describe(e)}${e.game === "factory" ? "" : ` · ${e.game}`}`;
  room.lastAt = e.at;
  room.last.dataset.ago = ago(e.at, Date.now());
}

function setCounts(c: Counts): void {
  $("c-ready").textContent = String(c.ready);
  $("c-prs").textContent = String(c.openPRs);
  $("c-approvals").textContent = String(c.approvals);
}

connect({
  status(s) {
    const el = $("status");
    el.dataset.state = s;
    el.textContent = STATUS_TEXT[s];
  },
  snapshot(s) {
    for (const e of [...s.recent].reverse()) { const id = cellFor(e); if (id) record(id, e); }
    if (s.counts) setCounts(s.counts);
  },
  event(e) {
    const id = cellFor(e);
    if (!id) return;
    record(id, e);
    rooms.get(id)!.office?.play(e);
  },
  counts: setCounts,
});
