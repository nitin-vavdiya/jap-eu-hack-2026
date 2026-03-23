FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* ./

RUN --mount=type=cache,target=/root/.npm \
    npm ci

COPY . .

RUN npm run build

# Production stage
FROM node:20-alpine AS production
WORKDIR /app

COPY package.json package-lock.json* ./

RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev

COPY --from=build /app/dist ./dist

# git is needed for committing Helm values + Argo Application manifests
RUN apk add --no-cache git

EXPOSE 3001

CMD ["node", "dist/index.js"]
