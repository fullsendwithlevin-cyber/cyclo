# Produktions-Image: Next.js (standalone) + Worker in einem Image, Rolle über CMD.
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npx next build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
RUN useradd --system --uid 1001 app && mkdir -p /app/storage && chown app /app/storage
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
# Worker + Migrationen brauchen Quellcode und Abhängigkeiten
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/lib ./lib
COPY --from=build /app/workers ./workers
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts /app/tsconfig.json /app/package.json ./
USER app
EXPOSE 3000
CMD ["node", "server.js"]
