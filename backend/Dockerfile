FROM node:24-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000

# Usando tsx para rodar TypeScript em desenvolvimento
CMD ["npx", "tsx", "watch", "src/index.ts"]
