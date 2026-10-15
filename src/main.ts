import "./style.css";
import { isServices, type Counts, type PublicEvent, type Service } from "../shared/public";
import { CREDIT } from "./credit";
import { CELLS, cellFor, describe, flow, schedule, weight, type CellId } from "./crew";
import { demoHistory, demoServices } from "./demo";
import { connect, type Status } from "./feed";
import { Field } from "./field";
import { agent, constellation, outside, route, services, studio, type Services, type Studio } from "./levels";
import { markSvg } from "./mark";
import type { Pt } from "./shapes";
import { AMBIENT, approach, target } from "./temp";

type Level = "outside" | "studio" | "agent" | "services";
type View = "tree" | "sky";
interface Route { level: Level; id?: CellId; view?: View }

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const small = Math.min(innerWidth, innerHeight) < 700;
const field = new Field($("field"), small ? 3400 : 4000);

let history: PublicEvent[] = [];
let counts: Counts | null = null;
let demo = false;
let st: Studio = studio(field.width, field.height);
let svcList: Service[] = [];
let sv: Services = services(field.width, field.height, []);
/** The agents level shows as a folder tree (the default) or a constellation. */
let view: View = "tree";
/** The owner first, then whoever runs next: anyone in a run window now, then the soonest scheduled. Follows the schedule only, so rows move when runs start and end, not on every event. */
let order: CellId[] = CELLS.map((c) => c.id);
function agentOrder(now = Date.now()): CellId[] {
  const rest = CELLS.filter((c) => c.id !== "owner").map((c) => ({ id: c.id, key: schedule(c, now).running ? -1 : schedule(c, now).next ?? Infinity }));
  return ["owner", ...rest.sort((a, b) => a.key - b.key).map((x) => x.id)];
}
const build = () => {
  order = agentOrder();
  st = (view === "sky" ? constellation : studio)(field.width, field.height, history, Date.now(), order);
};
let current: Route = { level: "outside" };
let busy = false;
let queued: Route | null = null;

// ---------- scrolling, on phones ----------
// The agents level can be taller than a phone's screen. The document scrolls
// over a spacer; the camera and the labels follow the scroll.

const spacer = $("scroll-space");
let savedScroll = 0;

function updateScroll(): void {
  const total = st.contentBottom + field.height / 2 + 120; // room for the view switch
  const on = current.level === "studio" && field.width < 640 && total > field.height;
  document.body.classList.toggle("scroll", on);
  spacer.style.height = on ? `${total}px` : "0px";
  followScroll(true);
}

/** The camera and labels track the page scroll; during a camera move only when asked. */
function followScroll(force = false): void {
  if (current.level !== "studio" || (busy && !force)) return;
  const y = document.body.classList.contains("scroll") ? window.scrollY : 0;
  field.cam = { x: 0, y, s: 1 };
  $("agents").style.transform = `translateY(${-y}px)`;
}
addEventListener("scroll", () => followScroll(), { passive: true });

/** Leaves the scrollable level: remembers where it was and pins the page. */
function pinScroll(): void {
  savedScroll = document.body.classList.contains("scroll") ? window.scrollY : 0;
  document.body.classList.remove("scroll");
  spacer.style.height = "0px";
  $("agents").style.transform = "";
}

// ---------- routes ----------

function parse(): Route {
  const h = location.hash.slice(1);
  if (h === "studio") return { level: "studio", view: "tree" };
  if (h === "constellation") return { level: "studio", view: "sky" };
  if (h === "services") return { level: "services" };
  const m = /^agent-(\w+)$/.exec(h);
  if (m && CELLS.some((c) => c.id === m[1])) return { level: "agent", id: m[1] as CellId };
  return { level: "outside" };
}
const studioHash = (v: View) => (v === "sky" ? "#constellation" : "#studio");
const hashFor = (r: Route) => (r.level === "outside" ? "" : r.level === "studio" ? studioHash(r.view ?? view) : r.level === "services" ? "#services" : `#agent-${r.id}`);
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
  for (const l of ["outside", "studio", "agent", "services"] as const) $(l).classList.toggle("on", l === level);
  if (level) document.body.dataset.level = level;
  if (level) for (const [id, on] of [["crumb-studio", level === "studio"], ["crumb-services", level === "services"]] as const) {
    if (on) $(id).setAttribute("aria-current", "page"); else $(id).removeAttribute("aria-current");
  }
}

