# ---------- 前端构建 ----------
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---------- 运行时 ----------
FROM node:24-slim
WORKDIR /app/server
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev
COPY backend/src ./src
COPY --from=build /app/dist /app/dist

ENV PORT=3000 \
    DATA_DIR=/app/data \
    NODE_ENV=production
EXPOSE 3000
VOLUME /app/data
CMD ["node", "src/index.mjs"]
