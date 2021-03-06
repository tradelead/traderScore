// const debug = require('debug')('traderScore:TradeService');
const Joi = require('joi');
const BigNumber = require('bignumber.js');
const VError = require('verror');
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
  disableScoring: Joi.boolean().default(false).label('Disable Scoring'),
  incrementScores: Joi.boolean().default(true).label('Increment Scores'),
});

module.exports = class TradeService {
  constructor({
    tradeRepo,
    numRecentTrades,
    rescoreFetchLimit,
    portfolioService,
    exchangeService,
    scoreService,
    orderService,
    transferService,
    entryService,
    events,
  }) {
    this.tradeRepo = tradeRepo;
    this.numRecentTrades = numRecentTrades;
    this.rescoreFetchLimit = rescoreFetchLimit;
    this.portfolioService = portfolioService;
    this.exchangeService = exchangeService;
    this.scoreService = scoreService;
    this.orderService = orderService;
    this.transferService = transferService;
    this.entryService = entryService;
    this.events = events;
  }

  async newTrade(req) {
    const { error, value } = schema.validate(req);

    if (error != null) {
      const humanErr = error.details.map(detail => detail.message).join(', ');
      throw new VError({ name: 'BadRequest', info: req }, humanErr);
    }

    const entries = await this.entryService.getEntries({
      traderID: value.traderID,
      exchangeID: value.exchangeID,
      asset: value.asset,
      qty: value.exitQuantity,
      exitTime: value.exitTime,
    });

    const tradePromises = entries.map(async entry => this.createTradeFromEntry(
      { req: value, entry },
    ));
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

  async createTradeFromEntry({ req, entry }) {
    const newTradeReq = Object.assign({}, req);

    newTradeReq.quantity = entry.quantity;
    newTradeReq.entry = {
      time: entry.time,
      sourceID: entry.sourceID,
      sourceType: entry.sourceType,
    };
    newTradeReq.exit = { time: req.exitTime };

    newTradeReq.quoteAsset = await this.entryService
      .getEntryQuoteAsset(entry, req.exchangeID, req.asset);

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
    ID,
    sourceID,
    sourceType,
    traderID,
    exchangeID,
    asset,
    quoteAsset,
    quantity,
    entry,
    exit,
    dailyChangeMean,
    dailyChangeStdDev,
    disableScoring,
  }) {
    let weight = 0;
    let score = 0;

    if (!disableScoring) {
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

      weight = await weightPromise;
      const tradeChange = (exit.price / entry.price) - 1;

      score = await this.score({
        traderID,
        weight,
        tradeChange,
        entryTime: entry.time,
        exitTime: exit.time,
        dailyChangeMeanDefault: dailyChangeMean,
        dailyChangeStdDevDefault: dailyChangeStdDev,
      });
    }

    return new Trade({
      ID,
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
    dailyChangeStdDevDefault,
    dailyChangeMeanDefault,
  }) {
    let dailyChangeStdDev = dailyChangeStdDevDefault;
    let dailyChangeMean = dailyChangeMeanDefault;

    await Promise.all([
      (async () => {
        if (dailyChangeStdDevDefault == null) {
          dailyChangeStdDev = await this.getRecentDailyTradeChangeStdDev(traderID, exitTime);
          dailyChangeStdDev = dailyChangeStdDev > 0 ? dailyChangeStdDev : 0;
        }
      })(),
      (async () => {
        if (dailyChangeMeanDefault == null) {
          dailyChangeMean = await this.getRecentDailyTradeChangeMean(traderID, exitTime);
          dailyChangeMean = dailyChangeMean > 0 ? dailyChangeMean : 0;
        }
      })(),
    ]);

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
      return this.orderService.use({
        traderID,
        exchangeID,
        sourceID,
        quantity,
      });
    }

    if (sourceType === 'deposit') {
      return this.transferService.use({
        type: 'deposit',
        traderID,
        exchangeID,
        sourceID,
        quantity,
      });
    }

    throw new Error('cannot mark source used because source type unknown');
  }

  async rescoreTrades({ traderID, startTime }) {
    let lastStartTime = startTime;

    const recentTrades = await this.tradeRepo.getTrades({
      traderID,
      endTime: startTime,
      limit: this.numRecentTrades,
    });

    for (; ;) {
      const trades = await this.tradeRepo.getTrades({
        traderID,
        startTime: lastStartTime,
        limit: this.rescoreFetchLimit,
        sort: 'asc',
      });

      // if no more trades break loop
      if (!trades || !Array.isArray(trades) || trades.length === 0) {
        break;
      }

      lastStartTime = trades[trades.length - 1].exit.time + 1;

      const updatedTrades = [];

      for (let i = 0; i < trades.length; i += 1) {
        const trade = trades[i];
        const dailyScores = TradeService.calculateDailyScores(recentTrades);
        const dailyChangeStdDev = standardDeviationArr(dailyScores);
        const dailyChangeMean = averageArr(dailyScores);

        const newTrade = await this.createTradeObj(Object.assign({}, trade, {
          dailyChangeStdDev,
          dailyChangeMean,
        }));

        if (recentTrades.length >= this.rescoreFetchLimit) {
          recentTrades.shift();
        }
        recentTrades.push(newTrade);
        updatedTrades.push(newTrade);
      }

      await this.tradeRepo.bulkUpdate({ trades: updatedTrades });
    }
  }

  async getRecentDailyTradeChangeStdDev(traderID, exitTime) {
    const dailyScores = await this.getDailyScores(traderID, exitTime);
    if (dailyScores.length === 0) {
      return 0;
    }

    return standardDeviationArr(dailyScores);
  }

  async getRecentDailyTradeChangeMean(traderID, exitTime) {
    const dailyScores = await this.getDailyScores(traderID, exitTime);
    if (dailyScores.length === 0) {
      return 0;
    }

    return averageArr(dailyScores);
  }

  async getDailyScores(traderID, exitTime) {
    const trades = await this.tradeRepo.getTrades({
      traderID,
      endTime: exitTime,
      limit: this.numRecentTrades,
    });
    return TradeService.calculateDailyScores(trades);
  }

  static calculateDailyScores(trades) {
    if (!trades || trades.length === 0) {
      return [];
    }

    return trades.map((trade) => {
      const days = (trade.exit.time - trade.entry.time) / (24 * 60 * 60 * 1000);
      return trade.score / days;
    });
  }

  async getTrades(args) {
    return this.tradeRepo.getTrades(args);
  }
};
