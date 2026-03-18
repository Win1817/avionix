FROM node:20-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json ./
RUN npm ci --only=production

FROM base AS final
COPY --from=deps /app/node_modules ./node_modules
COPY src ./src
COPY ../../shared ./shared
COPY package.json ./
ENV NODE_ENV=production
EXPOSE 3007
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://localhost:3007/health || exit 1
CMD ["node", "src/index.js"]
