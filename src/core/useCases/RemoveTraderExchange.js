module.exports = class RemoveTraderExchange {
  constructor({ exchangeIngressRepo }) {
    this.exchangeIngressRepo = exchangeIngressRepo;
  }

  async execute({ traderID, exchangeID }) {
    await this.exchangeIngressRepo.markIncomplete({ traderID, exchangeID });
  }
};
