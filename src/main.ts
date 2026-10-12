import "./style.css";
import type { Counts, PublicEvent } from "../shared/public";
import { CREDIT } from "./credit";
import { CELLS, cellFor, describe, flow, schedule, weight, type CellId } from "./crew";
import { demoHistory } from "./demo";
import { connect, type Status } from "./feed";
import { Field } from "./field";
import { agent, outside, route, studio, type Studio } from "./levels";

type Level = "outside" | "studio" | "agent";
interface Route { level: Level; id?: CellId }

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const small = Math.min(innerWidth, innerHeight) < 700;
const field = new Field($("field"), small ? 2400 : 3600);

let history: PublicEvent[] = [];
let counts: Counts | null = null;
let demo = false;
let st: Studio = studio(field.width, field.height);
const build = () => (st = studio(field.width, field.height, history));
let current: Route = { level: "outside" };
let busy = false;
let queued: Route | null = null;

// ---------- routes ----------

function parse(): Route {
  const h = location.hash.slice(1);
  if (h === "studio") return { level: "studio" };
  const m = /^agent-(\w+)$/.exec(h);
  if (m && CELLS.some((c) => c.id === m[1])) return { level: "agent", id: m[1] as CellId };
  return { level: "outside" };
}
const hashFor = (r: Route) => (r.level === "outside" ? "" : r.level === "studio" ? "#studio" : `#agent-${r.id}`);
function navigate(r: Route): void {
  const want = hashFor(r);
  if (want === location.hash || (want === "" && location.hash === "")) return;
  if (want === "") history_replaceToRoot(); else location.hash = want;
}
// Clearing the hash with `location.hash = ""` leaves a bare "#"; push the root path instead.
function history_replaceToRoot(): void {
  window.history.pushState(null, "", location.pathname + location.search);
  go(parse());
}
addEventListener("hashchange", () => go(parse()));
addEventListener("popstate", () => go(parse()));

function show(level: Level | null): void {
  for (const l of ["outside", "studio", "agent"] as const) $(l).classList.toggle("on", l === level);
  if (level) document.body.dataset.level = level;
}

/** Moves between levels with the camera; a request made mid-flight runs after. */
async function go(to: Route): Promise<void> {
  if (busy) { queued = to; return; }
  const from = current;
  if (from.level === to.level && from.id === to.id) return;
  busy = true;
  try {
    if (from.level === "outside" && to.level !== "outside") await enterStudio();
    if (from.level === "agent" && to.level !== "agent") await leaveAgent();
    if (to.level === "outside" && from.level !== "outside") await exitStudio();
    if (to.level === "agent") await toAgent(to.id!, from.level === "agent");
    current = to;
  } finally {
    busy = false;
    if (queued) { const q = queued; queued = null; go(q); } else reform();
  }
}

/** Into the kiln's door: the camera dives in, the studio opens out of a point. */
async function enterStudio(): Promise<void> {
  const out = outside(field.width, field.height);
  show(null);
  field.surge(160);
  await field.camera({ x: out.opening.x, y: out.opening.y, s: out.diveZoom }, 1.7, "in");
  field.setStream(null);
  build();
  field.form(st.formation, { stagger: 0.7, from: st.core });
  field.settle(4);
  // Out of the small kiln at the root of the tree.
  field.cam = { x: st.core.x, y: st.core.y, s: st.coreZoom };
  current = { level: "studio" };
  placeAgents();
  refreshStates();
  await field.camera({ x: 0, y: 0, s: 1 }, 2, "expoOut");
  show("studio");
}

/** Back out of the door: the studio folds to a point, the kiln reappears around it. */
async function exitStudio(): Promise<void> {
  show(null);
  await field.camera({ x: st.core.x, y: st.core.y, s: st.coreZoom }, 1.4, "in");
  const out = outside(field.width, field.height);
  field.form(out.formation, { stagger: 0.3 });
  field.settle(0);
  field.cam = { x: out.opening.x, y: out.opening.y, s: out.diveZoom };
  field.setStream(out.opening, small ? 26 : 44);
  await field.camera({ x: 0, y: 0, s: 1 }, 2, "expoOut");
  show("outside");
}

async function toAgent(id: CellId, fromAgent: boolean): Promise<void> {
  show(null);
  const view = agent(field.width, field.height, st, id, eventsFor(id), history, Date.now());
  field.form(view.formation, { stagger: 0.45, from: st.agents[id] });
  dim(id);
  fillPanel(id);
  current = { level: "agent", id };
  await field.camera(view.camera, fromAgent ? 1.1 : 1.4, "inOut");
  show("agent");
}

