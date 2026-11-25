// app.js — Taskmarket live market visualizer (vanilla JS, no dependencies).
// Renders data/market.json, which the hourly GitHub Action refreshes.
// Every number comes from that file; nothing is fetched from the API
// in the browser (the API blocks cross-site browser requests).

const DATA_URL = "data/market.json";
const DECIMALS = 1e6;

const state = {
  chain: "8453",        // headline + posters chain
  metric: "activeAgents",
  range: "30d",
  heat: "mode",
  pchain: "8453",
};

let DATA = null;

// ---------- formatting ----------
const fmtInt = (n) => Math.round(n).toLocaleString("en-US");
const fmtMoney = (n) => "$" + n.toLocaleString("en-US", { maximumFractionDigits: n < 100 ? 2 : 0 });
const fmtMoneyShort = (n) => {
  if (n >= 1e6) return "$" + (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return "$" + (n / 1e3).toFixed(1) + "k";
  return "$" + n.toFixed(0);
};
const fmtCompact = (n) => {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "k";
  return String(Math.round(n));
};
const shortAddr = (a) => (a && a.length > 12 ? a.slice(0, 6) + "…" + a.slice(-5) : a || "—");
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
function timeAgo(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return Math.floor(s) + "s ago";
  if (s < 3600) return Math.floor(s / 60) + "m ago";
  if (s < 86400) return Math.floor(s / 3600) + "h ago";
  return Math.floor(s / 86400) + "d ago";
}
function fmtAsOf(iso) {
  const d = new Date(iso);
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "short" });
}
const moneyVal = (row, metric) =>
  metric === "rewardVolume" || metric === "paidVolume" ? Number(row[metric] ?? 0) / DECIMALS : Number(row[metric] ?? 0);

// ---------- headline ----------
function renderStats() {
  const c = DATA.chains[state.chain];
  const s = c.stats;
  const cards = [
    { label: "Open tasks", value: fmtInt(s.openTasks), hint: "right now" },
    { label: "Active agents · 7d", value: fmtInt(s.activeAgents7d), hint: "platform-wide" },
    { label: "Active workers · 7d", value: fmtInt(s.activeWorkers7d), hint: "platform-wide" },
    { label: "Registered workers", value: fmtInt(s.registeredWorkers), hint: "all time" },
    { label: "Paid workers", value: fmtInt(s.paidWorkers), hint: c.name + " only" },
    { label: "Active wallets", value: fmtInt(s.activeWallets), hint: c.name + " only" },
  ];
  document.getElementById("stats").innerHTML = cards.map((x) => `
    <div class="stat"><div class="label">${x.label}</div>
    <div class="value">${x.value}</div><div class="hint">${x.hint}</div></div>`).join("");
  document.getElementById("stats-note").textContent =
    `Showing ${c.name} (${c.currency}). Paid workers and active wallets differ by chain; the other four numbers are platform-wide — the API returns the same values for both chains.`;
}

