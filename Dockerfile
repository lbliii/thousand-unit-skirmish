FROM node:24-alpine

ENV NODE_ENV=production \
    RTS_HOST=0.0.0.0 \
    PORT=4173

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && apk add --no-cache su-exec
COPY --chown=node:node server.mjs room-supervisor.mjs origin-policy.mjs simulation-scheduler.mjs index.html audio-studio.html audio-zones.html environment-review.html style.css ./
COPY --chown=node:node assets/audio/runtime/ ./assets/audio/runtime/
COPY --chown=node:node assets/audio/vaelora-zones-v1/ ./assets/audio/vaelora-zones-v1/
COPY --chown=node:node assets/audio/vaelora-pilot-v1/sources/ ./assets/audio/vaelora-pilot-v1/sources/
COPY --chown=node:node src/ ./src/
COPY --chown=node:node maps/ ./maps/
COPY --chown=node:node assets/environment/frontier-v1/ ./assets/environment/frontier-v1/
COPY --chown=node:node assets/environment/frontier-interactive-v1/manifest.json ./assets/environment/frontier-interactive-v1/manifest.json
COPY --chown=node:node assets/environment/frontier-interactive-v1/berries-depleted.webp assets/environment/frontier-interactive-v1/berries-full.webp assets/environment/frontier-interactive-v1/berries-low.webp assets/environment/frontier-interactive-v1/berries-worked.webp ./assets/environment/frontier-interactive-v1/
COPY --chown=node:node assets/environment/frontier-interactive-v1/construction-earthwork.webp assets/environment/frontier-interactive-v1/construction-foundation.webp assets/environment/frontier-interactive-v1/oak-depleted.webp ./assets/environment/frontier-interactive-v1/
COPY --chown=node:node assets/environment/frontier-interactive-v1/oak-full.webp assets/environment/frontier-interactive-v1/oak-low.webp assets/environment/frontier-interactive-v1/oak-worked.webp ./assets/environment/frontier-interactive-v1/
COPY --chown=node:node assets/ui/ ./assets/ui/
COPY --chown=node:node assets/environment/frontier-cliff-pilot-v1/runtime/ ./assets/environment/frontier-cliff-pilot-v1/runtime/
COPY --chown=node:node assets/buildings/barracks-sprite-test-v1/runtime/ ./assets/buildings/barracks-sprite-test-v1/runtime/
COPY --chown=node:node assets/buildings/archery-range-sprite-v1/runtime/ ./assets/buildings/archery-range-sprite-v1/runtime/
COPY --chown=node:node assets/buildings/town-center-meshy-review-v1/runtime/ ./assets/buildings/town-center-meshy-review-v1/runtime/
COPY --chown=node:node assets/buildings/town-center-lifecycle-meshy-v1/lifecycle-grid.json ./assets/buildings/town-center-lifecycle-meshy-v1/lifecycle-grid.json
COPY --chown=node:node assets/buildings/town-center-lifecycle-meshy-v1/runtime/ ./assets/buildings/town-center-lifecycle-meshy-v1/runtime/
COPY --chown=node:node assets/environment/frontier-meshy-sprites-v1/oak/runtime/ ./assets/environment/frontier-meshy-sprites-v1/oak/runtime/
COPY --chown=node:node assets/environment/frontier-meshy-sprites-v1/pine/runtime/ ./assets/environment/frontier-meshy-sprites-v1/pine/runtime/
COPY --chown=node:node assets/environment/frontier-meshy-sprites-v1/berries/runtime/ ./assets/environment/frontier-meshy-sprites-v1/berries/runtime/
COPY --chown=node:node assets/units/worker-sprite-v1/sprite-atlas-pack-v1.json assets/units/worker-sprite-v1/worker-atlas-runtime.png assets/units/worker-sprite-v1/team-accent-mask.png ./assets/units/worker-sprite-v1/
COPY --chown=node:node assets/units/worker-sprite-v2/sprite-atlas-pack-v1.json assets/units/worker-sprite-v2/worker-atlas-runtime.png assets/units/worker-sprite-v2/team-accent-mask.png ./assets/units/worker-sprite-v2/
COPY --chown=node:node assets/units/worker-sprite-v3/sprite-atlas-pack-v1.json assets/units/worker-sprite-v3/worker-atlas-runtime.png assets/units/worker-sprite-v3/team-accent-mask.png ./assets/units/worker-sprite-v3/
COPY --chown=node:node assets/units/infantry-sprite-v1/sprite-atlas-pack-v1.json assets/units/infantry-sprite-v1/infantry-atlas-runtime.png assets/units/infantry-sprite-v1/team-accent-mask.png ./assets/units/infantry-sprite-v1/
COPY --chown=node:node assets/units/infantry-sprite-v2/sprite-atlas-pack-v1.json assets/units/infantry-sprite-v2/infantry-atlas-runtime.png assets/units/infantry-sprite-v2/team-accent-mask.png ./assets/units/infantry-sprite-v2/
COPY --chown=node:node assets/units/archer-sprite-v1/sprite-atlas-pack-v1.json assets/units/archer-sprite-v1/archer-atlas-runtime.png assets/units/archer-sprite-v1/team-accent-mask.png ./assets/units/archer-sprite-v1/
COPY --chown=node:node assets/units/cast-human-sprite-v1/sprite-atlas-pack-v1.json assets/units/cast-human-sprite-v1/cast-atlas-runtime.png assets/units/cast-human-sprite-v1/team-accent-mask.png ./assets/units/cast-human-sprite-v1/
COPY --chown=node:node assets/units/cast-elf-sprite-v1/sprite-atlas-pack-v1.json assets/units/cast-elf-sprite-v1/cast-atlas-runtime.png assets/units/cast-elf-sprite-v1/team-accent-mask.png ./assets/units/cast-elf-sprite-v1/
COPY --chown=node:node assets/units/cast-troll-sprite-v1/sprite-atlas-pack-v1.json assets/units/cast-troll-sprite-v1/cast-atlas-runtime.png assets/units/cast-troll-sprite-v1/team-accent-mask.png ./assets/units/cast-troll-sprite-v1/
COPY --chown=node:node assets/units/cast-orc-sprite-v1/sprite-atlas-pack-v1.json assets/units/cast-orc-sprite-v1/cast-atlas-runtime.png assets/units/cast-orc-sprite-v1/team-accent-mask.png ./assets/units/cast-orc-sprite-v1/
COPY deploy/entrypoint.sh ./deploy/entrypoint.sh
RUN mkdir -p /app/custom-maps /app/room-data && chown node:node /app/custom-maps /app/room-data

EXPOSE 4173
ENTRYPOINT ["/bin/sh", "/app/deploy/entrypoint.sh"]
