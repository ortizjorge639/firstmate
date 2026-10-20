# GitHub Copilot CLI harness

Local adaptation (not upstream): runs firstmate with GitHub Copilot CLI (`copilot`).

## Quick start

```sh
git clone https://github.com/ortizjorge639/firstmate && cd firstmate
bin/fm-setup-copilot.sh --with-optional --scratch ~/fm-scratch
copilot --allow-all
```

`bin/fm-setup-copilot.sh` is idempotent. It installs tmux, gh, the Copilot CLI and
treehouse, writes `config/crew-harness` (`copilot`), and with `--with-optional`
adds the AXI helpers and `no-mistakes`. `--scratch <dir>` creates a throwaway git
repo; register it in `local-only` mode for smoke tests. You still need
`gh auth login` (or `GH_TOKEN`) and Node/npm.

## What is supported

- **Primary:** `copilot` is detected by `bin/fm-harness.sh` and anchors the fleet
  lock (`bin/fm-session-lock-lib.sh`).
- **Crewmate/scout:** the `copilot` adapter in `bin/fm-spawn.sh` launches
  `copilot --allow-all --no-auto-update [--model M] -i <brief>`. Control verbs
  (interrupt via Escape, `/exit`) are in `bin/fm-control-lib.sh`.

## Limits

- No busy-state or turn-end hooks, so crewmate supervision is coarser.
- Not usable as a secondmate (`fm-spawn.sh` refuses it).
- The primary's supervision snippet is the generic "unknown harness" fallback.
- Effort is recorded in task metadata only.

## Gotchas

- Session start can switch the home back to `main`. Keep the Copilot patch
  committed on `main`, or detection and the lock silently revert.
- After pulling upstream, re-check `bin/fm-harness.sh crew` prints `copilot`.
- Tell the first mate not to edit `config/`, `bin/`, or wrap the CLI to fake
  another harness.