/** Moves between levels with the camera; a request made mid-flight runs after. */
async function go(to: Route): Promise<void> {
  if (busy) { queued = to; return; }
  const from = current;
  const switching = to.level === "studio" && to.view && to.view !== view;
  if (from.level === to.level && from.id === to.id && !switching) return;
  busy = true;
  try {
    if (to.view && to.view !== view) {
      view = to.view;
      syncViewControls();
      if (from.level === "studio") await switchView();
    }
    if (from.level === "outside" && (to.level === "studio" || to.level === "agent")) await enterStudio(outside(field.width, field.height).center, 1.1, 1.9);
    if (from.level === "services" && to.level === "studio") await enterStudio(sv.core, 0.9, 1.3);
    if (from.level === "services" && to.level === "agent") build();
    if (from.level === "agent" && (to.level === "studio" || to.level === "outside")) await leaveAgent();
    if (to.level === "services") await toServices(from.level);
    if (to.level === "outside" && from.level !== "outside") await exitStudio(from.level === "services" ? sv.core : st.core);
    if (to.level === "agent") await toAgent(to.id!, from.level === "agent");
    current = to;
  } finally {
    busy = false;
    if (queued) { const q = queued; queued = null; go(q); } else reform();
  }
}

/** Enter: the mark's (or the services') dots fly apart and re-form as the agents. */
async function enterStudio(from: Pt, stagger: number, wait: number): Promise<void> {
  show(null);
  build();
  field.form(st.formation, { stagger, from });
  dim(null);
  current = { level: "studio" };
  placeAgents();
  refreshStates();
  window.scrollTo(0, 0);
  await field.wait(wait);
  show("studio");
  updateScroll();
}

/** Back outside: the agents (or services) gather back into the mark. */
async function exitStudio(from: Pt): Promise<void> {
  show(null);
  pinScroll();
  const out = outside(field.width, field.height);
  field.form(out.formation, { stagger: 1, from });
  await Promise.all([field.camera({ x: 0, y: 0, s: 1 }, 0.8, "inOut"), field.wait(1.8)]);
  show("outside");
}

/** To the services: the dots re-form as one row per service, with its uptime. */
async function toServices(from: Level): Promise<void> {
  show(null);
  pinScroll();
  window.scrollTo(0, 0);
  sv = services(field.width, field.height, svcList, Date.now());
  const fromOutside = from === "outside";
  field.form(sv.formation, { stagger: fromOutside ? 1.1 : 0.9, from: fromOutside ? outside(field.width, field.height).center : st.core });
  current = { level: "services" };
  placeServices();
  refreshServices();
  await Promise.all([field.camera({ x: 0, y: 0, s: 1 }, 0.9, "inOut"), field.wait(fromOutside ? 1.9 : 1.3)]);
  show("services");
}

/** Folder ⇄ constellation: the same dots fly from one arrangement to the other. */
async function switchView(): Promise<void> {
  show(null);
  pinScroll();
  window.scrollTo(0, 0);
  build();
  field.form(st.formation, { stagger: 0.9, from: st.core });
  dim(null);
  placeAgents();
  refreshStates();
  await field.camera({ x: 0, y: 0, s: 1 }, 0.9, "inOut");
  show("studio");
  updateScroll();
}

function syncViewControls(): void {
  for (const a of document.querySelectorAll<HTMLAnchorElement>("[data-view]")) {
    if (a.dataset.view === view) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  }
  $("agents").dataset.view = view;
  $("crumb-studio").setAttribute("href", studioHash(view));
}

async function toAgent(id: CellId, fromAgent: boolean): Promise<void> {
  show(null);
  if (!fromAgent) pinScroll();
  const v = agent(field.width, field.height, st, id, eventsFor(id), Date.now());
  field.form(v.formation, { stagger: 0.7, from: fromAgent ? v.formation.groups[id] : st.agents[id] });
  dim(id);
  fillPanel(id);
  current = { level: "agent", id };
  await Promise.all([field.camera(v.camera, 0.9, "inOut"), field.wait(1.3)]);
  show("agent");
}

