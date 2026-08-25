# Hugging Face Docker Space image for the skills-over-mcp demo server.
# Built from a staged bundle (see assemble.ps1): server source + demo skills.
FROM node:22-alpine

WORKDIR /app

# Install deps first (layer cache). typescript is a devDependency, so full install.
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
COPY skills ./skills
RUN npm run build

# HF routes external HTTPS to app_port (7860 in the Space README). Bind all
# interfaces and disable the Host/Origin guards — they defend localhost binds
# against DNS rebinding; here the Space's routing is the access control.
EXPOSE 7860

# --dice-roller: opt-in roll_dice tool + MCP Apps UI (not part of SEP-2640;
# ChatGPT connector creation requires a working tools surface).
CMD ["node", "dist/http.js", "--host", "0.0.0.0", "--port", "7860", "--public", "--dice-roller"]
