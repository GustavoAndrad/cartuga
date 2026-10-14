FROM node:22-slim

WORKDIR /app

# The lockfile pins every dependency (including transitive security fixes): `npm ci`
# installs exactly that, never whatever is newest on the day of the build.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

EXPOSE 5173

CMD ["npm", "run", "dev"]
