FROM node:24-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

USER node
EXPOSE 3000

# Apply any pending migrations, then start the API. Settings come from the
# container environment (see docker-compose.yml); no .env file is copied in.
CMD ["sh", "-c", "node scripts/migrate.js up && node src/server.js"]
