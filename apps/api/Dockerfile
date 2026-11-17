FROM node:22-alpine AS build
WORKDIR /workspace
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
# The workspace lockfile lists every importer, so all workspace manifests must be present
# for a reproducible --frozen-lockfile install; --filter limits what is actually installed.
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile --filter @jengaflow/api...
COPY apps/api apps/api
RUN pnpm --filter @jengaflow/api build

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /workspace
COPY --from=build /workspace/node_modules ./node_modules
COPY --from=build /workspace/apps/api/package.json ./apps/api/package.json
COPY --from=build /workspace/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /workspace/apps/api/dist ./apps/api/dist
WORKDIR /workspace/apps/api
EXPOSE 3001
USER node
CMD ["node", "dist/main.js"]
