FROM node:22-alpine

RUN addgroup --system app && adduser --system --ingroup app app

COPY package.json /app/package.json
WORKDIR /app

RUN npm install --omit=dev

COPY . .

EXPOSE 3000
USER app

CMD ["node", "src/index.js"]
