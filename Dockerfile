# Minimal Docker image for the Bid Othello WebSocket server.
#
# The server is a single-file Node app (`server/index.ts`) that imports
# pieces of the game core from `src/`. We use `tsx` at runtime so we do not
# need a separate compile step inside the image; this keeps the image small
# and avoids drifting between a server `dist/` and the client build output.

FROM node:20-alpine AS base
WORKDIR /app

# Install only the deps required by the server. tsx + ws + their peers come
# from package.json (they live in devDependencies for the client side, but
# Docker is the server-side runtime so we install them as runtime deps here
# by skipping the production-only flag).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev=false --no-audit --no-fund

# Copy only what the server needs at runtime.
COPY tsconfig.json ./
COPY server ./server
COPY src/core ./src/core
COPY src/net ./src/net

ENV NODE_ENV=production
ENV PORT=8787
EXPOSE 8787

# tsx is the runtime TypeScript loader; it handles ESM/CJS interop for the
# `node:` builtins used by `server/index.ts`.
CMD ["npx", "tsx", "server/index.ts"]
