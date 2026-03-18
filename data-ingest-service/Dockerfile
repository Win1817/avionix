FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm ci --only=production
COPY src ./src
COPY ../../shared ./shared
ENV NODE_ENV=production
EXPOSE 3008
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://localhost:3008/health || exit 1
CMD ["node", "src/index.js"]
