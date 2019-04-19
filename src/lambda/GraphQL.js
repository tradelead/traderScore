const { ApolloServer } = require('apollo-server-lambda');

const schema = require('../../src/api/graphql/schema');

const server = new ApolloServer({ schema });

exports.handler = server.createHandler();
