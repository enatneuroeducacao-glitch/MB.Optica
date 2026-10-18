FROM node:22-alpine
ENV NODE_ENV=production
ENV PORT=10000
WORKDIR /app
COPY package.json server.js ./
RUN npm run check
EXPOSE 10000
USER node
CMD ["npm", "start"]