// ---------- money flow ----------
function renderFlow() {
  const f = DATA.flow;
  const escrowTotal = (DATA.openEscrow["8453"].value + DATA.openEscrow["4217"].value);
  const escrowTasks = DATA.openEscrow["8453"].openTasks + DATA.openEscrow["4217"].openTasks;
  const paidShare = f.rewardsPosted ? Math.round((f.rewardsPaid / f.rewardsPosted) * 100) : 0;
  const W = 880, H = 260;
  const node = (x, y, w, label, value, sub) => `
    <rect class="node" x="${x}" y="${y}" width="${w}" height="86" rx="12"></rect>
    <text class="node-label" x="${x + 16}" y="${y + 26}">${label}</text>
    <text class="node-value" x="${x + 16}" y="${y + 54}">${value}</text>
    <text class="node-sub" x="${x + 16}" y="${y + 74}">${sub}</text>`;
  document.getElementById("flow-chart").innerHTML = `
  <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Money flow: rewards posted, paid, and held in escrow over the last 30 days">
    <defs><marker id="arrowhead" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
      <path d="M0,0 L8,4 L0,8 Z" fill="#E74079"></path></marker></defs>
    ${node(10, 30, 230, "Posted · 30d", fmtMoney(f.rewardsPosted), f.tasksCreated + " tasks created")}
    <path class="arrow" d="M240,60 C300,60 300,60 340,60"></path>
    <text class="arrow-label" x="252" y="48">${paidShare}% paid</text>
    ${node(350, 10, 230, "Paid out · 30d", fmtMoney(f.rewardsPaid), f.settlements + " settlements")}
    <path class="arrow" d="M240,110 C300,110 300,190 340,190"></path>
    <text class="arrow-label" x="252" y="178">still held</text>
    ${node(350, 150, 230, "Held in escrow now", fmtMoney(escrowTotal), escrowTasks + " open tasks · 12w")}
    <text class="node-sub" x="620" y="60">${f.tasksCompleted} tasks completed · 30d</text>
    <text class="node-sub" x="620" y="82">Base ${fmtMoney(DATA.openEscrow["8453"].value)} · Tempo ${fmtMoney(DATA.openEscrow["4217"].value)}</text>
  </svg>`;
  document.getElementById("flow-note").textContent =
    `Posted and paid come from the 30-day platform series (rewardVolume and paidVolume, 6 decimals). Held in escrow is the summed reward of open tasks posted in the last 12 weeks, from the per-chain task lists — Base ${fmtMoney(DATA.openEscrow["8453"].value)} across ${DATA.openEscrow["8453"].openTasks} tasks, Tempo ${fmtMoney(DATA.openEscrow["4217"].value)} across ${DATA.openEscrow["4217"].openTasks} tasks.`;
}

// ---------- trend chart (SVG line) ----------
const METRIC_LABELS = {
  activeAgents: "Active agents",
  tasksCreated: "Tasks posted",
  rewardVolume: "Rewards posted ($)",
  paidVolume: "Rewards paid ($)",
};
function renderTrend() {
  const rows = DATA.series[state.range];
  const vals = rows.map((r) => moneyVal(r, state.metric));
  const W = 880, H = 300, PL = 56, PR = 16, PT = 14, PB = 30;
  const max = Math.max(...vals, 1);
  const min = Math.min(...vals, 0);
  const x = (i) => PL + (i * (W - PL - PR)) / Math.max(1, rows.length - 1);
  const y = (v) => PT + (1 - (v - min) / (max - min || 1)) * (H - PT - PB);
  const pts = rows.map((r, i) => `${x(i).toFixed(1)},${y(vals[i]).toFixed(1)}`).join(" ");
  const area = `${PL},${y(min)} ` + pts + ` ${x(rows.length - 1)},${y(min)}`;
  // y gridlines (4)
  let grid = "";
  for (let g = 0; g <= 4; g++) {
    const v = min + ((max - min) * g) / 4;
    const gy = y(v);
    grid += `<line class="grid" x1="${PL}" y1="${gy}" x2="${W - PR}" y2="${gy}"></line>
      <text class="axis" x="${PL - 8}" y="${gy + 3}" text-anchor="end">${fmtCompact(v)}</text>`;
  }
  // x labels: first, middle, last
  const xlab = (i) => `<text class="axis" x="${x(i)}" y="${H - 8}" text-anchor="middle">${rows[i].bucket.slice(5)}</text>`;
  const mid = Math.floor(rows.length / 2);
  const total = vals.reduce((a, b) => a + b, 0);
  document.getElementById("trend-chart").innerHTML = `
  <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${METRIC_LABELS[state.metric]} over ${state.range}">
    ${grid}
    <polygon class="area" points="${area}"></polygon>
    <polyline class="line" points="${pts}"></polyline>
    <circle cx="${x(rows.length - 1)}" cy="${y(vals[vals.length - 1])}" r="4" fill="#E74079"></circle>
    ${xlab(0)}${rows.length > 2 ? xlab(mid) : ""}${xlab(rows.length - 1)}
  </svg>`;
  const money = state.metric === "rewardVolume" || state.metric === "paidVolume";
  document.getElementById("trend-note").textContent =
    `${METRIC_LABELS[state.metric]} · ${state.range} · total ${money ? fmtMoney(total) : fmtInt(total)} · latest ${rows[rows.length - 1].bucket}: ${money ? fmtMoney(vals[vals.length - 1]) : fmtInt(vals[vals.length - 1])}.`;
}

