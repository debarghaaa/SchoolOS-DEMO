# SchoolOS frontend: Vite build served by nginx (non-root, :8080).
# The SPA calls the API same-origin (/api proxied to the backend), so no
# VITE_API_BASE is needed behind this container; pass it as a build arg
# only when the API lives on another origin.
#
#   docker build -t schoolos/web:1.0 .
#   docker run -p 3000:8080 schoolos/web:1.0

# ---------- builder: compile the SPA ----------
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG VITE_API_BASE=""
ARG VITE_SUPABASE_URL=""
ARG VITE_SUPABASE_ANON_KEY=""
ENV VITE_API_BASE=$VITE_API_BASE \
    VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

RUN npm run build

# ---------- runtime: static files + nginx ----------
FROM nginx:1.27-alpine AS runtime

COPY nginx.conf /etc/nginx/nginx.conf
COPY --from=builder /app/dist /usr/share/nginx/html

RUN chown -R nginx:nginx /usr/share/nginx/html /var/cache/nginx \
    && chmod -R 755 /usr/share/nginx/html

USER nginx

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
