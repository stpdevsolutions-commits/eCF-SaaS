FROM node:24-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
FROM node:24-alpine
WORKDIR /app
RUN apk add --no-cache dumb-init
COPY package*.json ./
RUN npm ci --only=production
COPY --from=builder /app/dist ./dist
USER node
# wget (busybox, ya viene en la imagen) en vez de "node -e": levantar un
# proceso de Node nuevo por chequeo (cada 30s) competía por CPU con el
# servidor bajo carga real y superaba el timeout de 3s aunque la API
# respondiera bien — daba "unhealthy" por lentitud del check, no de la app.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD wget -qO- http://localhost:3000/health || exit 1
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main.js"]
EXPOSE 3000