async function leaveAgent(): Promise<void> {
  show(null);
  const id = current.id!;
  build();
  field.form(st.formation, { stagger: 0.35, from: st.agents[id] });
  dim(null);
  await field.camera({ x: 0, y: 0, s: 1 }, 1.3, "inOut");
  current = { level: "studio" };
  placeAgents();
  refreshStates();
  show("studio");
}

/** With an agent open, everything but it and its circuit home fades. */
function dim(id: CellId | null): void {
  for (const c of CELLS) {
    const on = !id || c.id === id;
    field.setGroup(c.id, { tAlpha: on ? 1 : 0.12, tScale: 1, spin: 0 });
    field.setGroup(`trace-${c.id}`, { tAlpha: on ? 1 : 0.15 });
    field.setGroup(`strip-${c.id}`, { tAlpha: !id ? 1 : on ? 0.5 : 0.08 });
    field.setGroup(`halo-${c.id}`, { tAlpha: on ? 1 : 0.1 });
  }
  for (const g of ["root", "trunk", "bus"]) field.setGroup(g, { tAlpha: id ? 0.6 : 1 });
}

// ---------- the studio's labels ----------

const buttons = new Map<CellId, HTMLButtonElement>();
for (const c of CELLS) {
  const b = document.createElement("button");
  b.className = "agent-btn";
  b.type = "button";
  b.innerHTML = `<span class="name"></span><span class="state"></span>`;
  b.querySelector(".name")!.textContent = c.short;
  b.setAttribute("aria-label", `${c.name}: see its work`);
  b.addEventListener("click", () => navigate({ level: "agent", id: c.id }));
  b.addEventListener("pointerenter", () => field.setGroup(c.id, { tScale: 1.22 }));
  b.addEventListener("pointerleave", () => field.setGroup(c.id, { tScale: 1 }));
  b.addEventListener("focus", () => field.setGroup(c.id, { tScale: 1.22 }));
  b.addEventListener("blur", () => field.setGroup(c.id, { tScale: 1 }));
  $("agents").appendChild(b);
  buttons.set(c.id, b);
}

/** Each row is one button: from the agent's figure across its label to the end of its activity strip. */
function placeAgents(): void {
  for (const c of CELLS) {
    const b = buttons.get(c.id)!;
    const g = st.agents[c.id], l = st.labels[c.id];
    const left = g.x - st.r - 8 + field.width / 2;
    b.style.left = `${left}px`;
    b.style.top = `${g.y - st.rowH / 2 + field.height / 2}px`;
    b.style.height = `${st.rowH}px`;
    b.style.width = `${st.stripX + (field.width < 640 ? 60 : 130) + field.width / 2 - left}px`;
    b.style.paddingLeft = `${l.x + field.width / 2 - left}px`;
  }
}

const until = (at: number, now: number) => {
  const m = Math.round((at - now) / 60_000);
  return m < 60 ? `${m}m` : m < 1440 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${Math.floor(m / 1440)}d ${Math.floor((m % 1440) / 60)}h`;
};
function ago(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)}m ago` : s < 86400 ? `${Math.round(s / 3600)}h ago` : `${Math.round(s / 86400)}d ago`;
}

const recentlyActive = new Map<CellId, number>();

function stateOf(id: CellId, now = Date.now()): { working: boolean; text: string } {
  const c = CELLS.find((x) => x.id === id)!;
  const { running, next } = schedule(c, now);
  const active = (recentlyActive.get(id) ?? 0) > now - 10 * 60_000;
  if (running || active) return { working: true, text: "working" };
  if (id === "owner") return { working: false, text: "on call" };
  return { working: false, text: next ? `next in ${until(next, now)}` : "idle" };
}

function refreshStates(): void {
  const now = Date.now();
  for (const c of CELLS) {
    const s = stateOf(c.id, now);
    const b = buttons.get(c.id)!;
    b.classList.toggle("working", s.working);
    b.querySelector(".state")!.textContent = s.text;
    if (current.level === "studio" && !busy) field.setGroup(c.id, { spin: s.working && !field.reduced ? 0.35 : 0 });
  }
  $("counts").textContent = counts ? `${counts.ready} ready · ${counts.openPRs} prs · ${counts.approvals} waiting` : "";
  if (current.level === "agent" && current.id) fillFacts(current.id);
}
setInterval(refreshStates, 15_000);

// ---------- the agent panel ----------

