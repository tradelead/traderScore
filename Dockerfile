FROM node:10.15-alpine

WORKDIR /usr/app

RUN npm install knex -g

COPY . /usr/app

WORKDIR /usr/app/src/adapters/knex

ENTRYPOINT ["tail", "-f", "/dev/null"]
