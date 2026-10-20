---
name: firstmate
description: Guides the user in running kunchenguid/firstmate with GitHub Copilot - the first mate and crew agent workflow, the fm shortcut commands, and the firstmate-console canvas. Use when the user mentions firstmate, first mate, crewmates, fm commands, scout or ship tasks, or seems confused about how to engage that workflow.
---

# Firstmate guide

The user may be new to this or have forgotten it. Assume they need orientation, and explain simply before acting.

## Mental model

- **Captain** = the user. **First mate** = a Copilot session running in `~/code/firstmate` (tmux session `firstmate`, window `first-mate`). **Crewmates** = agents the first mate spawns, one tmux window each (`fm-<id>`), in isolated treehouse worktrees.
- Keywords (`scout`, `ship`, `local-only`, `direct-PR`, `no-mistakes`, `yolo`) are plain English the first mate understands, not CLI flags.
- scout = investigate and write a report. ship = change code. Modes: `local-only` stays local, `direct-PR` opens a PR, `no-mistakes` uses the review gate, `+yolo` auto-merges.
- The first mate does not know which repo the user means; the task must name the project path. A new project is registered by the first message.

## Ways to engage

1. Canvas: open `firstmate-console` (open_canvas with a fresh instanceId). Pick project, type, mode, write task, Send. Fleet panel has Peek, steer box and Report.
2. Terminal: `fm doctor`, `fm scout -p <dir> [-m mode] "task"`, `fm ship ...`, `fm status`, `fm watch`, `fm peek <id>`, `fm report <id>`, `fm stop`.
3. Direct: attach with `fm watch` and talk to the first mate in plain English.

## When the user is lost

Run `fm doctor` first, then walk them through one concrete scout on a small repo, step by step, confirming each step. Suggest `just-play` (not yet registered) or `~/code/fm-scratch`. Offer to open the canvas for them.

## Gotchas

- Fix problems in `~/code/firstmate` on `main`; session start checks out `main` and drops branch-only patches.
- Do not let the first mate edit `config/`, `bin/` or git state.
- Copilot has no turn-end hooks, so "watcher still down" warnings are expected.
- Stale canvas panels point at dead servers after an extension reload; reopen with a new instanceId.
- Setup or rebuild from scratch: `bin/fm-setup-copilot.sh` in the fork `ortizjorge639/firstmate`. Docs: `docs/copilot-harness.md`. Notes: `~/.copilot/notes/firstmate-copilot.md`.
