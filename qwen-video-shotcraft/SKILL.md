---
name: qwen-video-shotcraft
description: Use when asked to create a short technical explainer or product video with video-shotcraft for a weak local model; fill the content template and render an MP4 without hand-writing layout code.
---

# Qwen Video Shotcraft

You write CONTENT only. The script draws every card, arrow, cycle, position, size, animation and transition.

1. Copy `templates/content.json` to `<work>/content.json`. It is a filled example; replace all of its text.
2. Write `title`, `subtitle` and `scenes`: one scene per subsystem named in the request, in request order (2-7 scenes; never merge or drop one), then ONE last scene, the system map.
3. In each scene, `nodes` lists 4-8 `["Label", "detail"]` cards. A label is the exact name this domain uses for a part, signal, data structure or standard term (never "Input", "Process", the scene title, or a look-alike name from another tool). A detail is 2-6 words on what the part does or holds.
   - Include the part that does the real work (the controller, solver, modifier, valve, engine) between its inputs and its result.
   - A part that belongs to two subsystems gets the identical label in both scenes.
4. `links` lists `["From label", "To label", "verb"]`. "From verb To" must be a true sentence; the verb (1-2 words) says what From does to To ("compresses", "sets", "reads"), never just order ("then", "next").
   - Branches are normal: one part may feed several, several may feed one. Node order does not matter; the script lays out trees, parallel parts and cycles.
   - Members of a list or stack that run in order do not act on each other: link each member to what it acts on.
   - Link back to an earlier part only if material, signal or state really returns there. Those links are drawn dashed as a cycle. Never add one to show repetition.
   - At most 4 steps deep. Every node needs at least one link.
5. The system map (last scene) reuses at least 4 exact labels from at least 3 earlier scenes. At least 3 of its links join parts from different scenes: how one subsystem drives another.
6. `closing_note`: one sentence with the key takeaway that ties the subsystems together.
7. Run exactly `scripts/make.sh <work>/content.json <work>/output`.
8. If it prints `FIX: ...`, make exactly that change in content.json and rerun step 7. Repeat until it prints `"status":"rendered"`.
9. Look at `output/phone-sheet.png` (every slide at phone size) and `output/poster.png` (the system map). For each card, ask: is this the real name in this domain? For each arrow, ask: is "From verb To" true in that direction? Fix any wrong one, then rerun.

| Common failure | Fix |
| --- | --- |
| `FIX: ... is too long` / `does not fit` | Shorten that exact text to about the number of characters given. |
| `FIX: chain ... is N steps deep` | Feed parallel parts from one shared source, or move a step into another scene. |
| `FIX: ... collide` / `overlap` / `cross` | Drop the least important link named there, or shorten its verb. |
| `FIX: ... only states order` | Use a verb for what From does to To, or remove the link. |
| `sample Remotion install missing` | Restore `samples/08-video-shotcraft` dependencies; do not use another renderer. |
