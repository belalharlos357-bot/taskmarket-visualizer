# Taskmarket live market visualizer

A public, live dashboard of Taskmarket's market data — headline numbers,
trends, tasks by mode and status, activity heatmap, live feed, distinct
posters per week, and where the money goes. Base and Tempo. Data from the
public Taskmarket API, refreshed hourly.

Made for a paid Taskmarket bounty (TSK-BRK611AN). This is not an official
Taskmarket product.

## Live URL

https://belalharlos357-bot.github.io/taskmarket-visualizer/

## How it works

The Taskmarket API does not allow browser requests from other websites, so
the data is fetched **server-side** and cached:

- A scheduled GitHub Action (`.github/workflows/refresh-data.yml`) runs
  `node scripts/fetch-data.mjs` every hour. The script calls the public API
  (no key), computes the derived views (distinct posters per week,
  concentration, money flow), and writes `data/market.json` with a
  `fetchedAt` timestamp. It commits the file only when it changed.
- The static site (`index.html`, `styles.css`, `app.js`) reads
  `data/market.json` and renders everything client-side. No backend, no
  wallet connection, no analytics, no tracking.

## Deploy (one command)

```sh
npm run deploy
```

That runs `scripts/deploy.sh`, which:
1. fetches fresh data once (`node scripts/fetch-data.mjs`),
2. enables GitHub Pages from the `main` branch (`gh-pages` via the GitHub CLI
   if available, otherwise prints the two clicks needed in repo Settings),
3. prints the live URL.

Prerequisite: the repo `belalharlos357-bot/taskmarket-visualizer` exists on
GitHub and the `gh` CLI is authenticated (only needed for the one-click
Pages enablement; the site also works if Pages is enabled by hand).

Local preview:

```sh
python3 -m http.server 8000
# open http://localhost:8000/
```

## Endpoints used

Base URL `https://api.taskmarket.dev` (public, no key):

- `GET /api/market/stats?chainId=8453` and `?chainId=4217` — headline numbers
- `GET /api/stats/breakdowns?chainId=8453` — tasks by status, mode, actor type
- `GET /api/stats/platform-time-series?chainId=8453&range=7d|30d|90d|all&bucket=day`
- `GET /api/stats/activity-heatmap?chainId=8453&range=30d&dimension=mode|hourOfWeek`
- `GET /api/stats/activity-feed?chainId=8453&limit=50`
- `GET /api/tasks?chainId=8453|4217&sort=newest&limit=100` (paginated by cursor)

Money: USDC (Base) and OUSD (Tempo) both have 6 decimals; volumes are
divided by 1,000,000.

## What is per-chain and what is not

Verified against the live API (2026-11-25): the breakdowns, the time
series, the heatmap and the feed are **platform-wide** — the API returns
identical payloads for both chain IDs. Only the headline paid-workers /
active-wallets and the task lists differ by chain. The dashboard says so
in its methods note instead of inventing per-chain splits.

Distinct posters per week: distinct `requester` addresses among tasks with
`createdAt` in that ISO week (Monday start), from the per-chain task list
paginated newest-first over the last 12 weeks.

## Design

Follows the Taskmarket brand kit: ground `#12100E`, panel `#221E1A`,
magenta `#E74079` accent, Instrument Serif headlines, Inter Tight body,
Departure Mono numbers, the `taskmarket-lockup.png` sign-off. Fonts and
brand images are self-hosted in `assets/` (SIL Open Font License; see
`assets/font-license-*.txt`). No third-party requests at all.

## Files

| File | What it is |
| --- | --- |
| `index.html` | The dashboard page |
| `styles.css` | Brand styles |
| `app.js` | Rendering (vanilla JS, inline SVG charts, no dependencies) |
| `data/market.json` | Cached API snapshot, refreshed hourly by the Action |
| `scripts/fetch-data.mjs` | Server-side fetch + derived views |
| `scripts/deploy.sh` | One-command deploy |
| `.github/workflows/refresh-data.yml` | Hourly refresh Action |
| `assets/` | Brand mark, lockup, share image, fonts, font licences |
| `notes.txt` | Bounty deliverable notes |
