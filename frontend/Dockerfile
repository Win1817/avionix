# Stage 1: Build Vite app
FROM node:20-alpine AS builder
WORKDIR /app

# Build-time args — Vite bakes these into the JS bundle at build time
ARG VITE_KEYCLOAK_URL=http://phantomx.zapto.org
ARG VITE_KEYCLOAK_REALM=avionix
ARG VITE_KEYCLOAK_CLIENT_ID=avionix-frontend
ARG VITE_API_URL=http://phantomx.zapto.org/api
ARG VITE_WS_URL=ws://phantomx.zapto.org/ws

ENV VITE_KEYCLOAK_URL=$VITE_KEYCLOAK_URL
ENV VITE_KEYCLOAK_REALM=$VITE_KEYCLOAK_REALM
ENV VITE_KEYCLOAK_CLIENT_ID=$VITE_KEYCLOAK_CLIENT_ID
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_WS_URL=$VITE_WS_URL

COPY package.json ./
RUN npm install --no-audit --no-fund
COPY . ./
RUN npm run build

# Stage 2: Serve with nginx
FROM nginx:alpine AS final
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://localhost:80/ || exit 1
CMD ["nginx", "-g", "daemon off;"]
