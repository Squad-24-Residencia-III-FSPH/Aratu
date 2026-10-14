FROM node:24-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 5173

# O parâmetro --host expõe o app para fora do contêiner
CMD ["npm", "run", "dev", "--", "--host"]
