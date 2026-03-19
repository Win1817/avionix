FROM node:20-alpine AS deps
WORKDIR /app
COPY fdps-service/package.json ./
RUN npm install --omit=dev --no-audit --no-fund

FROM node:20-alpine AS final
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY fdps-service/package.json ./
COPY fdps-service/src ./src
COPY shared ./shared
ENV NODE_ENV=production
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://localhost:3001/health || exit 1
CMD ["node", "src/index.js"]
