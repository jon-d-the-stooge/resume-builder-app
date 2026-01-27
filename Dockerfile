# Build stage - compile TypeScript and native modules
FROM node:20-alpine AS builder

# Install build dependencies for native modules (better-sqlite3)
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files first (better layer caching)
COPY package*.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source code and TypeScript configs
COPY tsconfig.json tsconfig.backend.json ./
COPY src/ ./src/

# Build the backend
RUN npm run build:backend

# Production stage - minimal runtime image
FROM node:20-alpine AS production

# Install runtime dependencies for better-sqlite3
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only and rebuild native modules
RUN npm ci --omit=dev && \
    npm rebuild better-sqlite3

# Remove build tools after native module compilation
RUN apk del python3 make g++

# Copy compiled backend code from builder
COPY --from=builder /app/dist ./dist

# Create data directory for SQLite
RUN mkdir -p /app/data

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3001
ENV DATA_DIR=/app/data

# Expose the API port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3001/api/health || exit 1

# Run the server
CMD ["node", "dist/backend/server.js"]
