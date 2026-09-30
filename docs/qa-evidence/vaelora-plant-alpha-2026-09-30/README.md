# Regional plant decoded alpha · 30 September 2026

Run `npm run validate:environment-plant-alpha` with Python3/Pillow. The read-only audit crops each selected PNG by its recorded crop and applies the documented LANCZOS max1024 export recipe, then compares every decoded WebP alpha pixel exactly. All12 current single-asset packs pass; [report](report.json) records covered assets and pixel counts. Transparent surroundings and visible plant pixels are required; actual alpha ranges are recorded. Generated cores need not reach255.

No files are repainted, re-encoded or modified. This supplements the Node file/header/metadata validator; it does not verify RGB fidelity, painted projection, runtime placement or gameplay. Pillow is available locally; this optional production command is not added to the Node-only CI runtime.
