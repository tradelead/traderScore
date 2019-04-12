const BigNumber = require('bignumber.js');

module.exports = class OrderService {
  constructor({ orderRepo, portfolioService }) {
    this.orderRepo = orderRepo;
    this.portfolioService = portfolioService;
  }

  async add(order) {
    try {
      const addProm = this.orderRepo.add(order);
      await this.updatePortfolio(order);
      return await addProm;
    } catch (cause) {
      throw cause;
    }
  }

  async updatePortfolio(order) {
    let assetPortfolioFn;
    if (order.side === 'buy') {
      assetPortfolioFn = this.portfolioService.incr.bind(this.portfolioService);
    } else if (order.side === 'sell') {
      assetPortfolioFn = this.portfolioService.decr.bind(this.portfolioService);
    }

    await assetPortfolioFn({
      traderID: order.traderID,
      exchangeID: order.exchangeID,
      asset: order.asset,
      time: order.time,
      quantity: order.quantity,
    });

    let quoteAssetPortfolioFn;
    if (order.side === 'buy') {
      quoteAssetPortfolioFn = this.portfolioService.decr.bind(this.portfolioService);
    } else if (order.side === 'sell') {
      quoteAssetPortfolioFn = this.portfolioService.incr.bind(this.portfolioService);
    }

    await quoteAssetPortfolioFn({
      traderID: order.traderID,
      exchangeID: order.exchangeID,
      asset: order.quoteAsset,
      time: order.time,
      quantity: new BigNumber(order.quantity).times(order.price).toNumber(),
    });

    if (order.fee && order.fee.quantity > 0 && order.fee.asset) {
      await this.portfolioService.decr({
        traderID: order.traderID,
        exchangeID: order.exchangeID,
        asset: order.fee.asset,
        time: order.time,
        quantity: order.fee.quantity,
      });
    }
  }

  getFilledOrders(...req) {
    return this.orderRepo.getFilledOrders(...req);
  }

  use(...req) {
    return this.orderRepo.use(...req);
  }
};
