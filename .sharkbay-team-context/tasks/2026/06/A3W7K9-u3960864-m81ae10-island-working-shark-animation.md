---
kind: sharkbay_task
taskId: A3W7K9-u3960864-m81ae10
taskTag: A3W7K9
mode: task
title: Island working-state shark animation
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Kiro Claude Opus 4.8
sessionId: e99337a7-3476-42b6-a150-1c54091ce940
branch: feat/island-overlay
createdAt: 2026-06-08T07:24:25Z
updatedAt: 2026-06-08T16:09:44Z
completedAt: 2026-06-08T16:09:44Z
commits:
  - bd6cdd2c
  - 4f47708d
  - f5e7d785
---

## Summary
Animated SharkBay mark in the island notch-left area: two open sea-wave lines
that ripple and a dorsal fin that sways left/right (swimming), with the fin's
lower half hidden below the waterline. Always-on for now (state gating
deferred).

## Files
- src/island/island.html

## Work
- Inline SVG in #pillLeft (40x40 viewBox, rendered 30px): filled dorsal fin +
  two open stroked wave lines, NO ring
- Fin lower half clipped at waterline (clipPath rect y<27) so the swaying base
  stays submerged behind the waves
- CSS: fin swims left/right via translateX +-5px with slight skewX lean
  (finSwim 4s), gliding rather than pivoting in place
- Geometry rework: 3:2 viewBox (36x24); fin now two curved open lines meeting
  at the apex (an "A", no crossbar) with convex leading + concave trailing edge;
  waves spaced apart (y=17, y=22), phase offset pi/2; fin animation moved to JS
  rAF: position is a sine swim and the group mirrors (scale -1 about apex) when
  travel direction reverses, so the fin faces its heading after each turnaround
- Replaced hand-drawn fin with user-provided vector (~/Downloads/shark-fin.svg,
  64x64). Decomposed it: path1 = top wave + fin outline (interleaved), path2 =
  inner fin edge + fin base. Extracted the fin outer arc (segs 22-25, absolute
  coords) and combined with path2 as an even-odd filled fin (#finGroup). Waves
  kept as JS sine strokes (rounded) tuned to match the file's look. Whole mark
  now in 64-space viewBox "0 12 64 40"; FIN_CX=32, AMP=3.2, K=0.5, waves y=40/49.
- Verified shape at each step by rendering standalone SVGs to PNG via qlmanage
- Dropped the fin base line: fin is now just the purchased outer outline as a
  single open stroke (no even-odd fill, no foot wave). Flattened waves (K 0.5 ->
  0.3, wider/lower-frequency) and slowed motion (W 2.6 -> 1.5, SWIM_W 1.1 -> 0.6)
- Box reshaped to 2:1 (viewBox 0 0 64 32, same width); fin scaled to 70% via a
  static wrapper g (scale 0.7 about base-center, lifted so feet sit on the upper
  wave at y=22). Fin stroke set to 3.43 (=2.4/0.7) so its line weight matches the
  waves after scaling. JS swim/flip stays on the inner #finGroup. Waves y=22/28.
- Color changed to gray (#9ea0a4) for fin + waves. Wider wave gap (y=21/29).
  Fin scaled smaller (0.62) and lifted (LIFT 21.2) to float just above the upper
  wave with a ~1px gap (clip removed; fin no longer tucks under water). Longer
  swim travel with fewer turnarounds (SWIM_AMP 7->11, SWIM_W 0.6->0.4); fin
  stroke 3.87 (=2.4/0.62). Verified extremes stay inside the box via qlmanage.
- Reworked waves from CSS translateX (looked like sliding lines) to a JS
  requestAnimationFrame traveling sine: fixed x endpoints (3..35), y = baseY +
  A*sin(k*x - w*t + phase); the two lines use opposite phase (0, pi)
- Enlarged to fill the left wing with a small margin
- Always visible: removed the earlier has-working JS toggle per user request
  (state gating to be reintroduced later)
- Reshaped fin from a tall narrow sail into a classic raked shark-fin triangle:
  wide base (x=8→26), convex leading edge, concave trailing hook

## Verification
- `tsc --noEmit -p tsconfig.renderer.json` passes
- Visual inspection pending in dev/packaged island overlay

## Notes
- island.html is a standalone BrowserWindow page; animation is pure CSS/SVG
- Brand reference: open dorsal fin over two wavy water lines (no circle)
- Fin reshaped to match user's reference SVG: pointed apex, near-vertical
  leading edge, single big convex trailing sweep; feet apart on the upper wave
- Self-verified shape by rendering a standalone SVG to PNG via macOS `qlmanage`
  (Quick Look) and visually comparing to the reference before applying
- No existing SVG vector asset in repo; mark drawn fresh
