# API MakerShare (Express 5 / Mongoose 9)
FROM node:24-alpine

WORKDIR /app/backend
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src
COPY scripts ./scripts

# Les fichiers téléversés (pièces jointes, couvertures, avatars) vivent dans data/uploads,
# monté en volume par docker-compose pour survivre aux redémarrages.
RUN mkdir -p data/uploads && chown -R node:node /app
USER node

EXPOSE 3000

# SEED_DEMO=true charge le jeu de démonstration (idempotent) avant de lancer l'API.
CMD ["sh", "-c", "if [ \"$SEED_DEMO\" = \"true\" ]; then node scripts/seed-demo.js && node scripts/seed-enrich-media.js; fi && exec node src/server.js"]
