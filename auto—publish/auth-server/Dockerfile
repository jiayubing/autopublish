FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY src ./src
COPY scripts ./scripts
RUN mkdir -p /data && chown -R node:node /app /data
USER node
ENV PORT=3180 AUTH_DB_PATH=/data/auth.json
EXPOSE 3180
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "require('http').get('http://127.0.0.1:3180/healthz',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"
CMD ["node", "src/server.js"]
