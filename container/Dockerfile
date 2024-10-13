
FROM alpine:latest

WORKDIR /app


RUN apk add --no-cache \
    curl ffmpeg nodejs npm


COPY . .

COPY package*.json ./
RUN npm install
EXPOSE 3001
CMD ["node", "index.js"]
