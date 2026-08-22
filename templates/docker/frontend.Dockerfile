# Frontend (Next.js), voor ontwikkeling.
FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .

EXPOSE {{FRONTEND_PORT}}

# Next.js leest de poort uit de omgevingsvariabele PORT, NIET uit .env - dat is
# uitgeprobeerd. Daarom staat -p hier expliciet, met dezelfde waarde als in
# package.json, zodat beide manieren van draaien op dezelfde poort uitkomen.
CMD ["npm", "run", "dev"]