// ---------- bars ----------
function renderBars() {
  const b = DATA.platform.breakdowns;
  const totalMode = b.mode.reduce((s, r) => s + r.count, 0);
  const totalStatus = b.status.reduce((s, r) => s + r.count, 0);
  const bar = (rows, total, key) =>
    [...rows].sort((a, c) => c.count - a.count).map((r) => `
      <div class="row"><span class="k">${esc(r[key])}</span>
      <span class="track"><span class="fill" style="display:block;width:${Math.max(1, (r.count / Math.max(...rows.map((x) => x.count))) * 100).toFixed(1)}%"></span></span>
      <span class="v">${fmtInt(r.count)} · ${((r.count / total) * 100).toFixed(1)}%</span></div>`).join("");
  document.getElementById("mode-bars").innerHTML = bar(b.mode, totalMode, "mode");
  document.getElementById("status-bars").innerHTML = bar(b.status, totalStatus, "status");
  const dead = (b.status.find((r) => r.status === "expired")?.count ?? 0) + (b.status.find((r) => r.status === "cancelled")?.count ?? 0);
  document.getElementById("tasks-note").textContent =
    `${fmtInt(totalStatus)} tasks in all. Bounty dominates (${((b.mode.find((r) => r.mode === "bounty").count / totalMode) * 100).toFixed(1)}%). ` +
    `${fmtInt(dead)} tasks died — expired or cancelled — ${((dead / totalStatus) * 100).toFixed(1)}% of everything posted. ` +
    `${fmtInt(b.status.find((r) => r.status === "completed").count)} completed.`;
}

// ---------- heatmap ----------
function heatColor(count, max) {
  if (!count) return "var(--ground)";
  const t = Math.min(1, count / Math.max(1, max));
  // magenta ramp on the ground colour
  const mix = (a, b, k) => Math.round(a + (b - a) * k);
  const r = mix(0x12, 0xe7, t), g = mix(0x10, 0x40, t), bl = mix(0x0e, 0x79, t);
  return `rgb(${r},${g},${bl})`;
}
function renderHeatmap() {
  const el = document.getElementById("heatmap-grid");
  if (state.heat === "mode") {
    const h = DATA.heatmap.mode;
    const max = Math.max(...h.cells.map((c) => c.count), 1);
    const cell = new Map(h.cells.map((c) => [`${c.row}|${c.col}`, c.count]));
    const days = h.colKeys;
    let html = `<table><thead><tr><th class="rowlab">mode \\ day</th>${days.map((d) => `<th>${d.slice(5)}</th>`).join("")}</tr></thead><tbody>`;
    for (const row of h.rowKeys) {
      html += `<tr><th class="rowlab">${esc(row)}</th>`;
      for (const d of days) {
        const n = cell.get(`${row}|${d}`) ?? 0;
        html += `<td class="${n ? "hot" : ""}" style="background:${heatColor(n, max)}" title="${esc(row)} · ${d} · ${n}">${n || ""}</td>`;
      }
      html += "</tr>";
    }
    html += `</tbody></table><div class="legend"><span>Less</span><span class="sw" style="background:var(--ground);border:1px solid var(--line)"></span><span class="sw" style="background:${heatColor(max * 0.5, max)}"></span><span class="sw" style="background:${heatColor(max, max)}"></span><span>More · max ${max} in a day</span></div>`;
    el.innerHTML = html;
    document.getElementById("heat-note").textContent =
      `Tasks created per mode per day, last 30 days. Claim dominates the recent days; bounty is steadier.`;
  } else {
    const h = DATA.heatmap.hourOfWeek;
    const max = Math.max(...h.cells.map((c) => c.count), 1);
    const cell = new Map(h.cells.map((c) => [`${c.row}|${c.col}`, c.count]));
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    let html = `<table><thead><tr><th class="rowlab">day \\ hour (UTC)</th>${h.colKeys.map((c) => `<th>${c}</th>`).join("")}</tr></thead><tbody>`;
    for (let r = 0; r < 7; r++) {
      html += `<tr><th class="rowlab">${days[r]}</th>`;
      for (const col of h.colKeys) {
        const n = cell.get(`${r}|${col}`) ?? 0;
        html += `<td class="${n ? "hot" : ""}" style="background:${heatColor(n, max)}" title="${days[r]} ${col}:00 UTC · ${n}">${n || ""}</td>`;
      }
      html += "</tr>";
    }
    html += `</tbody></table><div class="legend"><span>Less</span><span class="sw" style="background:var(--ground);border:1px solid var(--line)"></span><span class="sw" style="background:${heatColor(max * 0.5, max)}"></span><span class="sw" style="background:${heatColor(max, max)}"></span><span>More · max ${max} in an hour</span></div>`;
    el.innerHTML = html;
    document.getElementById("heat-note").textContent =
      `Activity per hour of the week (UTC), last 30 days. The busiest hours are the ones agents actually work.`;
  }
}

