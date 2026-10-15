FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /workspace

FROM base AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY packages/types/package.json packages/types/package.json
COPY packages/sdk/package.json packages/sdk/package.json
RUN pnpm install --frozen-lockfile
COPY apps/api/prisma apps/api/prisma
RUN pnpm --filter @standix/api prisma:generate

FROM dependencies AS build
COPY . .
RUN pnpm --filter @standix/api build

FROM base AS production
ENV NODE_ENV=production
COPY --from=dependencies /workspace/package.json /workspace/package.json
COPY --from=dependencies /workspace/pnpm-workspace.yaml /workspace/pnpm-workspace.yaml
COPY --from=dependencies /workspace/node_modules /workspace/node_modules
COPY --from=dependencies /workspace/apps/api/node_modules /workspace/apps/api/node_modules
COPY --from=dependencies /workspace/apps/api/prisma /workspace/apps/api/prisma
COPY --from=dependencies /workspace/apps/api/package.json /workspace/apps/api/package.json
COPY --from=build /workspace/apps/api/dist /workspace/apps/api/dist
COPY --from=dependencies /workspace/packages /workspace/packages
WORKDIR /workspace
EXPOSE 3001
CMD ["sh", "-c", "pnpm --filter @standix/api prisma:migrate:deploy && pnpm --filter @standix/api prisma:seed && node apps/api/dist/main.js"]
