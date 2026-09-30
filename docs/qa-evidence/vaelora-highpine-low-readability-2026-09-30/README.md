# Highpine low-stock readability · 30 September 2026

Local candidate based on main bab50c5f, isolated room/map storage and headless Chrome on port4178. Opening fixture maps/forked-vale.json.

Run `RTS_QA_URL=http://127.0.0.1:4178 RTS_VEGETATION_REGION=veyrholds RTS_VEGETATION_LIFECYCLE=1 RTS_VEGETATION_ATLAS=1 RTS_VEGETATION_READABILITY=1 node scripts/qa-vegetation-browser.mjs`.

[Four-state renderer](lifecycle-renderer.png) shows full/worked/low/depleted from left to right. Low now has a visibly smaller crown, removed lower branch tiers and pale cut ends. [Camera/UV proof](lifecycle-proof.json) checks state rects, retained matrices and screen roll below0.0001 degrees. [Live harvest/reset](live-harvest-proof.json) observes highpine cell810 through partial stock, zero and epoch reset. [Fallback](fallback-proof.json), [regional bindings](forest-slot-proof.json) and [lazy loading](opening-requests.json) passed. Final boot ready with no runtime or console errors.

New generated low master has exact1159×1358 canvas, same root anchoring and crop[72,48,1146,1325]. Full/worked/depleted sources/runtime unchanged. Alpha-preserving crop/encode passed; all four decoded runtime frames exactly match PNG atlas pixels, and three changed release runtime files byte-match. Atlas contract validator, JS syntax, docs and whitespace passed.

Painted source perspective remains approximate. No harvest rule/threshold changes, additional viewpoints, hosted validation or performance claim. Earlier captures retain their original dated appearance.
