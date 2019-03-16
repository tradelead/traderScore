const Joi = require('joi');
const BigNumber = require('bignumber.js');
const Trade = require('../models/Trade');

const schema = Joi.object().keys({
  sourceID: Joi.string().required().label('Source ID'),
  sourceType: Joi.string().lowercase().valid(['order', 'withdrawal']).required().label('Source Type'),
  traderID: Joi.string().required().label('Trader ID'),
  exchangeID: Joi.string().required().label('Exchange ID'),
  asset: Joi.string().min(2).max(8).required().label('Asset'),
  exitQuantity: Joi.number().greater(0).required().label('Exit Quantity'),
  exitTime: Joi.number().integer().greater(0).required().label('Exit Time'),
});

module.exports = class TradeService {
  constructor({
    tradeRepo,
    traderPortfolio,
    exchangeService,
    globalMarketService,
    traderScoreRepo,
    traderScorePeriodConfig,
  }) {
    this.tradeRepo = tradeRepo;
    this.traderPortfolio = traderPortfolio;
    this.exchangeService = exchangeService;
    this.globalMarketService = globalMarketService;
    this.traderScoreRepo = traderScoreRepo;
    this.traderScorePeriodConfig = traderScorePeriodConfig;
  }

  async newTrade(req) {
    const { error, value } = schema.validate(req);

    if (error != null) {
      const humanErr = error.details.map(detail => detail.message).join(', ');
      const err = new Error(humanErr);
      err.name = 'BadRequest';
      throw err;
    }

    const entries = await this.exchangeService.getEntries({
      exchange: value.exchangeID,
      asset: value.asset,
      qty: value.exitQuantity,
    });

    /** a trade will be created for each entry */
    const trades = await Promise.all(entries.map(async (entry) => {
      const newTradeReq = Object.assign({}, value);

      newTradeReq.quantity = entry.quantity;
      newTradeReq.entry = {
        time: entry.time,
        sourceID: entry.sourceID,
        sourceType: entry.sourceType,
      };
      newTradeReq.exit = { time: value.exitTime };
      newTradeReq.quoteAsset = await this.getEntryQuoteAsset(entry, value.exchangeID, value.asset);

      newTradeReq.entry.price = await this.exchangeService.getPrice({
        exchangeID: value.exchangeID,
        asset: value.asset,
        quoteAsset: newTradeReq.quoteAsset,
        time: entry.time,
      });

      newTradeReq.exit.price = await this.exchangeService.getPrice({
        exchangeID: value.exchangeID,
        asset: value.asset,
        quoteAsset: newTradeReq.quoteAsset,
        time: value.exitTime,
      });

      return this.createTradeObj(newTradeReq);
    }));

    const tradeSavePromises = trades.map(async trade => this.tradeRepo.addTrade(trade));
    await Promise.all(tradeSavePromises);

    await this.updateTraderScores({ trades });

    return trades;
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

    const marketChange = await this.globalMarketService.marketChange(entry.time, exit.time);
    const weight = await weightPromise;
    const tradeChange = (exit.price / entry.price) - 1;

    const score = await this.score({
      traderID,
      weight,
      marketChange,
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

  async score({
    traderID,
    marketChange,
    tradeChange,
    entryTime,
    exitTime,
    weight,
  }) {
    // Standard deviation of all the trader's exclusive trade change per day.
    // Exclusive change is the trade change minus the market change for that period.
    const dailyChangeStdDevProm = this.tradeRepo.getDailyTradeChangeStdDeviation(traderID);
    const dailyChangeMeanProm = this.tradeRepo.getDailyTradeChangeMean(traderID);

    const dailyChangeStdDev = await dailyChangeStdDevProm;
    const dailyChangeMean = await dailyChangeMeanProm;

    const exitTimeNum = new BigNumber(exitTime);
    const tradeDuration = exitTimeNum.minus(entryTime);
    const tradeDurationDays = tradeDuration.dividedBy(60 * 60 * 24 * 1000).toNumber();

    const exclusiveChange = tradeChange - marketChange;

    const stdDevPlusMeanChange = (
      (dailyChangeMean * tradeDurationDays)
      + (dailyChangeStdDev * tradeDurationDays)
    );

    let outboundChange = exclusiveChange - stdDevPlusMeanChange;
    outboundChange = (outboundChange < 0) ? 0 : outboundChange;
    const inboundChange = exclusiveChange - outboundChange;
    let weightedOutboundChange = Math.log2((outboundChange) * 100) / 100;
    weightedOutboundChange = (weightedOutboundChange > 0) ? weightedOutboundChange : 0;
    const score = inboundChange + weightedOutboundChange;
    const weightedScore = score * weight;

    return weightedScore * 100;
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

    const portfolioBTC = await this.traderPortfolio.BTCValue({ traderID, time: exitTime });
    const tradeBTCValue = await tradeBTCValueProm;
    const tradeBTCValueSafe = new BigNumber(tradeBTCValue);

    return tradeBTCValueSafe.div(portfolioBTC).toNumber();
  }

  async getEntryQuoteAsset(entry, exchange, asset) {
    if (this.exchangeService.isRootAsset(exchange, asset)) {
      return asset;
    }

    if (entry.sourceType === 'order' && entry.order.side === 'buy') {
      return entry.order.quoteAsset;
    }

    if (
      (entry.sourceType === 'order' && entry.order.side === 'sell')
      || entry.sourceType === 'withdrawal'
      || entry.sourceType === 'deposit'
    ) {
      return this.exchangeService.findMarketQuoteAsset({
        exchange,
        asset,
        preferredQuoteAsset: 'BTC',
      });
    }

    throw new Error('Unexpected entry type');
  }

  async updateTraderScores({ trades }) {
    const promises = trades.map(async (trade) => {
      const { traderID, score } = trade;

      const tradePromises = [];

      const updateGlobalScore = this.updateTraderScore({ traderID, score });
      tradePromises.push(updateGlobalScore);

      const updatePeriodScore = (periodConfig) => {
        const period = periodConfig.id;
        return this.updateTraderScore({ traderID, score, period });
      };
      const updatePeriodScores = this.traderScorePeriodConfig.map(updatePeriodScore);

      tradePromises.push(...updatePeriodScores);

      await Promise.all(tradePromises);
    });

    await Promise.all(promises);
  }

  async updateTraderScore({ traderID, score, period }) {
    const getReq = { traderID };

    if (typeof period !== 'undefined') {
      getReq.period = period;
    }

    const traderScore = await this.traderScoreRepo.getTraderScore(getReq);

    const compoundScore = (current, add) => current * ((add / 100) + 1);
    const newTraderScore = compoundScore(traderScore, score);

    const updateReq = { traderID, score: newTraderScore };

    if (typeof period !== 'undefined') {
      updateReq.period = period;
    }

    await this.traderScoreRepo.updateTraderScore(updateReq);
  }
};
