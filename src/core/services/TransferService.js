module.exports = class TransferService {
  constructor({ transferRepo, portfolioService }) {
    this.transferRepo = transferRepo;
    this.portfolioService = portfolioService;
  }

  async addDeposit(deposit) {
    const insertProm = this.transferRepo.addDeposit(deposit);

    const incrProm = this.portfolioService.incr({
      traderID: deposit.traderID,
      exchangeID: deposit.exchangeID,
      asset: deposit.asset,
      time: deposit.time,
      quantity: deposit.quantity,
    });

    try {
      await incrProm;
      return await insertProm;
    } catch (cause) {
      throw cause;
    }
  }

  async addWithdrawal(withdrawal) {
    const insertProm = this.transferRepo.addWithdrawal(withdrawal);

    const incrProm = this.portfolioService.decr({
      traderID: withdrawal.traderID,
      exchangeID: withdrawal.exchangeID,
      asset: withdrawal.asset,
      time: withdrawal.time,
      quantity: withdrawal.quantity,
    });

    try {
      await incrProm;
      return await insertProm;
    } catch (cause) {
      throw cause;
    }
  }

  findDeposits(...req) {
    return this.transferRepo.findDeposits(...req);
  }

  findWithdrawals(...req) {
    return this.transferRepo.findWithdrawals(...req);
  }

  use(...req) {
    return this.transferRepo.use(...req);
  }
};