async function leaveAgent(): Promise<void> {
  show(null);
  build();
  field.form(st.formation, { stagger: 0.7, from: { x: 0, y: 0 } });
  dim(null);
  // Back to where the list was scrolled.
  await Promise.all([field.camera({ x: 0, y: savedScroll, s: 1 }, 0.9, "inOut"), field.wait(1.3)]);
  current = { level: "studio" };
  placeAgents();
  refreshStates();
  show("studio");
  updateScroll();
  window.scrollTo(0, savedScroll);
  followScroll(true);
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
  for (const g of Object.keys(st.formation.groups)) if (g.startsWith("edge-")) field.setGroup(g, { tAlpha: !id || g.split("-").includes(id) ? 1 : 0.1 });
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
  const W = field.width / 2, H = field.height / 2;
  for (const c of CELLS) {
    const b = buttons.get(c.id)!;
    const g = st.agents[c.id], l = st.labels[c.id];
    if (st.kind === "sky") {
      // A caption under the star; the button covers the star and its caption.
      b.style.left = `${g.x + W - 80}px`;
      b.style.top = `${g.y + H - st.r * 1.4}px`;
      b.style.width = "160px";
      b.style.height = "auto";
      b.style.paddingLeft = "0";
      b.style.paddingTop = `${st.r * 3}px`;
      continue;
    }
    // A row: from the agent's figure across its label to the end of its activity strip.
    const left = g.x - st.r - 10 + W;
    b.style.left = `${left}px`;
    b.style.top = `${g.y - st.rowH / 2 + H}px`;
    b.style.height = `${st.rowH}px`;
    b.style.width = `${st.stripX + (field.width < 640 ? 76 : 190) + W - left}px`;
    b.style.paddingLeft = `${l.x + W - left}px`;
    b.style.paddingTop = "0";
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
  const next = agentOrder(now);
  if (next.join() !== order.join() && current.level === "studio" && view === "tree" && !busy) {
    build();
    field.form(st.formation, { stagger: 0.5 });
    placeAgents();
  }
  if (current.level === "agent" && current.id) fillFacts(current.id);
  kilnTarget();
}
setInterval(refreshStates, 15_000);

// ---------- internal temp ----------
// Cosmetic: recent activity heats the kiln, quiet lets it cool (src/temp.ts).

let kilnF = AMBIENT;
let kilnGoal = AMBIENT;
let kilnPainted = 0;
const kilnTarget = () => (kilnGoal = target(history, CELLS.filter((c) => stateOf(c.id).working).length));

function stepKiln(dt: number, now: number): void {
  kilnF = approach(kilnF, kilnGoal, dt);
  if (now - kilnPainted < 200) return;
  kilnPainted = now;
  // A little flicker once it's hot, like a pyrometer near a flame.
  const shown = Math.round(kilnF + (kilnF > 600 && !field.reduced ? Math.sin(now / 370) * 3 + Math.sin(now / 1130) * 4 : 0));
  $("temp-f").textContent = `${shown.toLocaleString()}°F`;
}

// ---------- the services' labels ----------

const svcRows = new Map<string, HTMLDivElement>();

/** One row per service, laid out like an agent's: figure, name and state, uptime strip. */
function placeServices(): void {
  const W = field.width / 2, H = field.height / 2;
  for (const [id, el] of svcRows) if (!svcList.some((s) => s.id === id)) { el.remove(); svcRows.delete(id); }
  for (const s of svcList) {
    let el = svcRows.get(s.id);
    if (!el) {
      el = document.createElement("div");
      el.className = "agent-btn";
      el.setAttribute("role", "group");
      el.innerHTML = `<span class="name"></span><span class="state"></span>`;
      $("service-rows").appendChild(el);
      svcRows.set(s.id, el);
    }
    const g = sv.rows[s.id], l = sv.labels[s.id];
    if (!g) continue;
    const left = g.x - sv.r - 10 + W;
    el.style.left = `${left}px`;
    el.style.top = `${g.y - sv.rowH / 2 + H}px`;
    el.style.height = `${sv.rowH}px`;
    el.style.width = `${sv.stripX + sv.days * sv.colW + W - left}px`;
    el.style.paddingLeft = `${l.x + W - left}px`;
  }
}

/** Uptime over the days the strip shows, rounded down so a bad day never reads as 100%. */
function uptime(s: Service): string | null {
  const shown = s.days.slice(-sv.days);
  const checks = shown.reduce((a, d) => a + d.checks, 0);
  if (!checks) return null;
  const pct = (shown.reduce((a, d) => a + d.up + d.degraded * 0.5, 0) / checks) * 100;
  return pct === 100 ? "100%" : `${Math.min(99.99, Math.floor(pct * 100) / 100)}%`;
}

function refreshServices(): void {
  for (const s of svcList) {
    const el = svcRows.get(s.id);
    if (!el) continue;
    const pct = uptime(s);
    el.dataset.state = s.state ?? "unknown";
    el.querySelector(".name")!.textContent = s.name;
    el.querySelector(".state")!.textContent = s.state ? `${s.state}${pct ? ` · ${pct}` : ""}` : "not checked yet";
    el.setAttribute("aria-label", `${s.name}: ${s.state ?? "not checked yet"}${pct ? `, ${pct} uptime over ${sv.days} days` : ""}${s.checkedAt ? `, checked ${ago(s.checkedAt)}` : ""}`);
    el.title = s.checkedAt ? `checked ${ago(s.checkedAt)}` : "";
  }
}

let servicesStale = false;
function redrawServices(): void {
  servicesStale = false;
  sv = services(field.width, field.height, svcList, Date.now());
  field.form(sv.formation, { stagger: 0.3, from: sv.core, stable: true });
  placeServices();
  refreshServices();
}

function onServices(list: Service[]): void {
  const wasDown = new Set(svcList.filter((s) => s.state === "down").map((s) => s.id));
  svcList = list;
  if (current.level !== "services") return;
  if (busy) { servicesStale = true; return; }
  redrawServices();
  for (const s of list) if (s.state === "down" && !wasDown.has(s.id)) field.scatter(s.id);
}

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
  const i = order.indexOf(id);
  const c = CELLS.find((x) => x.id === id)!;
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
  const at = (k: number) => CELLS.find((x) => x.id === order[(k + order.length) % order.length])!;
  const prev = at(i - 1), next = at(i + 1);
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
    field.setGroup("logo", { tScale: 1.03 });
    setTimeout(() => field.setGroup("logo", { tScale: 1 }), 500);
    if (failed) field.scatter("logo");
  } else if (current.level === "studio" && !busy) {
    const [a, b] = flow(e);
    field.pulse(route(st, a, b), failed ? 1.1 : 1.7);
    if (id) {
      field.setGroup(id, { tScale: 1.35 });
      setTimeout(() => field.setGroup(id, { tScale: 1 }), 450);
      if (failed) field.scatter(id);
    }
  } else if (current.level === "agent" && current.id && id === current.id && !busy) {
    const view = agent(field.width, field.height, st, current.id, eventsFor(current.id), Date.now());
    field.form(view.formation, { stagger: 0.2, from: st.agents[current.id], stable: true });
    fillPanel(current.id);
    field.pulse(st.up[current.id], 1.4);
    if (failed) field.scatter(current.id);
  }
  refreshStates();
}

