FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json ./
COPY prisma ./prisma
RUN npm install --no-audit --no-fund

FROM deps AS migrator
WORKDIR /app
COPY . .
CMD ["npx","prisma","migrate","deploy"]

FROM deps AS builder
WORKDIR /app
COPY . .
ENV DIRECT_URL=postgresql://postgres:postgres@localhost:5432/mb_optica?schema=public
RUN npx prisma generate
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=10000
ENV HOSTNAME=0.0.0.0
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/prisma ./prisma
EXPOSE 3000
CMD ["sh","-c","npx prisma migrate deploy && node server.js"]
