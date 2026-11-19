# API Guitar Practice Cloud (TP1 à TP3) — Express 5 / Mongoose 9
FROM node:24-alpine

WORKDIR /app/backend
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src

# Pistes audio et couvertures : data/uploads, monté en volume par docker-compose.
RUN mkdir -p data/uploads && chown -R node:node /app
USER node

EXPOSE 3000

# Au démarrage, l'API crée le compte de démonstration demo@example.com s'il n'existe pas.
CMD ["node", "src/server.js"]