let historyStale = false;
let historyLoaded: () => void = () => {};
const historyReady = new Promise<void>((r) => (historyLoaded = r));

/** Redraws the current level with the latest history (strips, rings). Waits out any camera move. */
function reform(): void {
  if (servicesStale && current.level === "services") redrawServices();
  if (!historyStale) return;
  historyStale = false;
  if (current.level === "studio") { build(); field.form(st.formation, { stagger: 0.3, from: st.core, stable: true }); }
  if (current.level === "agent" && current.id) {
    build();
    const view = agent(field.width, field.height, st, current.id, eventsFor(current.id), Date.now());
    field.form(view.formation, { stagger: 0.3, from: st.agents[current.id], stable: true });
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
  historyLoaded();
  if (!busy) reform();
  refreshStates();
}

let servicesLoaded: () => void = () => {};
const servicesReady = new Promise<void>((r) => (servicesLoaded = r));

async function loadServices(): Promise<void> {
  try {
    const res = await fetch("/api/services");
    if (!res.ok || !res.headers.get("content-type")?.includes("json")) throw new Error(String(res.status));
    const list = ((await res.json()) as { services: unknown }).services;
    if (!isServices(list)) throw new Error("not services");
    svcList = list;
  } catch {
    if (!svcList.length) { svcList = demoServices(Date.now()); demo = true; }
  }
  servicesLoaded();
  if (current.level === "services") { if (busy) servicesStale = true; else redrawServices(); }
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
  services: onServices,
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

$("brand").insertAdjacentHTML("afterbegin", markSvg(24, 6));
$("enter").addEventListener("click", () => navigate({ level: "studio" }));
syncViewControls();
$("field").addEventListener("click", () => { if (current.level === "outside" && !busy) navigate({ level: "studio" }); });
$("field").style.cursor = "pointer";
addEventListener("keydown", (e) => {
  if (e.key === "Escape") navigate(current.level === "agent" ? { level: "studio" } : { level: "outside" });
  if (current.level === "agent" && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
    const i = order.indexOf(current.id!);
    navigate({ level: "agent", id: order[(i + (e.key === "ArrowRight" ? 1 : order.length - 1)) % order.length] });
  }
});

let resizeTimer = 0;
addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(function relayout() {
    // Mid-move, try again shortly rather than dropping the resize.
    if (busy) { resizeTimer = window.setTimeout(relayout, 300); return; }
    build();
    placeAgents();
    if (current.level === "studio") updateScroll();
    if (current.level === "outside") field.form(outside(field.width, field.height).formation, { stagger: 0.2 });
    if (current.level === "studio") field.form(st.formation, { stagger: 0.2 });
    if (current.level === "services") { sv = services(field.width, field.height, svcList, Date.now()); field.form(sv.formation, { stagger: 0.2 }); placeServices(); }
    if (current.level === "agent" && current.id) { const v = agent(field.width, field.height, st, current.id, eventsFor(current.id), Date.now()); field.form(v.formation, { stagger: 0.2 }); dim(current.id); field.cam = v.camera; }
  }, 150);
});

