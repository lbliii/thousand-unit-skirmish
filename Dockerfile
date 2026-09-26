FROM node:24-alpine

ENV NODE_ENV=production \
    RTS_HOST=0.0.0.0 \
    PORT=4173

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && apk add --no-cache su-exec
COPY --chown=node:node server.mjs room-supervisor.mjs origin-policy.mjs simulation-scheduler.mjs index.html environment-review.html style.css ./
COPY --chown=node:node src/ ./src/
COPY --chown=node:node maps/ ./maps/
COPY --chown=node:node assets/environment/frontier-v1/ ./assets/environment/frontier-v1/
COPY --chown=node:node assets/environment/frontier-interactive-v1/manifest.json ./assets/environment/frontier-interactive-v1/manifest.json
COPY --chown=node:node assets/environment/frontier-interactive-v1/berries-depleted.webp assets/environment/frontier-interactive-v1/berries-full.webp assets/environment/frontier-interactive-v1/berries-low.webp assets/environment/frontier-interactive-v1/berries-worked.webp ./assets/environment/frontier-interactive-v1/
COPY --chown=node:node assets/environment/frontier-interactive-v1/construction-earthwork.webp assets/environment/frontier-interactive-v1/construction-foundation.webp assets/environment/frontier-interactive-v1/oak-depleted.webp ./assets/environment/frontier-interactive-v1/
COPY --chown=node:node assets/environment/frontier-interactive-v1/oak-full.webp assets/environment/frontier-interactive-v1/oak-low.webp assets/environment/frontier-interactive-v1/oak-worked.webp ./assets/environment/frontier-interactive-v1/
COPY --chown=node:node assets/ui/ ./assets/ui/
COPY --chown=node:node assets/environment/frontier-cliff-pilot-v1/runtime/ ./assets/environment/frontier-cliff-pilot-v1/runtime/
COPY deploy/entrypoint.sh ./deploy/entrypoint.sh
RUN mkdir -p /app/custom-maps /app/room-data && chown node:node /app/custom-maps /app/room-data

EXPOSE 4173
ENTRYPOINT ["/bin/sh", "/app/deploy/entrypoint.sh"]
