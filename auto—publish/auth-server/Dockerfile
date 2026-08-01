FROM node:22.16.0-alpine3.22 AS builder
WORKDIR /app
COPY package.json ./
COPY src ./src
COPY scripts ./scripts
COPY migrations ./migrations
RUN node --check src/server.js && node --check src/auth-domain.js

FROM node:22.16.0-alpine3.22
WORKDIR /app
COPY --from=builder /app/package.json ./
COPY --from=builder /app/src ./src
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/migrations ./migrations
RUN mkdir -p /data && chown -R node:node /app /data
USER node
ENV PORT=3180 AUTH_DB_PATH=/data/auth.db
ENV HOST=0.0.0.0
EXPOSE 3180
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "require('http').get('http://127.0.0.1:3180/healthz/live',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"
CMD ["node", "src/server.js"]
