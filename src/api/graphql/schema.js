const { makeExecutableSchema } = require('graphql-tools');
const Long = require('graphql-type-long');
const app = require('../../../app.bootstrap');

const typeDefs = `
scalar Long

input ScoreInput {
  "A milliseconds timestamp"
  startTime: Long
  "A milliseconds timestamp"
  endTime: Long
  limit: Int!
  "A score period. If empty, global score period is assumed"
  period: String
}

type Score {
  score: Float!
  period: String!
  "A milliseconds timestamp"
  time: Long!
}

type Trader {
  id: ID!
  rank: Int
  scores(input: ScoreInput): [Score!]
}

type Query {
  getTrader(id: ID!): Trader!
  "If period is empty, then global score period is assumed"
  getTopTraders(period: String, limit: Int!): [Trader!]
}

schema {
  query: Query
}
`;

const resolvers = {
  Query: {
    async getTrader(root, { id }) {
      const traderRanks = await app.useCases.getTradersRank({ traderIDs: [id] });
      return {
        id,
        rank: traderRanks[id],
      };
    },
    async getTopTraders(root, { period, limit }) {
      const traders = await app.useCases.getTopTraders({ period, limit });
      return traders.map(trader => Object.assign(trader, { id: trader.traderID }));
    },
  },
  Trader: {
    async scores(trader, { input }) {
      return app.useCases.getTraderScoreHistory(Object.assign({}, input, {
        traderID: trader.id,
      }));
    },
  },
  Long,
};

module.exports = makeExecutableSchema({
  typeDefs,
  resolvers,
});
