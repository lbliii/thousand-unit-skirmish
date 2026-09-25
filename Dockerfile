FROM node:24-alpine

ENV NODE_ENV=production \
    RTS_HOST=0.0.0.0 \
    PORT=4173

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && apk add --no-cache su-exec
COPY --chown=node:node server.mjs room-supervisor.mjs origin-policy.mjs index.html style.css ./
COPY --chown=node:node src/ ./src/
COPY --chown=node:node maps/ ./maps/
COPY --chown=node:node assets/environment/frontier-v1/ ./assets/environment/frontier-v1/
COPY deploy/entrypoint.sh ./deploy/entrypoint.sh
RUN mkdir -p /app/custom-maps /app/room-data && chown node:node /app/custom-maps /app/room-data

EXPOSE 4173
ENTRYPOINT ["/bin/sh", "/app/deploy/entrypoint.sh"]
