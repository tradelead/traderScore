module.exports = class RemoveTraderExchange {
  constructor({ exchangeIngressRepo }) {
    this.exchangeIngressRepo = exchangeIngressRepo;
  }

  async execute({ traderID, exchangeID }) {
    console.log('RemoveTraderExchange', { traderID, exchangeID });
    await this.exchangeIngressRepo.markIncomplete({ traderID, exchangeID });
    console.log('RemoveTraderExchange: complete', { traderID, exchangeID });
  }
};
