import "./style.css";
import type { Counts, PublicEvent } from "../shared/public";
import { describe, stationFor } from "./crew";
import { connect, type Status } from "./feed";
import { StudioScene } from "./scene";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const feedEl = $("feed");
const STATUS_TEXT: Record<Status, string> = { connecting: "Connecting", live: "Live", offline: "Reconnecting", demo: "Demo feed" };

const scene = new StudioScene($("stage"), $("labels"));
scene.start().then(
  () => { $("backend").textContent = scene.backend; },
  (e) => { $("backend").textContent = "No GPU"; console.error(e); },
);

function ago(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  return s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)}m` : s < 86400 ? `${Math.round(s / 3600)}h` : `${Math.round(s / 86400)}d`;
}

function addToFeed(e: PublicEvent): void {
  const li = document.createElement("li");
  li.className = `ev ev-${stationFor(e.actor).group}${e.ok === false || e.kind === "check.failed" ? " fail" : ""}`;
  li.innerHTML = `<span class="ev-text"></span><span class="ev-meta"><span class="ev-game"></span> · <time data-at="${e.at}">${ago(e.at)}</time></span>`;
  li.querySelector(".ev-text")!.textContent = describe(e);
  li.querySelector(".ev-game")!.textContent = e.game;
  feedEl.prepend(li);
  while (feedEl.children.length > 12) feedEl.lastElementChild!.remove();
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
    feedEl.replaceChildren();
    [...s.recent].reverse().forEach(addToFeed);
    if (s.counts) setCounts(s.counts);
  },
  event(e) {
    addToFeed(e);
    scene.play(e);
  },
  counts: setCounts,
});

setInterval(() => {
  for (const t of feedEl.querySelectorAll<HTMLTimeElement>("time[data-at]")) t.textContent = ago(t.dataset.at!);
  $("heat").style.setProperty("--heat", String(scene.heatLevel));
  $("heat-pct").textContent = `${Math.round(scene.heatLevel * 100)}%`;
}, 500);
