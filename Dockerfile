# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Instala dependências auxiliares se necessário
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY package*.json ./
# Instala apenas dependências necessárias para a execução em produção
RUN npm ci --only=production

# Copia os arquivos compilados e empacotados pelo esbuild e pelo vite
COPY --from=builder /app/dist ./dist

EXPOSE 3000

CMD ["node", "dist/server.cjs"]
