const debug = require('debug')('traderScore:TradeService');
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
  incrementScores: Joi.boolean().default(true).label('Increment Scores'),
});

module.exports = class TradeService {
  constructor({
    tradeRepo,
    numRecentTrades,
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

    const unitDebug = debug.extend(`${value.traderID}-${value.sourceID}`);
    unitDebug('start');

    const entries = await this.entryService.getEntries({
      traderID: value.traderID,
      exchangeID: value.exchangeID,
      asset: value.asset,
      qty: value.exitQuantity,
      exitTime: value.exitTime,
    });
    unitDebug('get entries');

    const tradePromises = entries.map(async (entry) => {
      const trade = await this.createTradeFromEntry({ req: value, entry });
      unitDebug('created trade from entry %o', entry);
      return trade;
    });
    const trades = await Promise.all(tradePromises);

    await Promise.all(trades.map(trade => this.addTrade(trade)));
    unitDebug('trades added');

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
    unitDebug('scores incremented');

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
    console.log('createTradeObj', {
      sourceID,
      sourceType,
      traderID,
      exchangeID,
      asset,
      quoteAsset,
      quantity,
      entry,
      exit,
    });

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

    let dailyChangeStdDev = await stdDevProm;
    dailyChangeStdDev = dailyChangeStdDev > 0 ? dailyChangeStdDev : 0;

    let dailyChangeMean = await meanProm;
    dailyChangeMean = dailyChangeMean > 0 ? dailyChangeMean : 0;

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

    console.log({
      traderID,
      tradeChange,
      entryTime,
      exitTime,
      weight,
      dailyChangeStdDev,
      dailyChangeMean,
      tradeDurationDays,
      outboundChange,
      inboundChange,
      weightedOutboundChange,
      weightedScore,
      score: weightedScore * 100,
    });

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
    return trades.map((trade) => {
      const days = (trade.exit.time - trade.entry.time) / (24 * 60 * 60 * 1000);
      return trade.score / days;
    });
  }

  async getTrades(args) {
    return this.tradeRepo.getTrades(args);
  }
};
