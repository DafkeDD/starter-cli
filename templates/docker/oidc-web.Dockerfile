# De schermen van de OIDC-hub, voor ontwikkeling.
#
# Deze app publiceert bewust GEEN poort naar buiten: alleen de hub praat ermee,
# binnen het compose-netwerk. Zou je hem wel publiceren, dan kon je hem
# rechtstreeks bezoeken - en dan klopt de _interaction-cookie niet, want die
# staat op de origin van de hub.
FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .

EXPOSE {{OIDC_WEB_PORT}}
CMD ["npm", "run", "dev"]
