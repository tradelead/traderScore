const PortfolioRepo = require('../PortfolioRepo');

module.exports = class PortfolioRepoFactory {
  create({ knexConn }) {
    return new PortfolioRepo({ knexConn });
  }
};
