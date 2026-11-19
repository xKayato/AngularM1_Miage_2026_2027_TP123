# 1. Build de production Angular
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx ng build --base-href /

# 2. Service statique + proxy /api vers le backend
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/gpc/browser /usr/share/nginx/html
EXPOSE 80
