FROM node:20-alpine AS build
WORKDIR /app

# Copy root workspace files
COPY package.json package-lock.json ./
COPY packages ./packages
COPY apps/portal-insurance/package.json ./apps/portal-insurance/

# Install dependencies
RUN npm ci --workspace=apps/portal-insurance --include-workspace-root

# Copy app source
COPY apps/portal-insurance ./apps/portal-insurance

# Build
RUN npm run build --workspace=apps/portal-insurance

# Serve with nginx
FROM nginx:alpine
COPY --from=build /app/apps/portal-insurance/dist /usr/share/nginx/html

# Support SPA routing
RUN echo 'server { listen 80; root /usr/share/nginx/html; index index.html; location / { try_files $uri $uri/ /index.html; } }' > /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
