const ExchangeIngressRepo = require('../ExchangeIngressRepo');

module.exports = class ExchangeIngressRepoFactory {
  create({ knexConn }) {
    return new ExchangeIngressRepo({ knexConn });
  }
};
