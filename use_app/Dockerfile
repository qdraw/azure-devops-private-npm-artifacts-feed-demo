# Install dependencies only when needed
FROM node:16-alpine AS deps
ARG DEMO_NPM_REFRESH_TOKEN=default
ARG AZURE_AUTH_TOKEN=default

RUN apk add --no-cache libc6-compat
WORKDIR /app

ENV DEMO_NPM_REFRESH_TOKEN=$DEMO_NPM_REFRESH_TOKEN
ENV AZURE_AUTH_TOKEN=$AZURE_AUTH_TOKEN

COPY use_app/scripts/preinstall.js ./scripts/preinstall.js
COPY use_app/scripts/cleanauth.js ./scripts/cleanauth.js
COPY use_app/package.json ./

RUN node scripts/preinstall.js
RUN npm ci --prefer-offline

RUN node scripts/cleanauth.js