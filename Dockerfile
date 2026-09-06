FROM node:20-alpine

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml* ./
COPY . .

RUN pnpm install --no-frozen-lockfile
RUN pnpm --filter !@workspace/mockup-sandbox --if-present run build || true

EXPOSE 10000

CMD ["pnpm", "start"]
