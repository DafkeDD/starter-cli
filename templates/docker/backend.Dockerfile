# Backend, voor ontwikkeling.
#
# De broncode wordt als volume gemount (zie docker-compose.yml), zodat je
# wijzigingen meteen ziet zonder opnieuw te bouwen. node_modules blijft in het
# image staan - anders zou de mount van je host de installatie overschrijven,
# en die is per platform verschillend.
FROM node:22-alpine

WORKDIR /app

# Eerst alleen de manifesten kopieren: zolang die niet wijzigen hergebruikt
# Docker de installatielaag en hoef je niet elke build opnieuw te installeren.
COPY package.json package-lock.json* ./
RUN npm install

COPY . .

EXPOSE {{BACKEND_PORT}}
CMD ["npm", "run", "{{BACKEND_DEV_SCRIPT}}"]
