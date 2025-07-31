FROM mcr.microsoft.com/playwright:v1.52.0-noble

RUN apt-get update
RUN apt-get install -y xvfb

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

ENV IS_DOCKER=true

COPY *.json ./
COPY *.ts ./
COPY db/*.ts ./db/

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

  
CMD ["xvfb-run", "-s", "-screen 0 1280x720x24", "pnpm", "ts-node", "main_smartstore.ts"]
