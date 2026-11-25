// fetch-data.mjs — Taskmarket live market visualizer data fetcher.
//
// Fetches the public Taskmarket API (no key) server-side, computes the
// derived views (distinct posters per week, concentration), and writes
// data/market.json. Run by hand (`node scripts/fetch-data.mjs`) and by the
// hourly GitHub Action (.github/workflows/refresh-data.yml).
//
// API reality (verified 2026-11-25 against the live API):
//  - /api/market/stats is partly per-chain (paidWorkers, activeWallets
//    differ); the rest of its fields are platform-wide.
//  - /api/stats/breakdowns, /api/stats/platform-time-series,
//    /api/stats/activity-heatmap and /api/stats/activity-feed are
//    platform-wide: the API returns identical payloads for both chainIds.
//  - /api/tasks IS per-chain: different tasks on Base vs Tempo.
//  The dashboard says so in its methods note instead of pretending
//  platform-wide numbers differ per chain.
//
// Usage: node scripts/fetch-data.mjs [--out data/market.json]
//   Env: API_BASE (default https://api.taskmarket.dev)
//        WEEKS   (how many weeks of posters to compute; default 12)
//   Exit non-zero on any fetch failure so the Action does not commit
//   a partial file; the site keeps serving the last good data file.

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const API_BASE = process.env.API_BASE ?? "https://api.taskmarket.dev";
const WEEKS = Number(process.env.WEEKS ?? 12);
const OUT = process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), "..", "data", "market.json");

const CHAINS = [
  { chainId: 8453, name: "Base", currency: "USDC" },
  { chainId: 4217, name: "Tempo", currency: "OUSD" },
];

// USDC and OUSD both have 6 decimals.
const DECIMALS = 1e6;

async function get(path, { retries = 3 } = {}) {
  const url = API_BASE + path;
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "user-agent": "taskmarket-visualizer/1.0 (github-action-fetch)", accept: "application/json" },
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
      return await res.json();
    } catch (err) {
      lastErr = err;
      if (attempt < retries) await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
  throw lastErr;
}

// ISO week key (Monday start) for a date string, e.g. "2026-11-23".
function weekKey(isoDate) {
  const d = new Date(isoDate.slice(0, 10) + "T00:00:00Z");
  const day = (d.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}

async function fetchTasks(chainId) {
  // Newest first; stop once we are older than the window, or out of pages.
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - WEEKS * 7);
  const tasks = [];
  let cursor = null;
  let pages = 0;
  const MAX_PAGES = 100; // safety cap: 100 * 100 = 10,000 tasks
  for (;;) {
    const qs = new URLSearchParams({ chainId: String(chainId), sort: "newest", limit: "100" });
    if (cursor) qs.set("cursor", cursor);
    const page = await get(`/api/tasks?${qs}`);
    if (!Array.isArray(page.tasks)) throw new Error(`unexpected /api/tasks shape for chain ${chainId}`);
    pages += 1;
    let hitCutoff = false;
    for (const t of page.tasks) {
      if (new Date(t.createdAt) < cutoff) { hitCutoff = true; break; }
      tasks.push({ createdAt: t.createdAt, requester: t.requester, mode: t.mode, status: t.status, reward: t.reward, referenceCode: t.referenceCode });
    }
    if (hitCutoff || !page.hasMore || !page.nextCursor || pages >= MAX_PAGES) break;
    cursor = page.nextCursor;
  }
  return { tasks, pages };
}

function postersPerWeek(tasks) {
  const byWeek = new Map(); // weekKey -> { tasks, posters:Set }
  for (const t of tasks) {
    const wk = weekKey(t.createdAt);
    let row = byWeek.get(wk);
    if (!row) { row = { week: wk, tasks: 0, posters: new Set() }; byWeek.set(wk, row); }
    row.tasks += 1;
    row.posters.add(t.requester.toLowerCase());
  }
  return [...byWeek.values()]
    .sort((a, b) => a.week.localeCompare(b.week))
    .map((r) => ({ week: r.week, tasks: r.tasks, distinctPosters: r.posters.size }));
}

