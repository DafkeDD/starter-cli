# De OIDC-hub, voor ontwikkeling.
FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .

EXPOSE {{OIDC_PORT}}
CMD ["npm", "run", "dev"]
