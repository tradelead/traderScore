FROM node:10.15-alpine

WORKDIR /usr/app

RUN npm install knex -g

COPY . /usr/app

WORKDIR /usr/app/src/adapters/knex

ENTRYPOINT knex migrate:latest && /usr/app/node_modules/.bin/jest --detectOpenHandles int
