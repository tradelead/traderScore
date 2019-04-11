const PortfolioService = require('../../../core/services/PortfolioService');

module.exports = class PortfolioServiceFactory {
  constructor({
    portfolioRepoFactory,
    exchangeService,
  }) {
    this.portfolioRepoFactory = portfolioRepoFactory;
    this.exchangeService = exchangeService;
  }

  create(req) {
    const newReq = Object.assign({}, req);
    newReq.portfolioRepo = this.portfolioRepoFactory.create(req);
    newReq.exchangeService = this.exchangeService;
    return new PortfolioService(newReq);
  }
};