/** First paint: the field gathers out of dust and the camera settles. */
async function start(): Promise<void> {
  const route = parse();
  if (route.view) { view = route.view; syncViewControls(); }
  busy = true;
  if (route.level === "outside") {
    // The dust gathers into the mark.
    const o = outside(field.width, field.height);
    field.form(o.formation, { stagger: 1.4, from: o.center });
    show("outside");
    await field.wait(1.6);
  } else if (route.level === "services") {
    // A direct link to the services: wait (briefly) for their checks.
    await Promise.race([servicesReady, new Promise((r) => setTimeout(r, 1500))]);
    servicesStale = false;
    sv = services(field.width, field.height, svcList, Date.now());
    field.form(sv.formation, { stagger: 0.8, from: sv.core });
    current = { level: "services" };
    placeServices();
    refreshServices();
    await field.wait(1.4);
    show("services");
  } else {
    // A direct link to the agents: wait (briefly) for the history, so the first
    // draw already has it and nothing redraws a moment later.
    await Promise.race([historyReady, new Promise((r) => setTimeout(r, 1500))]);
    historyStale = false;
    build();
    field.form(st.formation, { stagger: 0.8, from: st.core });
    placeAgents();
    current = { level: "studio" };
    refreshStates();
    await field.wait(1.4);
    show("studio");
  }
  busy = false;
  if (current.level === "studio") updateScroll();
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
  stepKiln(dt, now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
loadHistory();
loadServices();
setInterval(() => { if (current.level === "services") refreshServices(); }, 30_000);
start();

// Dev only: step the clock by hand, for checking motion when the page isn't painting.
if (import.meta.env.DEV) Object.assign(window, { kilnField: field, kilnStep: (seconds: number, fps = 30) => { for (let i = 0; i < seconds * fps; i++) field.step(1 / fps); field.render(); } });
