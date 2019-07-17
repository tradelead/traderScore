const BigNumber = require('bignumber.js');

module.exports = class PortfolioService {
  constructor({ portfolioRepo, exchangeService }) {
    this.portfolioRepo = portfolioRepo;
    this.exchangeService = exchangeService;
    this.traderExchangeExists = this.portfolioRepo.traderExchangeExists.bind(this.portfolioRepo);
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

  async incr(args) {
    const res = await this.portfolioRepo.incr(args);
    return res;
  }

  async decr(args) {
    const res = await this.portfolioRepo.decr(args);
    return res;
  }

  snapshot(args) {
    return this.portfolioRepo.snapshot(args);
  }
};