const eventsFor = (id: CellId) => history.filter((e) => cellFor(e) === id);
const localTime = (h: number, m: number) => {
  const d = new Date();
  d.setUTCHours(h, m, 0, 0);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function fillFacts(id: CellId): void {
  const c = CELLS.find((x) => x.id === id)!;
  const evs = eventsFor(id);
  $("a-state").textContent = stateOf(id).text;
  $("a-runs").textContent = c.times.length
    ? `${c.times.map(([h, m]) => localTime(h, m)).join(", ")}${c.days ? ` · ${c.days.map((d) => DAYS[d]).join(", ")}` : " · daily"}`
    : "Whenever there's something to decide";
  $("a-count").textContent = `${evs.length} since 7 Oct`;
  $("a-last").textContent = evs[0] ? `${describe(evs[0]).toLowerCase()} · ${ago(evs[0].at)}` : "nothing yet";
}

function fillPanel(id: CellId): void {
  const i = CELLS.findIndex((x) => x.id === id);
  const c = CELLS[i];
  $("a-index").textContent = `AGENT ${String(i + 1).padStart(2, "0")} / ${CELLS.length}`;
  $("a-name").textContent = c.name;
  $("a-role").textContent = c.role;
  $("crumb-agent").textContent = `/ ${c.short}`;
  fillFacts(id);
  const legend = $("a-legend");
  legend.replaceChildren();
  for (const sample of [{ kind: "pr.merged" }, { kind: "issue.opened" }, { kind: "issue.labelled" }, { kind: "check.failed", ok: false }] as PublicEvent[]) {
    const w = weight(sample);
    const row = document.createElement("span");
    const dot = document.createElement("i");
    const px = 2 + w.size * 2.2;
    dot.style.width = dot.style.height = `${px}px`;
    dot.style.opacity = String(w.alpha);
    row.append(dot, document.createTextNode(w.label));
    legend.appendChild(row);
  }
  const list = $("a-recent");
  list.replaceChildren();
  const evs = eventsFor(id).slice(0, 14);
  if (!evs.length) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "Nothing yet. Its first run will show here.";
    list.appendChild(li);
  }
  for (const e of evs) {
    const li = document.createElement("li");
    const what = document.createElement("span");
    what.textContent = `${describe(e)}${e.game === "factory" ? "" : ` · ${e.game}`}`;
    const when = document.createElement("time");
    when.dateTime = e.at;
    when.textContent = ago(e.at);
    li.append(what, when);
    list.appendChild(li);
  }
  const prev = CELLS[(i + CELLS.length - 1) % CELLS.length], next = CELLS[(i + 1) % CELLS.length];
  $("a-prev").setAttribute("href", `#agent-${prev.id}`);
  $("a-prev").querySelector("span")!.textContent = prev.short;
  $("a-next").setAttribute("href", `#agent-${next.id}`);
  $("a-next").querySelector("span")!.textContent = next.short;
  [...document.querySelectorAll<HTMLElement>(".panel > *")].forEach((el, k) => el.style.setProperty("--i", String(k)));
}

// ---------- live data ----------

const sameEvent = (a: PublicEvent, b: PublicEvent) => a.kind === b.kind && a.item === b.item && a.at.slice(0, 16) === b.at.slice(0, 16);

function onEvent(e: PublicEvent): void {
  if (!history.some((x) => sameEvent(x, e))) history = [e, ...history].sort((a, b) => b.at.localeCompare(a.at));
  const id = cellFor(e);
  if (id) recentlyActive.set(id, Date.now());
  const failed = e.ok === false || e.kind === "check.failed";
  if (current.level === "outside") {
    field.surge(failed ? 10 : 40);
  } else if (current.level === "studio" && !busy) {
    const [a, b] = flow(e);
    field.pulse(route(st, a, b), failed ? 1.1 : 1.7);
    if (id) {
      field.setGroup(id, { tScale: 1.35 });
      setTimeout(() => field.setGroup(id, { tScale: 1 }), 450);
      if (failed) field.scatter(id);
    }
  } else if (current.level === "agent" && current.id && id === current.id && !busy) {
    const view = agent(field.width, field.height, st, current.id, eventsFor(current.id), history, Date.now());
    field.form(view.formation, { stagger: 0.2, from: st.agents[current.id] });
    fillPanel(current.id);
    field.pulse(st.up[current.id], 1.4);
    if (failed) field.scatter(current.id);
  }
  refreshStates();
}

let historyStale = false;