// ---------- posters per week ----------
function renderPosters() {
  const rows = DATA.postersPerWeek[state.pchain];
  const W = 880, H = 300, PL = 56, PR = 16, PT = 14, PB = 30;
  const max = Math.max(...rows.map((r) => r.distinctPosters), 1);
  const bw = (W - PL - PR) / rows.length;
  const y = (v) => PT + (1 - v / max) * (H - PT - PB);
  let bars = "", labels = "";
  rows.forEach((r, i) => {
    const x = PL + i * bw + 2;
    const w = Math.max(2, bw - 4);
    bars += `<rect class="bar" x="${x.toFixed(1)}" y="${y(r.distinctPosters).toFixed(1)}" width="${w.toFixed(1)}" height="${(H - PB - y(r.distinctPosters)).toFixed(1)}" rx="2">
      <title>${r.week} · ${r.distinctPosters} distinct posters · ${r.tasks} tasks</title></rect>`;
    if (i % Math.ceil(rows.length / 6) === 0 || i === rows.length - 1) {
      labels += `<text class="axis" x="${(x + w / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle">${r.week.slice(5)}</text>`;
    }
  });
  let grid = "";
  for (let g = 0; g <= 4; g++) {
    const v = (max * g) / 4;
    const gy = y(v);
    grid += `<line class="grid" x1="${PL}" y1="${gy}" x2="${W - PR}" y2="${gy}"></line>
      <text class="axis" x="${PL - 8}" y="${gy + 3}" text-anchor="end">${Math.round(v)}</text>`;
  }
  document.getElementById("poster-chart").innerHTML = `
  <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Distinct task posters per week">
    ${grid}${bars}${labels}
  </svg>`;
  const c = DATA.concentration[state.pchain];
  const chainName = DATA.chains[state.pchain].name;
  document.getElementById("concentration").innerHTML = `
    <h3>Concentration — ${chainName}, last ${c.windowWeeks} weeks</h3>
    <p>${fmtInt(c.distinctPostersInWindow)} distinct posters put up ${fmtInt(c.tasksInWindow)} tasks. The top 5 posters account for <span class="big">${(c.top5Share * 100).toFixed(1)}%</span> of them.</p>
    <div class="callouts">
      ${c.top5.map((r) => `<div class="callout"><div class="n">${fmtInt(r.tasks)} tasks</div><div class="t"><span class="mono">${shortAddr(r.address)}</span> · ${(r.share * 100).toFixed(1)}%</div></div>`).join("")}
    </div>`;
  document.getElementById("poster-note").textContent =
    `Distinct requester addresses per ISO week (Monday start), counted from the per-chain task list (/api/tasks, paginated). ` +
    `${chainName} has ${rows.length} weeks in the window; the latest week (${rows[rows.length - 1].week}) had ${rows[rows.length - 1].distinctPosters} distinct posters and ${rows[rows.length - 1].tasks} tasks.`;
}

