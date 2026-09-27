# Opening controls native browser check — 2026-09-27

Build: main 26eea9b, isolated local server port 4387; Forked Vale, Azure seat, 12 starting units, waiting for player 2. Firefox native UI controlled through CUA, DPR 2. Ordinary content viewport approximately 1391 × 757 CSS pixels; narrow desktop explicitly set to 800 × 700 in Firefox Responsive Design Mode with touch simulation off.

## Observed interaction results

- Ordinary desktop: Idle workers selected four workers. Right-clicking the visible berry node produced GATHER ORDER · 4 WORKERS and GATHER FOOD · 4 WORKERS; food increased.
- Build opened the visible command panel. Barracks placement over the Town Center produced BARRACKS SITE BLOCKED · TOWN CENTER TOO CLOSE. Escape produced BARRACKS PLACEMENT CANCELLED; 250 wood retained. A clear site produced BARRACKS PLACED · WORKERS CONSTRUCTING and wood fell to 75 (175 cost).
- Selecting its construction frame showed Finish construction to unlock production and disabled training. After completion, Train infantry was visible and enabled.
- Narrow desktop: Train infantry clicked from the contextual panel produced INFANTRY QUEUED · 1/5 · 50 FOOD, food 190 → 140, visible training progress, then AZURE INFANTRY READY. Ordinary desktop producer selection and queueing also succeeded for a second infantry; food 166.867 → 116.867. Both units completed.
- Narrow desktop: selected workers gathered visible wood; cargo and delivered wood increased. Clicking a visible worker selected exactly one worker. Build panel buttons were visible and usable; unaffordable buildings were disabled with their costs shown.
- Narrow desktop: archery range placement on Town Center produced ARCHERY RANGE SITE BLOCKED · TOWN CENTER TOO CLOSE. Escape produced ARCHERY RANGE PLACEMENT CANCELLED and enabled Gather / move. No construction charge occurred; concurrent delivery increased wood 155 → 195.
- Narrow desktop: a clear archery range site produced ARCHERY RANGE PLACED · WORKERS CONSTRUCTING, visible foundation, and wood 195 → 45 (150 cost).

No hidden or overlapping control blocked these openings. At 800 px, temporary top-center feedback overlaps the objective strip visually, but its specific rejection remains readable and construction controls remain usable. No runtime change warranted by this bounded check.

Limits: one local Azure seat; no remote latency, opposing player, touch/mobile, or other browser engine proof. Firefox's initial 320 px responsive preset is not the desktop test. Rendered screenshots and accessibility observations are in the task's CUA tool results; no standalone image files were saved. Closed only the test tab and shut down the disposable server cleanly with SIGINT.
