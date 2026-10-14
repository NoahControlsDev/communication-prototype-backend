FROM node:24-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

USER node
EXPOSE 3000

CMD ["sh", "-c", "node scripts/migrate.js up && node src/server.js"]
