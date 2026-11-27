FROM node:22-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# .dockerignore permits source inputs only. Runtime data and credentials are
# never part of the build context or image layers.
COPY --chown=node:node scripts/ ./scripts/
COPY --chown=node:node worker/ ./worker/
COPY --chown=node:node web/ ./web/
COPY --chown=node:node data/ ./data/
COPY --chown=node:node drizzle/ ./drizzle/
COPY --chown=node:node .openai/hosting.json ./.openai/hosting.json
RUN node scripts/build.mjs

ENV NODE_ENV=production \
    PORT=7860 \
    PCR_CLOUD_USERNAME=pcr \
    PCR_DB_PATH=/tmp/pcr-runtime/pcr.sqlite3 \
    PCR_PYTHON=python3 \
    PCR_OI_DAILY_ENABLED=0 \
    PCR_PUBLIC_VIEW=0
USER node
EXPOSE 7860
CMD ["node", "scripts/start-cloud.mjs"]
