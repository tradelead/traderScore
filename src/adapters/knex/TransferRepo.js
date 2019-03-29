const VError = require('verror');
const msToMySQLFormat = require('./msToMySQLFormat');

module.exports = class TransferRepo {
  constructor({ knexConn, portfolioRepoFactory }) {
    this.knexConn = knexConn;
    this.portfolioRepo = portfolioRepoFactory.create(knexConn);
  }

  async addDeposit(deposit) {
    if (!deposit.valid()) {
      const info = { deposit };
      const cause = new Error('invalid deposit');
      throw new VError({ name: 'BadRequest', cause, info }, 'error adding deposit');
    }

    const obj = Object.assign({}, deposit, { type: 'deposit' });
    obj.time = msToMySQLFormat(obj.time);
    const insertProm = this.knexConn.insert(obj, ['ID']).into('transfers');

    const incrProm = this.portfolioRepo.incr({
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
      const info = { deposit };
      throw new VError({ cause, info }, 'error adding deposit');
    }
  }

  async addWithdrawal(withdrawal) {
    if (!withdrawal.valid()) {
      const info = { withdrawal };
      const cause = new Error('invalid withdrawal');
      throw new VError({ name: 'BadRequest', cause, info }, 'error adding withdrawal');
    }

    const obj = Object.assign({}, withdrawal, { type: 'withdrawal' });
    const insertProm = this.knexConn.insert(obj, ['ID']).into('transfers');

    const incrProm = this.portfolioRepo.decr({
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
      const info = { withdrawal };
      throw new VError({ cause, info }, 'error adding withdrawal');
    }
  }

  async findDeposits({
    traderID,
    exchangeID,
    asset,
    limit,
    startTime,
    endTime,
    sort,
  }) {

  }

  async findWithdrawals({
    traderID,
    exchangeID,
    asset,
    limit,
    startTime,
    endTime,
    sort,
  }) {

  }
};