/** Redraws the current level with the latest history (strips, rings). Waits out any camera move. */
function reform(): void {
  if (!historyStale) return;
  historyStale = false;
  if (current.level === "studio") { build(); field.form(st.formation, { stagger: 0.3, from: st.core }); }
  if (current.level === "agent" && current.id) {
    build();
    const view = agent(field.width, field.height, st, current.id, eventsFor(current.id), history, Date.now());
    field.form(view.formation, { stagger: 0.3, from: st.agents[current.id] });
    dim(current.id);
    fillPanel(current.id);
  }
}

async function loadHistory(): Promise<void> {
  try {
    const res = await fetch("/api/history");
    if (!res.ok || !res.headers.get("content-type")?.includes("json")) throw new Error(String(res.status));
    history = ((await res.json()) as { events: PublicEvent[] }).events;
  } catch {
    if (!history.length) { history = demoHistory(Date.now()); demo = true; }
  }
  historyStale = true;
  if (!busy) reform();
  refreshStates();
}

const STATUS: Record<Status, string> = { connecting: "connecting", live: "live", offline: "reconnecting", demo: "demo data" };
connect({
  status(s) {
    if (s === "demo") demo = true;
    const shown = s === "live" ? s : demo ? "demo" : s;
    $("status").dataset.state = shown;
    $("status").textContent = STATUS[shown];
  },
  snapshot(s) {
    for (const e of s.recent) if (!history.some((x) => sameEvent(x, e))) history.push(e);
    history.sort((a, b) => b.at.localeCompare(a.at));
    if (s.counts) counts = s.counts;
    refreshStates();
  },
  event: onEvent,
  counts(c) { counts = c; refreshStates(); },
  history: loadHistory,
});

// ---------- start ----------

if (CREDIT.name) {
  const p = $("credit");
  const a = document.createElement("a");
  a.href = CREDIT.href;
  a.rel = "me noopener";
  a.target = "_blank";
  a.textContent = CREDIT.name;
  p.append(document.createTextNode("Built by "), a);
  p.hidden = false;
}

$("enter").addEventListener("click", () => navigate({ level: "studio" }));
$("field").addEventListener("click", () => { if (current.level === "outside" && !busy) navigate({ level: "studio" }); });
$("field").style.cursor = "pointer";
addEventListener("keydown", (e) => {
  if (e.key === "Escape") navigate(current.level === "agent" ? { level: "studio" } : { level: "outside" });
  if (current.level === "agent" && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
    const i = CELLS.findIndex((c) => c.id === current.id);
    navigate({ level: "agent", id: CELLS[(i + (e.key === "ArrowRight" ? 1 : CELLS.length - 1)) % CELLS.length].id });
  }
});

let resizeTimer = 0;
addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    if (busy) return;
    build();
    placeAgents();
    if (current.level === "outside") { const o = outside(field.width, field.height); field.form(o.formation, { stagger: 0.2 }); field.setStream(o.opening, small ? 26 : 44); }
    if (current.level === "studio") field.form(st.formation, { stagger: 0.2 });
    if (current.level === "agent" && current.id) { const v = agent(field.width, field.height, st, current.id, eventsFor(current.id), history, Date.now()); field.form(v.formation, { stagger: 0.2 }); dim(current.id); field.cam = v.camera; }
  }, 150);
});

/** First paint: the field gathers out of dust and the camera settles. */
async function start(): Promise<void> {
  const route = parse();
  busy = true;
  if (route.level === "outside") {
    const o = outside(field.width, field.height);
    field.form(o.formation, { stagger: 1.2, from: o.opening });
    field.setStream(o.opening, small ? 26 : 44);
    field.cam = { x: 0, y: 0, s: 0.7 };
    show("outside");
    await field.camera({ x: 0, y: 0, s: 1 }, 2.4, "expoOut");
  } else {
    build();
    field.form(st.formation, { stagger: 0.8, from: st.core });
    placeAgents();
    current = { level: "studio" };
    refreshStates();
    field.cam = { x: 0, y: 0, s: 0.6 };
    await field.camera({ x: 0, y: 0, s: 1 }, 1.6, "expoOut");
    show("studio");
  }
  busy = false;
  reform();
  // Anything asked for during the intro (a click, a changed hash) runs now.
  const next = queued ?? (route.level === "agent" ? route : null);
  queued = null;
  if (next) await go(next);
}

let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  field.step(dt);
  field.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
loadHistory();
start();

// Dev only: step the clock by hand, for checking motion when the page isn't painting.
if (import.meta.env.DEV) Object.assign(window, { kilnStep: (seconds: number, fps = 30) => { for (let i = 0; i < seconds * fps; i++) field.step(1 / fps); field.render(); } });
