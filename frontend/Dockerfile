FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
EXPOSE 5173
ENV API_PROXY_TARGET=http://backend:3000

# O parâmetro --host expõe o app para fora do contêiner
CMD ["npm", "run", "dev", "--", "--host"]
