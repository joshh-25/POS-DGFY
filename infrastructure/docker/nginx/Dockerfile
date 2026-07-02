FROM nginx:alpine
RUN apk add --no-cache curl
COPY infrastructure/docker/nginx/conf.d/skupervisor.dgfy.ph.conf /etc/nginx/conf.d/skupervisor.dgfy.ph.conf
COPY infrastructure/docker/nginx/conf.d/pos.dgfy.ph.conf /etc/nginx/conf.d/pos.dgfy.ph.conf
COPY infrastructure/docker/nginx/conf.d/dgfy.ph.conf /etc/nginx/conf.d/dgfy.ph.conf
COPY infrastructure/docker/nginx/conf.d/00-default.conf /etc/nginx/conf.d/00-default.conf
RUN rm -f /etc/nginx/conf.d/default.conf

EXPOSE 80 443

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -fsS http://localhost/nginx-health || exit 1

CMD ["nginx", "-g", "daemon off;"]
