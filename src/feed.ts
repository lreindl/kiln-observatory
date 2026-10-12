// The live connection. If the studio can't be reached and nothing has arrived
// yet, a clearly labelled demo feed keeps the scene alive while it retries.

import { AGENTS, isCounts, isPublicEvent, type Agent, type Counts, type PublicEvent, type ServerMessage, type Snapshot } from "../shared/public";

export type Status = "connecting" | "live" | "offline" | "demo";

export interface FeedHandlers {
  status(s: Status): void;
  snapshot(s: Snapshot): void;
  event(e: PublicEvent, replay: boolean): void;
  counts(c: Counts): void;
}

export function connect(h: FeedHandlers): void {
  let retry = 1000;
  let everLive = false;
  let demo: number | undefined;

  const open = () => {
    h.status(everLive ? "offline" : demo ? "demo" : "connecting");
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/api/live`);
    ws.onopen = () => {
      everLive = true;
      retry = 1000;
      if (demo) { clearInterval(demo); demo = undefined; }
      h.status("live");
    };
    ws.onmessage = (m) => {
      let msg: ServerMessage;
      try { msg = JSON.parse(m.data); } catch { return; }
      if (msg.type === "snapshot") h.snapshot({ ...msg.snapshot, recent: msg.snapshot.recent.filter(isPublicEvent) });
      if (msg.type === "event" && isPublicEvent(msg.event)) h.event(msg.event, false);
      if (msg.type === "counts" && isCounts(msg.counts)) h.counts(msg.counts);
    };
    ws.onclose = () => {
      if (!everLive && !demo) demo = startDemo(h);
      h.status(everLive ? "offline" : "demo");
      setTimeout(open, retry);
      retry = Math.min(retry * 2, 30_000);
    };
  };
  open();
}

// Plausible routine activity, for when no studio is reachable (local dev, or before
// the Worker is deployed). Shown with a DEMO badge; never mixed with live data.
function startDemo(h: FeedHandlers): number {
  const script: [Agent, PublicEvent["kind"], Partial<PublicEvent>?][] = [
    ["ops", "issue.opened", { stage: "ops" }],
    ["quality", "issue.opened", { fn: "quality" }],
    ["pm", "issue.labelled", { stage: "ready", fn: "engineering" }],
    ["implementer", "pr.opened", { fn: "engineering" }],
    ["actions", "check.passed", { ok: true }],
    ["reviewer", "pr.reviewed"],
    ["analyst", "pr.opened", { fn: "analyst" }],
    ["growth", "issue.opened", { stage: "approval", fn: "growth" }],
    ["digest", "issue.closed"],
    ["owner", "pr.merged"],
    ["release", "workflow.started"],
    ["release", "workflow.finished", { ok: true }],
  ];
  const counts = { ready: 2, openPRs: 1, approvals: 1 };
  h.counts(counts);
  let i = 0;
  const step = () => {
    const [actor, kind, extra] = script[i++ % script.length];
    if (!AGENTS.includes(actor)) return;
    h.event({ kind, actor, game: i % 3 ? "factory" : "game-1", at: new Date().toISOString(), ...extra }, false);
  };
  step();
  return window.setInterval(step, 2600);
}
