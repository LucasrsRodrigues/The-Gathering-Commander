# Single container: the Node server serves the online API/WebSocket and the built web app on the same
# origin. Works as-is on EasyPanel (or any Docker host behind an HTTPS proxy). See DEPLOY.md.

# ---- build the web app ----
FROM node:24-slim AS web
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages ./packages
COPY apps ./apps
RUN npm ci
# Same-origin build: the app talks to the server that serves it (overrides apps/web/.env).
ENV VITE_SERVER_URL="" VITE_SERVER_WS=""
RUN npm run build -w @gathering-hall/web

# ---- runtime ----
FROM node:24-slim
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages ./packages
COPY apps/server ./apps/server
# Only the manifest of the web app is needed to satisfy the workspace lockfile.
COPY apps/web/package.json ./apps/web/package.json
RUN npm ci --omit=dev --workspace @gathering-hall/server --include-workspace-root=false \
  && npm cache clean --force
COPY --from=web /app/apps/web/dist ./public
ENV NODE_ENV=production \
    PORT=8787 \
    DB_PATH=/data/rooms.db \
    STATIC_DIR=/app/public \
    TRUST_PROXY=1
RUN mkdir -p /data && chown node:node /data
VOLUME /data
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
# Panels like EasyPanel mount /data owned by root: fix ownership at start, then drop to the unprivileged
# "node" user to run the server (setpriv comes with util-linux in the Debian base image).
ENTRYPOINT ["/bin/sh", "-c", "mkdir -p \"$(dirname \"$DB_PATH\")\" && chown -R node:node \"$(dirname \"$DB_PATH\")\" && exec setpriv --reuid=node --regid=node --init-groups env HOME=/home/node node_modules/.bin/tsx apps/server/src/main.ts"]
