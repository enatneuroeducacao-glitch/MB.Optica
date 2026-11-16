FROM postgres:18-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends nodejs npm ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY server.js ./
ENV NODE_ENV=production PORT=10000
EXPOSE 10000
CMD ["node","server.js"]
