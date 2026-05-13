# OfferGo · Railway 部署 Dockerfile
# 绕开 Nixpacks 的 BuildKit 缓存挂载（会锁定 node_modules/.cache 导致 EBUSY）

FROM node:22-slim AS builder

WORKDIR /app

# 安装系统依赖：better-sqlite3 在某些环境下需要这些（虽然有预编译包，但兜底）
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# 先复制 package 文件，利用 Docker 层缓存
COPY package.json package-lock.json ./

# 安装所有依赖（含 devDependencies，build 需要 tsx、vite）
RUN npm ci --no-audit --no-fund

# 复制源码
COPY . .

# 构建：前端 vite + 后端 esbuild
RUN npm run build

# =========== Runtime Stage ===========
FROM node:22-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production

# 只复制构建产物 + 运行时依赖
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Railway 会通过 PORT 环境变量注入端口
EXPOSE 5000

CMD ["node", "dist/index.cjs"]