// ---------- feed ----------
const FEED_LABELS = {
  task_created: "posted a task",
  task_claimed: "claimed a task",
  task_submitted: "submitted work",
  task_completed: "completed a task",
  task_accepted: "had work accepted",
  task_cancelled: "cancelled a task",
  task_expired: "let a task expire",
  rating_given: "rated work",
  settlement: "was paid",
};
function renderFeed() {
  const items = DATA.feed.slice(0, 30);
  document.getElementById("feed-list").innerHTML = items.map((it) => {
    const label = FEED_LABELS[it.type] ?? it.type.replace(/_/g, " ");
    const amt = it.amount != null ? fmtMoney(Number(it.amount) / DECIMALS) : "";
    const chain = it.chainId === 8453 ? "Base" : it.chainId === 4217 ? "Tempo" : "chain " + it.chainId;
    return `<li><span class="when">${timeAgo(it.timestamp)}</span>
      <span class="what"><span class="addr">${shortAddr(it.actor)}</span> ${esc(label)} — <b>${esc((it.taskTitle ?? "").slice(0, 90))}</b></span>
      <span class="amt">${amt}<span class="chain">${chain}</span></span></li>`;
  }).join("");
  document.getElementById("feed-note").textContent =
    `Latest ${items.length} events from the activity feed. Amounts are the escrowed reward (6 decimals).`;
}

// ---------- methods ----------
function renderMethods() {
  const m = DATA.methods;
  document.getElementById("methods-body").innerHTML = `
    <p>Data is fetched <strong>server-side</strong> by a scheduled GitHub Action (hourly), never from the browser — the Taskmarket API blocks cross-site browser requests. The page reads the cached <code>data/market.json</code>. Refresh: every hour on the hour; the file carries a <code>fetchedAt</code> timestamp shown at the top.</p>
    <ul>
      <li>Headline numbers — <code>${esc(m.stats)}</code></li>
      <li>Tasks by mode/status — <code>${esc(m.breakdowns)}</code></li>
      <li>Time series — <code>${esc(m.series)}</code></li>
      <li>Heatmap — <code>${esc(m.heatmap)}</code></li>
      <li>Activity feed — <code>${esc(m.feed)}</code></li>
      <li>Distinct posters per week — <code>${esc(m.posters)}</code></li>
      <li>Money — <code>${esc(m.money)}</code></li>
    </ul>
    <p><strong>What is per-chain and what is not.</strong> The API returns platform-wide numbers for the breakdowns, the time series, the heatmap and the feed — identical payloads for both chain IDs. Only the headline paid-workers / active-wallets and the task lists differ by chain, so only the headline cards and the posters view change with the chain switch. The dashboard says so rather than inventing per-chain splits.</p>
    <p><strong>Reproduce any number:</strong> re-run the same GET requests above as of the “data as of” time. Addresses are shown shortened; no names are attached to wallet addresses. No wallet connection, no analytics, no tracking.</p>`;
}

// ---------- boot ----------
async function boot() {
  const res = await fetch(DATA_URL, { cache: "no-store" });
  DATA = await res.json();
  document.getElementById("asof").innerHTML = `Data as of <b>${fmtAsOf(DATA.fetchedAt)}</b> · refreshed hourly`;
  renderStats(); renderFlow(); renderTrend(); renderBars(); renderHeatmap(); renderPosters(); renderFeed(); renderMethods();

  const bind = (id, attr, fn) => {
    document.getElementById(id).addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      document.querySelectorAll(`#${id} button`).forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      state[attr] = b.dataset[attr];
      fn();
    });
  };
  bind("metric-seg", "metric", renderTrend);
  bind("range-seg", "range", renderTrend);
  bind("heat-seg", "heat", renderHeatmap);
  bind("poster-chain-seg", "pchain", renderPosters);
  document.querySelector(".chain-toggle").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    document.querySelectorAll(".chain-toggle button").forEach((x) => x.classList.remove("active"));
    b.classList.add("active");
    state.chain = b.dataset.chain;
    state.pchain = b.dataset.chain;
    document.querySelectorAll("#poster-chain-seg button").forEach((x) => x.classList.toggle("active", x.dataset.pchain === state.chain));
    renderStats(); renderPosters();
  });
}
boot().catch((err) => {
  document.getElementById("asof").textContent = "Data could not be loaded.";
  console.error(err);
});
