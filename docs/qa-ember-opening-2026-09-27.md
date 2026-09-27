# Ember opening and explanations — 2026-09-27

Source main bcd5fec, isolated clone /tmp/rts-match-recovery-20260927, Forked Vale. Native Firefox via CUA; ordinary content approximately 1391 × 757 CSS pixels and explicit Responsive Design Mode 800 × 700, DPR 2, touch simulation off. Disposable server 127.0.0.1:4387. A passive WebSocket client occupied Azure; Firefox received Ember, which was verified in the rendered HUD.

## Observed opening

At ordinary width, Idle workers selected four Ember workers; right-clicking the berry node issued GATHER FOOD and food increased from 150 to 190. Build exposed Barracks construction; a clear site placed one Barracks and charged 175 wood (250 → 75). Construction completed.

At 800 × 700, selecting the rendered Barracks exposed Train infantry. Clicking it charged 50 food, showed queue/training progress, and completed with EMBER INFANTRY READY. A second ordinary-width infantry queue also charged 50 food and completed; Ember field count ultimately reached 14. Workers gathered wood through the narrow UI; delivery raised wood enough for the next building.

Narrow archery range placement over the Town Center showed ARCHERY RANGE SITE BLOCKED · TOWN CENTER TOO CLOSE. Escape displayed ARCHERY RANGE PLACEMENT CANCELLED without a charge. A clear site then placed the range and spent 150 wood (195 → 45). The range completed. No hidden or overlapping control blocked the tested opening.

## Objective guidance

At both widths, Objectives opened the briefing. The panel and its scroll area exposed:

- Both Signals unlock the Watch.
- North and South each require five units and nine seconds; capture grants 75 food and 50 wood.
- Vale Watch requires North Signal + South Signal, eight units and twelve seconds. The compact LOCKED status truncates, but the full prerequisites wrap in the detail below.
- Hold all three victory zones for twenty seconds. Losing the condition resets progress.
- At fifteen minutes the Watch owner wins; unclaimed is a draw.
- Relief Caravan grants both teams 100 food and 75 wood at two minutes.

The sticky deadline card overlaps scrolling cards while they pass beneath it, but the prerequisite and hold guidance can be scrolled fully into view. The briefing can be closed with Escape. This is owner inspection, not evidence of novice comprehension.

## Terminal result fixture

After the opening, the disposable server was stopped cleanly and its saved matchElapsedSeconds changed to 895. No runtime source or map rules were changed. Restart restored the match and Firefox reclaimed Ember. The unchanged server clock reached the fifteen-minute deadline with no Watch owner.

At ordinary and 800 × 700 widths, the centered result card read DRAW / VALE WATCH UNCLAIMED AT DEADLINE / WAITING FOR HOST TO RESET. Producer commands were disabled; the selected Barracks retained its display. This is a checkpoint-seeded result UI observation, not an uninterrupted fifteen-minute match or a victory-hold proof.

## Limits and cleanup

Local Ember only, passive opponent, native Firefox only; no hosted latency, combat, contested objectives, touch/mobile, or full human match. CUA tool output contains rendered screenshots and AX observations; standalone image files were not saved. Fractional resource totals and a long decimal in a research shortfall were visible but did not block these actions. No runtime changes or PR were warranted for the bounded blocking/discoverability question. Test tab closed and both disposable clients/server stopped.
