const TradeService = require('../../../core/services/TradeService');

module.exports = class TradeServiceFactory {
  constructor({
    numRecentTrades,
    tradeRepoFactory,
    exchangeService,
    portfolioServiceFactory,
    orderServiceFactory,
    transferServiceFactory,
    scoreServiceFactory,
    entryServiceFactory,
  }) {
    this.numRecentTrades = numRecentTrades;
    this.exchangeService = exchangeService;
    this.tradeRepoFactory = tradeRepoFactory;
    this.portfolioServiceFactory = portfolioServiceFactory;
    this.orderServiceFactory = orderServiceFactory;
    this.transferServiceFactory = transferServiceFactory;
    this.scoreServiceFactory = scoreServiceFactory;
    this.entryServiceFactory = entryServiceFactory;
  }

  create(req) {
    const newReq = Object.assign({}, req);
    newReq.numRecentTrades = this.numRecentTrades;
    newReq.exchangeService = this.exchangeService;
    newReq.tradeRepo = this.tradeRepoFactory.create(req);
    newReq.portfolioService = this.portfolioServiceFactory.create(req);
    newReq.orderService = this.orderServiceFactory.create(req);
    newReq.transferService = this.transferServiceFactory.create(req);
    newReq.scoreService = this.scoreServiceFactory.create(req);
    newReq.entryService = this.entryServiceFactory.create(req);
    return new TradeService(newReq);
  }
};