function topPosters(tasks, n = 5) {
  const counts = new Map();
  for (const t of tasks) counts.set(t.requester.toLowerCase(), (counts.get(t.requester.toLowerCase()) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([address, tasks]) => ({ address, tasks }));
}

async function main() {
  const fetchedAt = new Date().toISOString();

  const [statsBase, statsTempo, breakdowns, series7d, series30d, series90d, seriesAll,
    heatmapMode, heatmapHour, feed] = await Promise.all([
    get("/api/market/stats?chainId=8453"),
    get("/api/market/stats?chainId=4217"),
    get("/api/stats/breakdowns?chainId=8453"),
    get("/api/stats/platform-time-series?chainId=8453&range=7d&bucket=day"),
    get("/api/stats/platform-time-series?chainId=8453&range=30d&bucket=day"),
    get("/api/stats/platform-time-series?chainId=8453&range=90d&bucket=day"),
    get("/api/stats/platform-time-series?chainId=8453&range=all&bucket=day"),
    get("/api/stats/activity-heatmap?chainId=8453&range=30d&dimension=mode"),
    get("/api/stats/activity-heatmap?chainId=8453&range=30d&dimension=hourOfWeek"),
    get("/api/stats/activity-feed?chainId=8453&limit=50"),
  ]);

  // Per-chain task lists (newest first, last WEEKS weeks) for posters/week.
  const chainTasks = {};
  for (const c of CHAINS) {
    const { tasks, pages } = await fetchTasks(c.chainId);
    chainTasks[c.chainId] = { tasks, pages };
  }

  // Derived views.
  const posters = {};
  const concentration = {};
  const openEscrow = {};
  for (const c of CHAINS) {
    const { tasks } = chainTasks[c.chainId];
    posters[c.chainId] = postersPerWeek(tasks);
    const top = topPosters(tasks, 5);
    const total = tasks.length;
    concentration[c.chainId] = {
      windowWeeks: WEEKS,
      tasksInWindow: total,
      distinctPostersInWindow: new Set(tasks.map((t) => t.requester.toLowerCase())).size,
      top5: top.map((r) => ({ ...r, share: total ? r.tasks / total : 0 })),
      top5Share: total ? top.reduce((s, r) => s + r.tasks, 0) / total : 0,
    };
    // Rewards held in escrow on open tasks posted in the window.
    // (Tasks expire, so open tasks older than the window are rare;
    // the figure is labelled with its window in the dashboard.)
    const open = tasks.filter((t) => t.status === "open");
    openEscrow[c.chainId] = {
      openTasks: open.length,
      value: open.reduce((s, t) => s + Number(t.reward ?? 0), 0) / DECIMALS,
    };
  }

  // Money flow (platform-wide series, 30d): posted vs paid.
  // rewardVolume/paidVolume are base units (6 decimals); the rest are counts.
  const money = (rows, key) => rows.reduce((s, r) => s + Number(r[key] ?? 0), 0) / DECIMALS;
  const count = (rows, key) => rows.reduce((s, r) => s + Number(r[key] ?? 0), 0);
  const flow = {
    range: "30d",
    rewardsPosted: money(series30d, "rewardVolume"),
    rewardsPaid: money(series30d, "paidVolume"),
    tasksCreated: count(series30d, "tasksCreated"),
    tasksCompleted: count(series30d, "completedTasks"),
    settlements: count(series30d, "settlements"),
  };

  const out = {
    fetchedAt,
    source: "https://api.taskmarket.dev",
    chains: {
      8453: { name: "Base", currency: "USDC", stats: statsBase },
      4217: { name: "Tempo", currency: "OUSD", stats: statsTempo },
    },
    // Platform-wide (the API returns identical payloads for both chains).
    platform: { breakdowns },
    series: { "7d": series7d, "30d": series30d, "90d": series90d, all: seriesAll },
    heatmap: { mode: heatmapMode, hourOfWeek: heatmapHour },
    feed: feed.items ?? [],
    postersPerWeek: posters,
    concentration,
    openEscrow,
    flow,
    methods: {
      stats: "GET /api/market/stats?chainId=8453 and ?chainId=4217",
      breakdowns: "GET /api/stats/breakdowns?chainId=8453 (platform-wide; identical for 4217)",
      series: "GET /api/stats/platform-time-series?chainId=8453&range=7d|30d|90d|all&bucket=day (platform-wide)",
      heatmap: "GET /api/stats/activity-heatmap?chainId=8453&range=30d&dimension=mode|hourOfWeek (platform-wide)",
      feed: "GET /api/stats/activity-feed?chainId=8453&limit=50 (platform-wide)",
      posters: `GET /api/tasks?chainId=8453|4217&sort=newest&limit=100, paginated by cursor, last ${WEEKS} weeks; distinct requester addresses per ISO week (Monday start)`,
      money: "USDC and OUSD both 6 decimals; volumes divided by 1,000,000",
    },
  };

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
  console.log(`wrote ${OUT}`);
  console.log(`fetchedAt ${fetchedAt}; Base tasks ${chainTasks[8453].tasks.length} (${chainTasks[8453].pages} pages), Tempo tasks ${chainTasks[4217].tasks.length} (${chainTasks[4217].pages} pages)`);
  console.log(`feed items ${out.feed.length}; series 7d=${series7d.length} 30d=${series30d.length} 90d=${series90d.length} all=${seriesAll.length}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
