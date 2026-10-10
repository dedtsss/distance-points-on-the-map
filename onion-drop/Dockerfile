FROM node:22-alpine
RUN apk add --no-cache tor && mkdir -p /var/lib/onion-drop /var/lib/tor && chown -R node:node /var/lib/onion-drop /var/lib/tor
WORKDIR /app
COPY package.json server.mjs torrc ./
COPY start.sh ./
RUN chmod +x start.sh
USER node
VOLUME ["/var/lib/tor", "/var/lib/onion-drop"]
ENTRYPOINT ["./start.sh"]
