FROM node:22-alpine AS build
WORKDIR /workspace
RUN corepack enable
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
RUN pnpm install --no-frozen-lockfile
COPY apps/api apps/api
RUN pnpm --filter @payroll/api build

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /workspace/apps/api/package.json ./package.json
COPY --from=build /workspace/apps/api/dist ./dist
COPY --from=build /workspace/node_modules ./node_modules
EXPOSE 3001
USER node
CMD ["node", "dist/main.js"]
