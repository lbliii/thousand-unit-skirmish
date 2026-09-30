# Pale Meridian violet lichen · 30 September 2026

Local candidate from main af3f5ef9, isolated room/map storage and headless Chrome on port 4178. Run `RTS_QA_URL=http://127.0.0.1:4178 RTS_VEGETATION_REGION=pale-meridian RTS_VEGETATION_LIFECYCLE=1 RTS_VEGETATION_ATLAS=1 RTS_VEGETATION_UNDERSTORY=1 RTS_VEGETATION_LICHEN=1 node scripts/qa-vegetation-browser.mjs`.

[Ordinary regional view](pale-meridian-renderer-ordinary.png) shows dark/violet outcrops beside snow and conifers; [strategic](pale-meridian-renderer-strategic.png) checks distant contrast. [Stone placement](stone-placement-proof.json) preserves 26 positions at each elevation 0.72/1.12/2 against generic review, with screen-roll component 0 and level 2 terrain contact within 1e-6. Low scenery uses lichen; tall ridge/cliff texture lists match review exactly, which has no regional props.

[Eleven-base bindings](forest-slot-proof.json) load lichen on snow/ice only and retain 36 forest identities per base. Existing forest companion, tree camera/UV, live worker harvesting/reset and 14-family fallback pass. Final boot ready with no runtime/console errors. Both plant validators pass 13 packs, including exact decoded-alpha comparison. Release source/runtime and loader bytes match; temporary copy removed. Syntax/docs/whitespace pass.

Source PNG unchanged, one approximate oblique view. Decorative stone collision only; no mining/lichen yield, new lore, extra painted views, hosted or performance claim.
