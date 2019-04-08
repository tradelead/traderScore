const BigNumber = require('bignumber.js');

module.exports = class PortfolioService {
  constructor({ portfolioRepo, exchangeService }) {
    this.portfolioRepo = portfolioRepo;
    this.exchangeService = exchangeService;
  }

  async BTCValue({ traderID, time }) {
    const snapshot = await this.portfolioRepo.snapshot({ traderID, time });

    const sum = (acc, value) => {
      const accNum = new BigNumber(acc);
      return accNum.plus(value).toNumber();
    };

    const btcValues = await Promise.all(snapshot.map(async (portfolioItem) => {
      const { asset, exchangeID, quantity } = portfolioItem;

      const quoteAsset = await this.exchangeService.findMarketQuoteAsset({
        asset, exchangeID, preferredQuoteAsset: 'BTC',
      });

      return this.exchangeService.getBTCValue({
        asset,
        quoteAsset,
        exchangeID,
        qty: quantity,
        time,
      });
    }));

    return btcValues.reduce(sum, 0);
  }

  incr(args) {
    return this.portfolioRepo.incr(args);
  }

  decr(args) {
    return this.portfolioRepo.decr(args);
  }

  snapshot(args) {
    return this.portfolioRepo.snapshot(args);
  }
};
