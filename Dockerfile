FROM node:20-alpine

ENV NODE_ENV=production

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm ci --omit=dev

# Copy all source files (.dockerignore keeps .env, data/ etc. out of the image)
COPY . .

# Persistent data lives in /app/data; make it writable for the node user
RUN mkdir -p /app/data && chown -R node:node /app/data

# Never run as root inside the container
USER node

# Expose the defined port
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT:-3000}/healthz" || exit 1

# Start the application
CMD ["node", "server.js"]
