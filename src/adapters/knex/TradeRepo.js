const Trade = require('../../core/models/Trade');
const msToMySQLFormat = require('./msToMySQLFormat');

function average(data) {
  const sum = data.reduce((acc, value) => acc + value, 0);

  return sum / data.length;
}

function standardDeviation(values) {
  const avg = average(values);

  const squareDiffs = values.map((value) => {
    const diff = value - avg;
    return diff * diff;
  });

  const avgSquareDiff = average(squareDiffs);

  return Math.sqrt(avgSquareDiff);
}

module.exports = class TradeRepo {
  constructor({ knexConn, numRecentTrades }) {
    this.knexConn = knexConn;
    this.numRecentTrades = numRecentTrades;
    this.tableName = 'trades';
  }

  async getTrade(id) {
    const [trade] = await this.knexConn
      .select()
      .from(this.tableName)
      .where({ ID: id })
      .limit(1);

    return TradeRepo.dbRowToTrade(trade);
  }

  async getTrades({
    traderID,
    startTime,
    endTime,
    limit,
    sort,
  }) {
    const query = this.knexConn
      .select()
      .from(this.tableName)
      .where({ traderID });

    if (startTime) {
      query.andWhere('exitTime', '>=', msToMySQLFormat(startTime));
    }

    if (endTime) {
      query.andWhere('exitTime', '<=', msToMySQLFormat(endTime));
    }

    query.orderBy('exitTime', sort || 'asc').limit(limit || 10);

    const trades = await query;
    return trades.map(TradeRepo.dbRowToTrade);
  }

  async addTrade(trade) {
    const dbObj = {
      traderID: trade.traderID,
      exchangeID: trade.exchangeID,
      asset: trade.asset,
      quoteAsset: trade.quoteAsset,
      quantity: trade.quantity,
      weight: trade.weight,
      score: trade.score,
      entrySourceID: trade.entry.sourceID,
      entrySourceType: trade.entry.sourceType,
      entryTime: msToMySQLFormat(trade.entry.time),
      entryPrice: trade.entry.price,
      exitSourceID: trade.sourceID,
      exitSourceType: trade.sourceType,
      exitTime: msToMySQLFormat(trade.exit.time),
      exitPrice: trade.exit.price,
    };

    const [ID] = await this.knexConn.insert(dbObj, ['ID']).into(this.tableName);
    return ID;
  }

  async getRecentDailyTradeChangeStdDev(traderID, exitTime) {
    const trades = await this.getTrades({
      traderID,
      endTime: exitTime,
      limit: this.numRecentTrades,
    });
    const dailyScores = trades.map((trade) => {
      const days = (trade.exit.time - trade.entry.time) / 24 * 60 * 60 * 1000;
      return trade.score / days;
    });
    return standardDeviation(dailyScores);
  }

  async getRecentDailyTradeChangeMean(traderID, exitTime) {
    const trades = await this.getTrades({
      traderID,
      endTime: exitTime,
      limit: this.numRecentTrades,
    });
    const dailyScores = trades.map((trade) => {
      const days = (trade.exit.time - trade.entry.time) / 24 * 60 * 60 * 1000;
      return trade.score / days;
    });
    return average(dailyScores);
  }

  static dbRowToTrade(row) {
    const obj = {
      ID: row.ID.toString(),
      traderID: row.traderID,
      sourceID: row.exitSourceID,
      sourceType: row.exitSourceType,
      exchangeID: row.exchangeID,
      asset: row.asset,
      quoteAsset: row.quoteAsset,
      quantity: row.quantity,
      entry: {
        sourceID: row.entrySourceID,
        sourceType: row.entrySourceType,
        price: row.entryPrice,
        time: new Date(row.entryTime).getTime(),
      },
      exit: {
        price: row.exitPrice,
        time: new Date(row.exitTime).getTime(),
      },
      weight: row.weight,
      score: row.score,
    };
    return new Trade(obj);
  }
};
