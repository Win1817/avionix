FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm ci --only=production
COPY src ./src
COPY ../../shared ./shared
ENV NODE_ENV=production
EXPOSE 3009
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://localhost:3009/health || exit 1
CMD ["node", "src/index.js"]
