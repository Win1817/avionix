FROM node:20-alpine AS deps
WORKDIR /app
COPY api-gateway/package.json ./
RUN npm ci --only=production

FROM node:20-alpine AS final
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY api-gateway/package.json ./
COPY api-gateway/src ./src
COPY shared ./shared
ENV NODE_ENV=production
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://localhost:4000/health || exit 1
CMD ["node", "src/index.js"]
