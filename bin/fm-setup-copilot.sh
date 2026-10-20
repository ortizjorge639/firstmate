#!/usr/bin/env bash
# One-shot local setup for running firstmate with GitHub Copilot CLI.
# Usage: bin/fm-setup-copilot.sh [--with-optional] [--scratch <dir>]
#   Installs required deps (tmux, gh, copilot, treehouse), seeds
#   config/crew-harness=copilot, and optionally installs the AXI helpers and
#   no-mistakes. --scratch creates a throwaway git repo for smoke tests.
# Idempotent: every step skips what is already present.
set -eu

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OPTIONAL=0
SCRATCH=""
while [ $# -gt 0 ]; do
  case "$1" in
    --with-optional) OPTIONAL=1 ;;
    --scratch) shift; SCRATCH=${1:?--scratch needs a directory} ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done

have() { command -v "$1" >/dev/null 2>&1; }
step() { printf '\n== %s\n' "$*"; }

install_pkg() { # <binary> <brew-formula> <apt-package>
  have "$1" && { echo "ok: $1"; return; }
  if have brew; then brew install "$2"
  elif have apt-get; then sudo apt-get install -y "$3"
  else echo "error: install $1 manually" >&2; exit 1; fi
}

step "Core tools"
install_pkg git git git
install_pkg tmux tmux tmux
install_pkg gh gh gh
have gh && gh auth status >/dev/null 2>&1 || echo "note: run 'gh auth login' (or export GH_TOKEN)"

step "GitHub Copilot CLI"
if have copilot; then echo "ok: copilot $(copilot --version 2>/dev/null | head -1)"
elif have npm; then npm install -g @github/copilot
else echo "error: install Node/npm, then 'npm install -g @github/copilot'" >&2; exit 1; fi

step "treehouse (worktree pool)"
if have treehouse; then echo "ok: treehouse"
else curl -fsSL https://kunchenguid.github.io/treehouse/install.sh | sh; fi

if [ "$OPTIONAL" = 1 ]; then
  step "Optional AXI helpers"
  have npm || { echo "error: npm required for --with-optional" >&2; exit 1; }
  for pkg in gh-axi tasks-axi quota-axi chrome-devtools-axi lavish-axi; do
    have "$pkg" && echo "ok: $pkg" || npm install -g "$pkg"
  done
  have gh-axi && gh-axi setup hooks || true
  have chrome-devtools-axi && chrome-devtools-axi setup hooks || true
  have lavish-axi && lavish-axi setup hooks || true
  step "no-mistakes"
  have no-mistakes && echo "ok: no-mistakes" ||
    curl -fsSL https://raw.githubusercontent.com/kunchenguid/no-mistakes/main/docs/install.sh | sh
fi

step "Firstmate config"
mkdir -p "$ROOT/config"
if [ ! -s "$ROOT/config/crew-harness" ]; then echo copilot >"$ROOT/config/crew-harness"; fi
echo "crew-harness: $(tr -d '[:space:]' <"$ROOT/config/crew-harness")"

if [ -n "$SCRATCH" ]; then
  step "Scratch repo: $SCRATCH"
  if [ ! -d "$SCRATCH/.git" ]; then
    mkdir -p "$SCRATCH"
    git -C "$SCRATCH" init -q -b main
    printf '# scratch\n\nSmall sandbox for firstmate smoke tests.\n' >"$SCRATCH/README.md"
    printf 'def add(a, b):\n    return a + b\n' >"$SCRATCH/calc.py"
    git -C "$SCRATCH" add -A
    git -C "$SCRATCH" -c user.name=firstmate -c user.email=fm@localhost commit -q -m "init scratch"
  fi
  echo "ready: $SCRATCH"
fi

step "Shortcut"
mkdir -p "$HOME/.local/bin"
ln -sf "$ROOT/bin/fm" "$HOME/.local/bin/fm"
echo "linked: ~/.local/bin/fm (ensure ~/.local/bin is on PATH)"

step "Done"
echo "Launch: fm   (or: cd $ROOT && copilot --allow-all)"
echo "Then tell the first mate to register the scratch project in local-only mode."
