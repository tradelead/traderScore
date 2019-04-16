const debug = require('debug')('traderScore:TransferRepo');
const VError = require('verror');
const BigNumber = require('bignumber.js');
const msToMySQLFormat = require('./msToMySQLFormat');

module.exports = class TransferRepo {
  constructor({ knexConn }) {
    this.knexConn = knexConn;
    this.tableName = 'transfers';
  }

  async addDeposit(deposit) {
    if (!deposit.valid()) {
      const info = { deposit };
      const cause = new Error('invalid deposit');
      throw new VError({ name: 'BadRequest', cause, info }, 'error adding deposit');
    }

    const obj = Object.assign({}, deposit, { type: 'deposit' });
    obj.time = msToMySQLFormat(obj.time);
    obj.quantityUnused = obj.quantity;
    const insertProm = this.knexConn.insert(obj, ['ID']).into(this.tableName);

    try {
      return insertProm;
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
    obj.quantityUnused = 0;
    obj.time = msToMySQLFormat(obj.time);

    debug('insert withdrawal %o', obj);
    const insertProm = this.knexConn.insert(obj, ['ID']).into(this.tableName);

    try {
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
    unused,
  }) {
    const filters = {
      type: 'deposit',
      traderID,
      exchangeID,
      asset,
    };
    // remove undefined
    Object.keys(filters).forEach(key => filters[key] === undefined && delete filters[key]);

    const query = this.knexConn
      .select()
      .from(this.tableName)
      .where(filters)
      .orderBy('time', sort)
      .limit(limit || 10);

    if (startTime > 0) {
      query.andWhere('time', '>=', msToMySQLFormat(startTime));
    }

    if (endTime > 0) {
      query.andWhere('time', '<=', msToMySQLFormat(endTime));
    }

    if (unused) {
      query.andWhere('quantityUnused', '>', 0);
    }

    const items = await query;
    return items.map(item => Object.assign({}, item, { time: new Date(item.time).getTime() }));
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
    const filters = {
      type: 'withdrawal',
      traderID,
      exchangeID,
      asset,
    };
    // remove undefined
    Object.keys(filters).forEach(key => filters[key] === undefined && delete filters[key]);

    const query = this.knexConn
      .select()
      .from(this.tableName)
      .where(filters)
      .orderBy('time', sort)
      .limit(limit || 10);

    if (startTime > 0) {
      query.andWhere('time', '>=', msToMySQLFormat(startTime));
    }

    if (endTime > 0) {
      query.andWhere('time', '<=', msToMySQLFormat(endTime));
    }

    const items = await query;
    return items.map(item => Object.assign({}, item, { time: new Date(item.time).getTime() }));
  }

  async use({
    type,
    traderID,
    exchangeID,
    sourceID,
    quantity,
  }) {
    const [item] = await this.knexConn
      .select('quantityUnused', 'quantity')
      .from(this.tableName)
      .where({
        type,
        traderID,
        exchangeID,
        sourceID,
      });

    const quantityUnusedNum = new BigNumber(item.quantityUnused);
    const newQuantityUnused = quantityUnusedNum.minus(quantity).toNumber();

    if (newQuantityUnused < 0) {
      const info = {
        type,
        traderID,
        exchangeID,
        sourceID,
        quantity,
      };
      throw new VError({ name: 'BadRequest', info }, 'not enough unused quantity');
    }

    await this.knexConn
      .into(this.tableName)
      .where({
        type,
        traderID,
        exchangeID,
        sourceID,
      })
      .update('quantityUnused', newQuantityUnused);
  }
};
