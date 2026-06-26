# Build Stage
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm ci
COPY src ./src
RUN npm run build

# Production Stage
FROM node:22-alpine AS runner
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/build ./build

ENV PORT=3000
ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "build/src/index.js"]
