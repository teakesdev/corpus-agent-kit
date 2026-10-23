# Corpus MCP server (stdio). A thin client of the hosted server at
# corpuslaw.us: every MCP request is forwarded there, so the container needs
# outbound HTTPS and nothing else. No API key is required to start it or to
# list tools; set CORPUS_API_KEY for higher search limits.
#
#   docker build -t corpus-mcp .
#   docker run -i --rm corpus-mcp
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY mcp-server/package.json mcp-server/
RUN npm ci --workspace mcp-server --include-workspace-root=false
COPY tsconfig.base.json ./
COPY mcp-server/tsconfig.json mcp-server/
COPY mcp-server/src mcp-server/src
RUN npm run build --workspace mcp-server

# The server has no runtime dependencies, so the final image is just the
# compiled output on a clean Node.
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/mcp-server/package.json ./
COPY --from=build /app/mcp-server/dist ./dist
USER node
ENTRYPOINT ["node", "dist/index.js"]
