FROM node:20-alpine as build

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build TypeScript code
RUN npm run build

# Second stage: Production stage
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --production

# Copy built files from build stage
COPY --from=build /app/dist ./dist

# Copy and setup entrypoint script
COPY docker-entrypoint.sh .
RUN chmod +x docker-entrypoint.sh

# Expose port if needed (adjust port number as required)
EXPOSE 3000

# Use the entrypoint script to run both services
ENTRYPOINT ["./docker-entrypoint.sh"] 