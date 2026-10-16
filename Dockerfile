# The blog sample served over GraphQL; point it at any database with DATABASE_URL.
FROM node:24.18.0-alpine AS build
RUN npm install -g pnpm@11.17.0
WORKDIR /repo

# Downloads every dependency from the lockfile alone, so code changes keep this layer cached.
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch

COPY . .
RUN pnpm install --offline --frozen-lockfile
RUN pnpm turbo run build --filter blog-sample...
# Copies the sample with its production dependencies, the library included, into /app.
RUN pnpm --filter blog-sample deploy --prod --legacy /app

FROM node:24.18.0-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app .
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
