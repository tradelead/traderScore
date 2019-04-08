const Joi = require('joi');
const BigNumber = require('bignumber.js');
const Trade = require('../models/Trade');
const averageArr = require('../utilities/averageArr');
const standardDeviationArr = require('../utilities/standardDeviationArr');

const schema = Joi.object().keys({
  sourceID: Joi.string().required().label('Source ID'),
  sourceType: Joi.string().lowercase().valid(['order', 'withdrawal']).required().label('Source Type'),
  traderID: Joi.string().required().label('Trader ID'),
  exchangeID: Joi.string().required().label('Exchange ID'),
  asset: Joi.string().min(2).max(8).required().label('Asset'),
  exitQuantity: Joi.number().greater(0).required().label('Exit Quantity'),
  exitTime: Joi.number().integer().greater(0).required().label('Exit Time'),
  incrementScores: Joi.boolean().default(true).label('Increment Scores'),
});

module.exports = class TradeService {
  constructor({
    tradeRepo,
    numRecentTrades,
    portfolioService,
    exchangeService,
    scoreService,
    getEntriesLimitPerFetch,
    orderRepo,
    transferRepo,
    events,
  }) {
    this.tradeRepo = tradeRepo;
    this.numRecentTrades = numRecentTrades;
    this.portfolioService = portfolioService;
    this.exchangeService = exchangeService;
    this.scoreService = scoreService;
    this.orderRepo = orderRepo;
    this.transferRepo = transferRepo;
    this.getEntriesLimitPerFetch = getEntriesLimitPerFetch;
    this.events = events;
  }

  async newTrade(req) {
    const { error, value } = schema.validate(req);

    if (error != null) {
      const humanErr = error.details.map(detail => detail.message).join(', ');
      const err = new Error(humanErr);
      err.name = 'BadRequest';
      throw err;
    }

    const entries = await this.getEntries({
      traderID: value.traderID,
      exchangeID: value.exchangeID,
      asset: value.asset,
      qty: value.exitQuantity,
      exitTime: value.exitTime,
    });

    const tradePromises = entries.map(entry => this.createTradeFromEntry({ req: value, entry }));
    const trades = await Promise.all(tradePromises);

    await Promise.all(trades.map(trade => this.addTrade(trade)));

    if (value.incrementScores) {
      // eslint-disable-next-line no-restricted-syntax
      for (const trade of trades) {
        await this.scoreService.incrementScores({
          traderID: trade.traderID,
          score: trade.score,
          time: trade.exit.time,
        });
      }
    }

    return trades;
  }

  async getEntries({
    traderID,
    exchangeID,
    asset,
    qty,
    exitTime,
  }) {
    let entriesQty = 0;
    let firstRun = true;
    let ordersLeft = 0;
    let depositsLeft = 0;
    let entriesAcc = [];
    const entriesQueue = [];

    const itemsLeft = () => ordersLeft + depositsLeft > 0;

    do {
      const ordersLeftOld = ordersLeft;
      const depositsLeftOld = depositsLeft;
      let item;

      if (entriesQueue.length > 0) {
        item = entriesQueue.pop();

        const entriesQtyNum = new BigNumber(entriesQty);
        entriesQty = entriesQtyNum.plus(item.unusedQty).toNumber();
        entriesAcc.push(item);

        if (item.type === 'order') {
          ordersLeft -= 1;
        } else if (item.type === 'deposit') {
          depositsLeft -= 1;
        }
      }

      let type;
      const startTime = (item && item.time > 0 ? item.time : 0);
      const endTime = exitTime;
      const limit = this.getEntriesLimitPerFetch;
      const addToQueue = (additionalItems) => {
        if (additionalItems && additionalItems.length > 0) {
          const typedAdditionalItems = additionalItems.map(a => Object.assign({}, a, { type }));
          entriesQueue.push(...typedAdditionalItems);
          const descSort = (a, b) => b.time - a.time;
          entriesQueue.sort(descSort);
        }
      };

      if ((ordersLeft === 0 && ordersLeftOld !== 0) || firstRun) {
        type = 'order';
        const additionalItems = await this.orderRepo.getFilledOrders({
          traderID,
          exchangeID,
          asset,
          limit,
          startTime,
          endTime,
          sort: 'desc',
          unused: true,
        });
        ordersLeft = (additionalItems ? additionalItems.length : 0);
        addToQueue(additionalItems);
      }

      if ((depositsLeft === 0 && depositsLeftOld !== 0) || firstRun) {
        type = 'deposit';
        const additionalItems = await this.transferRepo.findDeposits({
          traderID,
          exchangeID,
          asset,
          limit,
          startTime,
          endTime,
          sort: 'desc',
          unused: true,
        });
        depositsLeft = (additionalItems ? additionalItems.length : 0);
        addToQueue(additionalItems);
      }

      firstRun = false;
    } while (entriesQty < qty && itemsLeft());

    if (entriesQty < qty) {
      throw new Error('Insufficient entries');
    }

    entriesAcc = entriesAcc.map(item => Object.assign({}, item, {
      sourceID: item.sourceID,
      sourceType: item.type,
      quantity: item.unusedQty,
      time: item.time,
      source: item,
    }));

    const entriesQtyNum = new BigNumber(entriesQty);
    const outboundQtyNum = entriesQtyNum.minus(qty);
    const lastEntryQtyNum = new BigNumber(entriesAcc[entriesAcc.length - 1].quantity);
    entriesAcc[entriesAcc.length - 1].quantity = lastEntryQtyNum.minus(outboundQtyNum).toNumber();

    return entriesAcc;
  }

  async getEntryQuoteAsset(entry, exchangeID, asset) {
    if (this.exchangeService.isRootAsset(exchangeID, asset)) {
      return asset;
    }

    if (entry.sourceType === 'order' && entry.source.side === 'buy') {
      return entry.source.quoteAsset;
    }

    if (
      (entry.sourceType === 'order' && entry.source.side === 'sell')
      || entry.sourceType === 'deposit'
    ) {
      return this.exchangeService.findMarketQuoteAsset({
        exchangeID,
        asset,
        preferredQuoteAsset: 'BTC',
      });
    }

    throw new Error('Unexpected entry type');
  }

  async createTradeFromEntry({ req, entry }) {
    const newTradeReq = Object.assign({}, req);

    newTradeReq.quantity = entry.quantity;
    newTradeReq.entry = {
      time: entry.time,
      sourceID: entry.sourceID,
      sourceType: entry.sourceType,
    };
    newTradeReq.exit = { time: req.exitTime };
    newTradeReq.quoteAsset = await this.getEntryQuoteAsset(entry, req.exchangeID, req.asset);

    newTradeReq.entry.price = await this.exchangeService.getPrice({
      exchangeID: req.exchangeID,
      asset: req.asset,
      quoteAsset: newTradeReq.quoteAsset,
      time: entry.time,
    });

    newTradeReq.exit.price = await this.exchangeService.getPrice({
      exchangeID: req.exchangeID,
      asset: req.asset,
      quoteAsset: newTradeReq.quoteAsset,
      time: req.exitTime,
    });

    return this.createTradeObj(newTradeReq);
  }

  async createTradeObj({
    sourceID,
    sourceType,
    traderID,
    exchangeID,
    asset,
    quoteAsset,
    quantity,
    entry,
    exit,
  }) {
    const weightPromise = this.tradeWeight({
      traderID,
      exchangeID,
      asset,
      quoteAsset,
      quantity,
      entryTime: entry.time,
      exitTime: exit.time,
      exitPrice: exit.price,
    });

    const weight = await weightPromise;
    const tradeChange = (exit.price / entry.price) - 1;

    const score = await this.score({
      traderID,
      weight,
      tradeChange,
      entryTime: entry.time,
      exitTime: exit.time,
    });

    return new Trade({
      traderID,
      exchangeID,
      sourceID,
      sourceType,
      asset,
      quoteAsset,
      quantity,
      entry,
      exit,
      weight,
      score,
    });
  }

  async tradeWeight({
    traderID,
    exchangeID,
    asset,
    quoteAsset,
    quantity,
    exitPrice,
    exitTime,
  }) {
    const tradeBTCValueProm = this.exchangeService.getBTCValue({
      exchangeID,
      asset,
      quoteAsset,
      qty: quantity,
      time: exitTime,
      price: exitPrice,
    });

    const portfolioBTC = await this.portfolioService.BTCValue({ traderID, time: exitTime });
    const tradeBTCValue = await tradeBTCValueProm;
    const tradeBTCValueSafe = new BigNumber(tradeBTCValue);

    return tradeBTCValueSafe.div(portfolioBTC).toNumber();
  }

  async score({
    traderID,
    tradeChange,
    entryTime,
    exitTime,
    weight,
  }) {
    // Standard deviation of all the trader's exclusive trade change per day.
    // Exclusive change is the trade change minus the market change for that period.
    const stdDevProm = this.getRecentDailyTradeChangeStdDev(traderID, exitTime);
    const meanProm = this.getRecentDailyTradeChangeMean(traderID, exitTime);

    const dailyChangeStdDev = await stdDevProm;
    const dailyChangeMean = await meanProm;

    const exitTimeNum = new BigNumber(exitTime);
    const tradeDuration = exitTimeNum.minus(entryTime);
    const tradeDurationDays = tradeDuration.dividedBy(60 * 60 * 24 * 1000).toNumber();

    const stdDevPlusMeanChange = (
      (dailyChangeMean * tradeDurationDays)
      + (dailyChangeStdDev * tradeDurationDays)
    );

    let outboundChange = tradeChange - stdDevPlusMeanChange;
    outboundChange = (outboundChange < 0) ? 0 : outboundChange;
    const inboundChange = tradeChange - outboundChange;
    let weightedOutboundChange = Math.log2((outboundChange) * 100) / 100;
    weightedOutboundChange = (weightedOutboundChange > 0) ? weightedOutboundChange : 0;
    const score = inboundChange + weightedOutboundChange;
    const weightedScore = score * weight;

    return weightedScore * 100;
  }

  async addTrade(trade) {
    const addProm = this.tradeRepo.addTrade(trade);

    await this.markSourceUsed({
      traderID: trade.traderID,
      exchangeID: trade.exchangeID,
      sourceID: trade.entry.sourceID,
      sourceType: trade.entry.sourceType,
      quantity: trade.quantity,
    });

    const ID = await addProm;

    this.events.emit('newTrade', trade);

    return ID;
  }

  async markSourceUsed({
    traderID,
    exchangeID,
    sourceID,
    sourceType,
    quantity,
  }) {
    if (sourceType === 'order') {
      return this.orderRepo.use({
        traderID,
        exchangeID,
        sourceID,
        quantity,
      });
    }

    if (sourceType === 'deposit') {
      return this.transferRepo.use({
        type: 'deposit',
        traderID,
        exchangeID,
        sourceID,
        quantity,
      });
    }

    throw new Error('cannot mark source used because source type unknown');
  }

  async getRecentDailyTradeChangeStdDev(traderID, exitTime) {
    const trades = await this.tradeRepo.getTrades({
      traderID,
      endTime: exitTime,
      limit: this.numRecentTrades,
    });
    const dailyScores = trades.map((trade) => {
      const days = (trade.exit.time - trade.entry.time) / 24 * 60 * 60 * 1000;
      return trade.score / days;
    });
    return standardDeviationArr(dailyScores);
  }

  async getRecentDailyTradeChangeMean(traderID, exitTime) {
    const trades = await this.tradeRepo.getTrades({
      traderID,
      endTime: exitTime,
      limit: this.numRecentTrades,
    });
    const dailyScores = trades.map((trade) => {
      const days = (trade.exit.time - trade.entry.time) / 24 * 60 * 60 * 1000;
      return trade.score / days;
    });
    return averageArr(dailyScores);
  }

  async getTrades(args) {
    return this.tradeRepo.getTrades(args);
  }
};
