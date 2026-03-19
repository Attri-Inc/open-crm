FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY tsconfig.json ./
COPY src/ ./src/
RUN npx tsc -p tsconfig.json

RUN mkdir -p /data

ENV CRM_DB_PATH=/data/crm.db
ENV PORT=8787

EXPOSE 8787

CMD ["node", "dist/server.js"]
