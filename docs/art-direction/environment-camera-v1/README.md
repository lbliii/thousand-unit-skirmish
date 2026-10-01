# Environment camera construction reference

This production guide is generated from [the runtime camera vector](../../../src/camera-controls.mjs), using Three.js orthographic projection. It supplies measured construction references for later environment sprites and directional source sheets. Current painted assets remain approximate fixed-view samples.

![Fixed camera construction](camera-construction.png)

The camera is at 45° azimuth and 45.4359024848° elevation above ground, with world Y up and effectively zero screen roll. A horizontal circle projects to an ellipse with a 0.7124658869 minor/major ratio. A physical one-unit vertical projects to 0.7017067479 screen units. These values describe source-object projection; a runtime camera-facing sprite card uses its registered image width/height directly.

![Eight object rotations](heading-registration.png)

All eight panels use the same asymmetric calibration object, camera and bottom-center root. Headings rotate the object around world Y in 45° steps, with zero heading pointing along positive Z. The colored offset boxes reveal orientation changes. This is a construction reference, not a production plant sheet or evidence that existing specimens have eight registered views. For a later asset, preserve the same source object, canvas, root and scale through each heading and its harvest states.

Editable [camera SVG](camera-construction.svg), [heading SVG](heading-registration.svg) and [numeric measurements](measurements.json) accompany the PNG previews. Regenerate SVG/JSON with `node scripts/build-environment-camera-guide.mjs`; PNGs are Chrome raster previews of those SVGs. No ImageGen or private reference was used. The builder follows future camera-vector changes; rerender previews when regenerating it.

Validation on 30 September 2026: camera-vector equality, eight headings, effectively zero roll and measured vertical projection pass; both rendered previews visually inspected. Chrome emitted macOS display-link diagnostics but wrote both complete images; the two isolated capture processes were stopped afterward. No runtime or gameplay change, performance claim or source-perspective certification.
