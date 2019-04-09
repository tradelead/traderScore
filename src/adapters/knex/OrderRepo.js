const VError = require('verror');
const BigNumber = require('bignumber.js');
const msToMySQLFormat = require('./msToMySQLFormat');

module.exports = class PortfolioRepo {
  constructor({ knexConn, portfolioRepoFactory }) {
    this.knexConn = knexConn;
    this.portfolioRepo = portfolioRepoFactory.create(knexConn);
    this.tableName = 'orders';
  }

  async add(order) {
    if (!order.valid()) {
      const info = { order };
      const cause = new Error('invalid order');
      throw new VError({ name: 'BadRequest', cause, info }, 'error adding order');
    }

    const obj = Object.assign({}, order);
    obj.time = msToMySQLFormat(obj.time);
    obj.quantityUnused = obj.quantity;
    delete obj.fee;
    if (order.fee) {
      obj.feeAsset = order.fee.asset;
      obj.feeQuantity = order.fee.quantity;
    }

    const insertProm = this.knexConn.insert(obj, ['ID']).into(this.tableName);

    const incrProm = this.portfolioRepo.incr({
      traderID: order.traderID,
      exchangeID: order.exchangeID,
      asset: order.asset,
      time: order.time,
      quantity: order.quantity,
    });

    try {
      await incrProm;
      return await insertProm;
    } catch (cause) {
      const info = { order };
      throw new VError({ cause, info }, 'error adding order');
    }
  }

  async getFilledOrders({
    traderID,
    exchangeID,
    asset,
    startTime,
    endTime,
    limit,
    sort,
    unused,
  }) {
    const filters = {
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

    return query;
  }

  async use({
    traderID,
    exchangeID,
    sourceID,
    quantity,
  }) {
    const [item] = await this.knexConn
      .select('quantityUnused', 'quantity')
      .from(this.tableName)
      .where({
        traderID,
        exchangeID,
        sourceID,
      });

    const quantityUnusedNum = new BigNumber(item.quantityUnused);
    const newQuantityUnused = quantityUnusedNum.minus(quantity).toNumber();

    if (newQuantityUnused < 0) {
      const info = {
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
        traderID,
        exchangeID,
        sourceID,
      })
      .update('quantityUnused', newQuantityUnused);
  }
};
