# Evidence: split-view archived pane prune (issue #16969)

Before/after screenshots for `fix/split-archived-pane-lingers`.

Scenario (identical in both runs): Split View with two panes (A + B, real
transcripts), the split tab then **occluded** (another tab brought to front —
the case where catalog autoLoad is throttled), then A archived via the
per-workspace archive route (the same call the UI makes). Probed every 500 ms
from the tab itself; `results.json` carries the full probe timeline.

## before/ — clean 0.27.2 bundle

- `pre-split.png` — split established, two panes, both live.
- `banner.png` — after archiving A (occluded tab): A's pane **lingers** with
  the "Session closed" banner indefinitely (`lastBannerAt_ms` = 12195, the end
  of the probe window; `panes` stays 2 for all 25 samples).
- `end.png` — 12.2 s after archive: still two panes, banner still visible.

## after/ — same bundle with the fix (`userClosedSession` flag)

- `pre-split.png` — split established, two panes, both live.
- `end.png` — A's pane is **pruned**: one pane (B) remains, no banner. The
  pane count drops 2 -> 1 at 505 ms; the "Session closed" banner appears only
  in the first 2 ms sample (before the prune) and never again.
- No `banner.png` here on purpose: the banner is not present at the
  1500 ms shot point.
