#!/bin/sh
# One-command deploy for the Taskmarket live market visualizer.
#   sh scripts/deploy.sh
# Assumes the repo already exists on GitHub as
# belalharlos357-bot/taskmarket-visualizer with this directory pushed.
# Steps: fetch fresh data once, then enable GitHub Pages from main.
set -e
cd "$(dirname "$0")/.."

echo "== Fetching fresh market data =="
node scripts/fetch-data.mjs

echo "== Enabling GitHub Pages (main branch, root) =="
if command -v gh >/dev/null 2>&1; then
  gh api -X PUT repos/belalharlos357-bot/taskmarket-visualizer/pages \
    -f source[branch]=main -f source[path]=/ >/dev/null \
    && echo "Pages enabled."
else
  echo "gh CLI not found. Enable Pages by hand:"
  echo "  Repo Settings -> Pages -> Build and deployment -> Source: Deploy from a branch"
  echo "  Branch: main, Folder: / (root). Save."
fi

echo "== Live URL =="
echo "https://belalharlos357-bot.github.io/taskmarket-visualizer/"
