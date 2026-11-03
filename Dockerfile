# The game as a finished, runnable image, including the licensed sounds in assets/audio.
# Build it on a machine that has assets/audio, and keep the image private: see "Docker" in the README.
FROM node:24-alpine
WORKDIR /app
COPY index.html main.js LICENSE ./
COPY engine/ engine/
COPY rules/ rules/
COPY modules/ modules/
COPY data/ data/
COPY assets/game/ assets/game/
COPY assets/audio/ assets/audio/
COPY tools/serve.mjs tools/serve.mjs
ENV HOST=0.0.0.0 PORT=8080
USER node
EXPOSE 8080
HEALTHCHECK CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1
CMD ["node", "tools/serve.mjs"]
