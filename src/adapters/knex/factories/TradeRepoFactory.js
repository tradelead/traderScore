const TradeRepo = require('../TradeRepo');

module.exports = class TradeRepoFactory {
  create({ knexConn }) {
    return new TradeRepo({ knexConn });
  }
};
