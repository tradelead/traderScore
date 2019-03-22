const BigNumber = require('bignumber.js');

module.exports = class TraderPortfolioService {
  constructor({ traderPortfolioRepo, exchangeService }) {
    this.traderPortfolioRepo = traderPortfolioRepo;
    this.exchangeService = exchangeService;
  }

  async BTCValue({ traderID, time }) {
    const snapshot = await this.traderPortfolioRepo.portfolioSnapshot({ traderID, time });

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
};
