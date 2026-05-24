# Stage 1 — build frontend
FROM node:20-alpine AS frontend
WORKDIR /client
COPY client/package*.json ./
RUN npm install
COPY client/ ./
RUN npm run build

# Stage 2 — production server
FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY server/package*.json ./
RUN npm install --omit=dev
COPY server/src/ ./src/
COPY --from=frontend /client/dist ./client/dist
RUN mkdir -p data
EXPOSE 3000
CMD ["node", "src/index.js"]
