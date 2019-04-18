const sinon = require('sinon');
const { EventEmitter } = require('events');
const TradeService = require('./TradeService');
const Trade = require('../models/Trade');

const defaultReq = {
  sourceID: 'source123',
  sourceType: 'order',
  traderID: 'trader123',
  exchangeID: 'exchange123',
  asset: 'ETH',
  exitQuantity: 17.12901,
  exitTime: Date.now(),
};

let deps = {};

beforeEach(() => {
  // reset deps for each test
  deps = {
    tradeRepo: {
      addTrade: sinon.stub(),
      getTrades: sinon.stub(),
      bulkUpdate: sinon.stub(),
    },
    numRecentTrades: 10,
    scoreService: {
      incrementScores: sinon.stub(),
    },
    portfolioService: {
      BTCValue: sinon.stub(),
    },
    exchangeService: {
      getEntries: sinon.stub(),
      getPrice: sinon.stub(),
      getBTCValue: sinon.stub(),
      isRootAsset: sinon.stub(),
      findMarketQuoteAsset: sinon.stub(),
    },
    transferService: {
      findDeposits: sinon.stub(),
      findWithdrawals: sinon.stub(),
      use: sinon.stub(),
    },
    orderService: {
      getFilledOrders: sinon.stub(),
      use: sinon.stub(),
    },
    entryService: {
      getEntries: sinon.stub(),
      getEntryQuoteAsset: sinon.stub(),
    },
    events: new EventEmitter(),
    getEntriesLimitPerFetch: 3,
    rescoreFetchLimit: 100,
  };
});

describe('newTrade', () => {
  let service;

  beforeEach(() => {
    deps.exchangeService.getPrice.resolves(123);
    deps.exchangeService.getBTCValue.resolves(50);
    deps.portfolioService.BTCValue.resolves(100);

    service = new TradeService(deps);

    sinon.stub(service, 'getRecentDailyTradeChangeStdDev');
    service.getRecentDailyTradeChangeStdDev.resolves(0.01);

    sinon.stub(service, 'getRecentDailyTradeChangeMean');
    service.getRecentDailyTradeChangeMean.resolves(0.03);

    const entryTime = Date.now() - 10000;
    deps.entryService.getEntries.resolves([
      {
        time: entryTime,
        quantity: defaultReq.exitQuantity - 5,
        sourceType: 'order',
        sourceID: 'entry1',
        source: {
          side: 'buy',
          quoteAsset: 'USDT',
        },
      },
      {
        time: entryTime,
        quantity: 5,
        sourceType: 'withdrawal',
        sourceID: 'entry2',
      },
    ]);

    deps.entryService.getEntryQuoteAsset.resolves('ABC');

    sinon.stub(service, 'addTrade');
  });

  describe('calls getEntries', () => {
    it('calls getEntries once', async () => {
      await service.newTrade(defaultReq);

      sinon.assert.callCount(deps.entryService.getEntries, 1);
    });

    it('passes exitQuantity to getEntries qty', async () => {
      const req = Object.assign({}, defaultReq);
      req.exitQuantity = 0.2;

      await service.newTrade(req);

      sinon.assert.calledWithMatch(deps.entryService.getEntries, { qty: 0.2 });
    });

    it('passes exitTime to getEntries', async () => {
      const req = Object.assign({}, defaultReq);

      await service.newTrade(req);

      sinon.assert.calledWithMatch(deps.entryService.getEntries, { exitTime: req.exitTime });
    });

    it('passes traderID to getEntries', async () => {
      await service.newTrade(defaultReq);

      sinon.assert.calledWithMatch(deps.entryService.getEntries, { traderID: defaultReq.traderID });
    });

    it('passes exchangeID to getEntries', async () => {
      await service.newTrade(defaultReq);

      sinon.assert.calledWithMatch(
        deps.entryService.getEntries,
        { exchangeID: defaultReq.exchangeID },
      );
    });

    it('passes asset to getEntries', async () => {
      await service.newTrade(defaultReq);

      sinon.assert.calledWithMatch(deps.entryService.getEntries, { asset: defaultReq.asset });
    });
  });

  describe('getEntryQuoteAsset called for each entry', () => {
    const entryTime = Date.now() - 10000;
    const entries = [
      {
        time: entryTime,
        quantity: defaultReq.exitQuantity - 5,
        sourceType: 'order',
        sourceID: 'entry1',
        source: {
          side: 'buy',
          quoteAsset: 'USDT',
        },
      },
      {
        time: entryTime,
        quantity: 5,
        sourceType: 'withdrawal',
        sourceID: 'entry2',
      },
    ];
    const { exchangeID, asset } = defaultReq;

    beforeEach(async () => {
      deps.entryService.getEntries.resolves(entries);
      await service.newTrade(defaultReq);
    });

    it('called with first entry, exchangeID, & asset', () => {
      sinon.assert.calledWithMatch(
        deps.entryService.getEntryQuoteAsset,
        entries[0],
        exchangeID,
        asset,
      );
    });

    it('called with second entry, exchangeID, & asset', () => {
      sinon.assert.calledWithMatch(
        deps.entryService.getEntryQuoteAsset,
        entries[1],
        exchangeID,
        asset,
      );
    });
  });

  test('entry price returns price from exchangeService.getPrice', async () => {
    const entryTime = Date.now() - 10000;

    const entries = [
      {
        time: entryTime,
        quantity: defaultReq.exitQuantity,
        sourceType: 'order',
        sourceID: 'entry1',
        source: {
          side: 'buy',
          quoteAsset: 'USDT',
        },
      },
    ];
    deps.entryService.getEntries.resolves(entries);

    deps.entryService.getEntryQuoteAsset.resolves('USDT');

    deps.exchangeService.getPrice.withArgs({
      exchangeID: defaultReq.exchangeID,
      asset: defaultReq.asset,
      quoteAsset: 'USDT',
      time: entryTime,
    }).resolves(0.12345);

    const trades = await service.newTrade(defaultReq);

    expect(trades[0]).toHaveProperty('entry.price', 0.12345);
  });

  test('exit price returns price from exchangeService.getPrice', async () => {
    deps.entryService.getEntryQuoteAsset.resolves('USDT');

    deps.exchangeService.getPrice.withArgs({
      exchangeID: defaultReq.exchangeID,
      asset: defaultReq.asset,
      quoteAsset: 'USDT',
      time: defaultReq.exitTime,
    }).resolves(0.123456);

    const trades = await service.newTrade(defaultReq);

    expect(trades[0]).toHaveProperty('exit.price', 0.123456);
  });

  it('saves new trade for each entry', async () => {
    await service.newTrade(defaultReq);

    sinon.assert.callCount(service.addTrade, 2);
  });

  it('calls scoreService.incrementScores for each trade', async () => {
    const trades = await service.newTrade(defaultReq);

    trades.forEach((trade) => {
      const { traderID, score } = trade;
      const { time } = trade.exit;
      const expectedArgs = { traderID, score, time };
      sinon.assert.calledWith(deps.scoreService.incrementScores, expectedArgs);
    });
  });

  it('doesn\'t call scoreService.incrementScores for each trade', async () => {
    const req = Object.assign({}, defaultReq);
    req.incrementScores = false;
    await service.newTrade(req);

    sinon.assert.notCalled(deps.scoreService.incrementScores);
  });

  it('calls scoreService.incrementScores for each trade synchronously', async () => {
    deps.scoreService.incrementScores.onFirstCall().callsFake(() => new Promise(
      (resolve, reject) => setTimeout(reject, 20),
    ));

    // eslint-disable-next-line
    try { await service.newTrade(defaultReq); } catch (e) {}

    sinon.assert.callCount(deps.scoreService.incrementScores, 1);
  });

  it('doesn\'t call score or tradeWeight when scoring disabled', async () => {
    sinon.stub(service, 'score');
    sinon.stub(service, 'tradeWeight');

    const req = Object.assign({}, defaultReq, {
      disableScoring: true,
    });
    await service.newTrade(req);

    sinon.assert.notCalled(service.score);
    sinon.assert.notCalled(service.tradeWeight);
  });

  it('calls score or tradeWeight when scoring enabled', async () => {
    sinon.stub(service, 'score').resolves(0);
    sinon.stub(service, 'tradeWeight').resolves(0);

    await service.newTrade(defaultReq);

    sinon.assert.called(service.score);
    sinon.assert.called(service.tradeWeight);
  });

  describe('data validation', () => {
    test('invalid request throws BadRequest', async () => {
      const useCase = new TradeService({});

      expect.assertions(1);

      try {
        await useCase.newTrade({});
      } catch (error) {
        expect(error.name).toBe('BadRequest');
      }
    });

    test('missing sourceID throws error', async () => {
      const useCase = new TradeService({});
      const req = Object.assign({}, defaultReq);
      req.sourceID = '';
      await expect(useCase.newTrade(req)).rejects.toThrow('"Source ID" is not allowed to be empty');
    });

    test('missing sourceType throws error', async () => {
      const useCase = new TradeService({});
      const req = Object.assign({}, defaultReq);
      req.sourceType = '';
      await expect(useCase.newTrade(req)).rejects.toThrow('"Source Type" is not allowed to be empty');
    });

    test('missing traderID throws error', async () => {
      const useCase = new TradeService({});
      const req = Object.assign({}, defaultReq);
      req.traderID = '';
      await expect(useCase.newTrade(req)).rejects.toThrow('"Trader ID" is not allowed to be empty');
    });

    test('missing exchangeID throws error', async () => {
      const useCase = new TradeService({});
      const req = Object.assign({}, defaultReq);
      req.exchangeID = '';
      await expect(useCase.newTrade(req)).rejects.toThrow('"Exchange ID" is not allowed to be empty');
    });

    test('missing asset throws error', async () => {
      const useCase = new TradeService({});
      const req = Object.assign({}, defaultReq);
      req.asset = '';
      await expect(useCase.newTrade(req)).rejects.toThrow('"Asset" is not allowed to be empty');
    });

    test('missing exitQuantity throws error', async () => {
      const useCase = new TradeService({});
      const req = Object.assign({}, defaultReq);
      req.exitQuantity = 0;
      await expect(useCase.newTrade(req)).rejects.toThrow('"Exit Quantity" must be greater than 0');
    });

    test('missing exitTime throws error', async () => {
      const useCase = new TradeService({});
      const req = Object.assign({}, defaultReq);
      req.exitTime = 0;
      await expect(useCase.newTrade(req)).rejects.toThrow('"Exit Time" must be greater than 0');
    });
  });
});

describe('tradeWeight', () => {
  beforeEach(() => {
    deps.portfolioService.BTCValue.withArgs({
      traderID: defaultReq.traderID,
      time: defaultReq.exitTime,
    }).resolves(100);

    deps.exchangeService.getBTCValue.withArgs({
      exchangeID: defaultReq.exchangeID,
      asset: defaultReq.asset,
      quoteAsset: 'USDT',
      qty: 50,
      time: defaultReq.exitTime,
      price: defaultReq.exitPrice,
    }).resolves(50);
  });

  it('divides trade btc value by trader portfolio btc value', async () => {
    const useCase = new TradeService(deps);
    const req = Object.assign({}, defaultReq);
    req.quoteAsset = 'USDT';
    req.quantity = 50;
    return expect(useCase.tradeWeight(req)).resolves.toBe(0.5);
  });

  it('can handle floating point math with precision', async () => {
    const useCase = new TradeService(deps);
    const req = Object.assign({}, defaultReq);

    deps.exchangeService.getBTCValue.resetBehavior();
    deps.exchangeService.getBTCValue.resolves(0.01);
    deps.portfolioService.BTCValue.resetBehavior();
    deps.portfolioService.BTCValue.resolves(0.1);

    return expect(useCase.tradeWeight(req)).resolves.toBe(0.1);
  });
});

describe('score', () => {
  let service;

  beforeEach(() => {
    service = new TradeService(deps);

    sinon.stub(service, 'getRecentDailyTradeChangeStdDev');
    service.getRecentDailyTradeChangeStdDev.withArgs('trader123').resolves(0.01);

    sinon.stub(service, 'getRecentDailyTradeChangeMean');
    service.getRecentDailyTradeChangeMean.withArgs('trader123').resolves(0.03);
  });

  it('returns negative', async () => {
    const score = await service.score({
      traderID: 'trader123',
      tradeChange: -0.05,
      entryTime: Date.now() - (60 * 60 * 24 * 1000),
      exitTime: Date.now(),
      weight: 0.5,
    });

    expect(score).toBe(-2.5);
  });

  it('returns positive', async () => {
    const score = await service.score({
      traderID: 'trader123',
      tradeChange: 0.25,
      entryTime: Date.now() - (60 * 60 * 24 * 1000),
      exitTime: Date.now(),
      weight: 0.5,
    });

    expect(score).toBe(4.196158711389381);
  });

  it('returns positive even when mean & stdDev negative', async () => {
    service.getRecentDailyTradeChangeStdDev.withArgs('trader123').resolves(-0.10);
    service.getRecentDailyTradeChangeMean.withArgs('trader123').resolves(-0.05);

    const score = await service.score({
      traderID: 'trader123',
      tradeChange: 0.25,
      entryTime: Date.now() - (60 * 60 * 24 * 1000),
      exitTime: Date.now(),
      weight: 0.5,
    });

    expect(score).toBe(2.321928094887362);
  });

  it('returns positive and only 6 hrs', async () => {
    const score = await service.score({
      traderID: 'trader123',
      tradeChange: 0.25,
      entryTime: Date.now() - (60 * 60 * 6 * 1000),
      exitTime: Date.now(),
      weight: 0.5,
    });

    expect(score).toBe(2.7924812503605785);
  });

  it('calls getRecentDailyTradeChangeStdDev with the trader ID & exit time', async () => {
    const req = {
      traderID: 'trader123',
      tradeChange: -0.05,
      entryTime: Date.now() - (60 * 60 * 24 * 1000),
      exitTime: Date.now(),
      weight: 0.5,
    };
    await service.score(req);

    sinon.assert.calledWith(
      service.getRecentDailyTradeChangeStdDev,
      req.traderID,
      req.exitTime,
    );
  });

  it('calls getRecentDailyTradeChangeMean with the trader ID & exit time', async () => {
    const req = {
      traderID: 'trader123',
      tradeChange: -0.05,
      entryTime: Date.now() - (60 * 60 * 24 * 1000),
      exitTime: Date.now(),
      weight: 0.5,
    };
    await service.score(req);

    sinon.assert.calledWith(
      service.getRecentDailyTradeChangeMean,
      req.traderID,
      req.exitTime,
    );
  });

  it('doesn\'t call getRecentDailyTradeChangeStdDev if dailyChangeStdDev passed', async () => {
    const score = await service.score({
      traderID: 'trader123',
      tradeChange: -0.05,
      entryTime: Date.now() - (60 * 60 * 24 * 1000),
      exitTime: Date.now(),
      weight: 0.5,
      dailyChangeStdDevDefault: 0.01,
    });

    sinon.assert.notCalled(service.getRecentDailyTradeChangeStdDev);

    expect(score).toBe(-2.5);
  });

  it('doesn\'t call getRecentDailyTradeChangeMean if dailyChangeMean passed', async () => {
    const score = await service.score({
      traderID: 'trader123',
      tradeChange: -0.05,
      entryTime: Date.now() - (60 * 60 * 24 * 1000),
      exitTime: Date.now(),
      weight: 0.5,
      dailyChangeMeanDefault: 0.03,
    });

    sinon.assert.notCalled(service.getRecentDailyTradeChangeMean);

    expect(score).toBe(-2.5);
  });
});

describe('addTrade', () => {
  let trade;
  let service;

  beforeEach(() => {
    trade = new Trade({
      traderID: 'trader1',
      sourceID: 'source1',
      sourceType: 'order',
      exchangeID: 'binance',
      asset: 'BTC',
      quoteAsset: 'USDT',
      quantity: 1.12345678,
      entry: {
        sourceID: 'source1',
        sourceType: 'order',
        price: 12.12345678,
        time: 1540000000000,
      },
      exit: {
        price: 12.12345678,
        time: 1540000000000,
      },
      weight: 0.5,
      score: 12.12345678,
    });

    service = new TradeService(deps);
  });

  it('calls tradeRepo.addTrade with trade', async () => {
    service.addTrade(trade);

    sinon.assert.calledWith(deps.tradeRepo.addTrade, trade);
  });

  it('emit newTrade event', async () => {
    const eventEmittedTrades = [];
    deps.events.on('newTrade', (eventTrade) => {
      eventEmittedTrades.push(eventTrade);
    });

    await service.addTrade(trade);
    expect(eventEmittedTrades).toEqual([trade]);
  });

  it('uses order', async () => {
    trade.entry.sourceType = 'order';

    await service.addTrade(trade);

    sinon.assert.calledWith(deps.orderService.use, {
      traderID: trade.traderID,
      exchangeID: trade.exchangeID,
      sourceID: trade.sourceID,
      quantity: trade.quantity,
    });
  });

  it('uses deposit', async () => {
    trade.entry.sourceType = 'deposit';

    await service.addTrade(trade);

    sinon.assert.calledWith(deps.transferService.use, {
      type: 'deposit',
      traderID: trade.traderID,
      exchangeID: trade.exchangeID,
      sourceID: trade.entry.sourceID,
      quantity: trade.quantity,
    });
  });
});

test('getTrades calls tradeRepo', async () => {
  const service = new TradeService(deps);
  await service.getTrades({ test: 1 });

  sinon.assert.calledWith(deps.tradeRepo.getTrades, { test: 1 });
});

describe('getRecentDailyTradeChangeStdDev', () => {
  it('returns standard deviation of recent daily trade change', async () => {
    deps.tradeRepo.getTrades.resolves([
      { entry: { time: 1554476009616 }, exit: { time: 1555076009621 }, score: 15 },
      { entry: { time: 1554076009616 }, exit: { time: 1555076009644 }, score: 55 },
    ]);

    const service = new TradeService(deps);
    const stdDev = await service.getRecentDailyTradeChangeStdDev('trader1', 1000);
    expect(stdDev).toEqual(1.2959999424720015);
  });

  it('returns 0 when has no trades', async () => {
    deps.tradeRepo.getTrades.resolves([]);

    const service = new TradeService(deps);
    const stdDev = await service.getRecentDailyTradeChangeStdDev('trader1', 1000);
    expect(stdDev).toEqual(0);
  });

  it('calls getTrades with correct params', async () => {
    deps.tradeRepo.getTrades.resolves([]);

    const service = new TradeService(deps);
    await service.getRecentDailyTradeChangeStdDev('trader1', 1000);

    sinon.assert.calledWith(deps.tradeRepo.getTrades, {
      traderID: 'trader1',
      endTime: 1000,
      limit: deps.numRecentTrades,
    });
  });
});

describe('getRecentDailyTradeChangeMean', () => {
  it('returns mean of recent daily trade change', async () => {
    deps.tradeRepo.getTrades.resolves([
      { entry: { time: 1554476009616 }, exit: { time: 1555076009621 }, score: 15 },
      { entry: { time: 1554076009616 }, exit: { time: 1555076009644 }, score: 55 },
    ]);

    const service = new TradeService(deps);
    const stdDev = await service.getRecentDailyTradeChangeMean('trader1', 1000);
    expect(stdDev).toEqual(3.455999924472002);
  });

  it('returns 0 when has no trades', async () => {
    deps.tradeRepo.getTrades.resolves([]);

    const service = new TradeService(deps);
    const mean = await service.getRecentDailyTradeChangeMean('trader1', 1000);
    expect(mean).toEqual(0);
  });

  it('calls getTrades with correct params', async () => {
    deps.tradeRepo.getTrades.resolves([]);

    const service = new TradeService(deps);
    await service.getRecentDailyTradeChangeMean('trader1', 1000);

    sinon.assert.calledWith(deps.tradeRepo.getTrades, {
      traderID: 'trader1',
      endTime: 1000,
      limit: deps.numRecentTrades,
    });
  });
});

describe('createTradeObj', () => {
  let req;
  let service;

  beforeEach(() => {
    req = {
      ID: '123',
      traderID: 'trader1',
      sourceID: 'source1',
      sourceType: 'order',
      exchangeID: 'binance',
      asset: 'BTC',
      quoteAsset: 'USDT',
      quantity: 1.12345678,
      entry: {
        sourceID: 'source1',
        sourceType: 'order',
        price: 12.12345678,
        time: 1530000000000,
      },
      exit: {
        price: 12.12345678,
        time: 1540000000000,
      },
      dailyChangeStdDev: 10,
      dailyChangeMean: 5,
    };

    service = new TradeService(deps);
    sinon.stub(service, 'tradeWeight').resolves(0.5);
    sinon.stub(service, 'score').resolves(123);

    deps.tradeRepo.getTrades
      .withArgs(sinon.match({ endTime: req.startTime }))
      .resolves([]);
  });

  it('calls tradeWeight with correct params', async () => {
    await service.createTradeObj(req);
    sinon.assert.calledWithMatch(service.tradeWeight, {
      traderID: req.traderID,
      exchangeID: req.exchangeID,
      asset: req.asset,
      quoteAsset: req.quoteAsset,
      quantity: req.quantity,
      entryTime: req.entry.time,
      exitTime: req.exit.time,
      exitPrice: req.exit.price,
    });
  });

  it('calls score with weight, tradeChange, traderID, entryTime, exitTime, dailyChangeStdDev, dailyChangeMean', async () => {
    await service.createTradeObj(req);
    sinon.assert.calledWithMatch(service.score, {
      traderID: req.traderID,
      weight: 0.5,
      tradeChange: (req.exit.price / req.entry.price) - 1,
      entryTime: req.entry.time,
      exitTime: req.exit.time,
      dailyChangeStdDevDefault: req.dailyChangeStdDev,
      dailyChangeMeanDefault: req.dailyChangeMean,
    });
  });

  it('returns Trade', async () => {
    const trade = await service.createTradeObj(req);

    delete req.dailyChangeStdDev;
    delete req.dailyChangeMean;
    expect(trade).toEqual(new Trade(Object.assign({}, req, {
      weight: 0.5,
      score: 123,
    })));
  });

  test('when disableScoring, doesn\'t call tradeWeight or score', async () => {
    req.disableScoring = true;
    const trade = await service.createTradeObj(req);

    sinon.assert.notCalled(service.tradeWeight);
    sinon.assert.notCalled(service.score);

    delete req.dailyChangeStdDev;
    delete req.dailyChangeMean;
    delete req.disableScoring;
    expect(trade).toEqual(new Trade(Object.assign({}, req, {
      weight: 0,
      score: 0,
    })));
  });
});

describe('rescoreTrades', () => {
  let req;
  let service;

  beforeEach(() => {
    req = {
      traderID: 'trader1',
      startTime: Date.now() - (24 * 60 * 60 * 1000),
    };
    service = new TradeService(deps);
    sinon.stub(service, 'createTradeObj');

    deps.tradeRepo.getTrades
      .withArgs(sinon.match({ endTime: req.startTime }))
      .resolves([]);
  });

  test('calls tradeRepo.getTrades with traderID and rescoreFetchLimit', async () => {
    await service.rescoreTrades(req);

    sinon.assert.calledWithMatch(deps.tradeRepo.getTrades, {
      traderID: req.traderID,
      limit: deps.rescoreFetchLimit,
      sort: 'asc',
    });
  });

  test('first call to tradeRepo.getTrades with startTime as specified', async () => {
    await service.rescoreTrades(req);

    sinon.assert.calledWithMatch(deps.tradeRepo.getTrades, {
      startTime: req.startTime,
    });
  });

  test('second call to tradeRepo.getTrades with last startTime', async () => {
    deps.tradeRepo.getTrades
      .withArgs(sinon.match({ startTime: req.startTime }))
      .onFirstCall()
      .resolves([new Trade({
        traderID: 'trader1',
        sourceID: 'source1',
        sourceType: 'order',
        exchangeID: 'binance',
        asset: 'BTC',
        quoteAsset: 'USDT',
        quantity: 1.12345678,
        entry: {
          sourceID: 'source1',
          sourceType: 'order',
          price: 12.12345678,
          time: 1530000000000,
        },
        exit: {
          price: 12.12345678,
          time: 1540000000000,
        },
        weight: 0.5,
        score: 12.12345678,
      })]);

    await service.rescoreTrades(req);

    sinon.assert.calledWithMatch(deps.tradeRepo.getTrades, {
      startTime: 1540000000001,
    });
  });

  test('calls createTradeObj with trade', async () => {
    const trade = new Trade({
      traderID: 'trader1',
      sourceID: 'source1',
      sourceType: 'order',
      exchangeID: 'binance',
      asset: 'BTC',
      quoteAsset: 'USDT',
      quantity: 1.12345678,
      entry: {
        sourceID: 'source1',
        sourceType: 'order',
        price: 12.12345678,
        time: 1530000000000,
      },
      exit: {
        price: 12.12345678,
        time: 1540000000000,
      },
      weight: 0.5,
      score: 12.12345678,
    });

    deps.tradeRepo.getTrades
      .withArgs(sinon.match({ startTime: req.startTime }))
      .onFirstCall()
      .resolves([trade]);

    await service.rescoreTrades(req);

    sinon.assert.calledWithMatch(service.createTradeObj, trade);
  });

  test('calls tradeRepo.bulkUpdate with trades', async () => {
    const trade1 = new Trade({
      traderID: 'trader1',
      sourceID: 'source1',
      sourceType: 'order',
      exchangeID: 'binance',
      asset: 'BTC',
      quoteAsset: 'USDT',
      quantity: 1.12345678,
      entry: {
        sourceID: 'source1',
        sourceType: 'order',
        price: 12.12345678,
        time: 1530000000000,
      },
      exit: {
        price: 12.12345678,
        time: 1540000000000,
      },
      weight: 0.5,
      score: 12.12345678,
    });

    const trade2 = new Trade({
      traderID: 'trader1',
      sourceID: 'source1',
      sourceType: 'order',
      exchangeID: 'binance',
      asset: 'BTC',
      quoteAsset: 'USDT',
      quantity: 1.12345678,
      entry: {
        sourceID: 'source1',
        sourceType: 'order',
        price: 12.12345678,
        time: 1530000000000,
      },
      exit: {
        price: 12.12345678,
        time: 1540000000000,
      },
      weight: 0.5,
      score: 12.12345678,
    });

    deps.tradeRepo.getTrades
      .withArgs(sinon.match({
        traderID: req.traderID,
        limit: deps.rescoreFetchLimit,
        sort: 'asc',
      }))
      .onFirstCall()
      .resolves([trade1, trade2]);

    service.createTradeObj.withArgs(sinon.match(trade1)).resolves(trade1);
    service.createTradeObj.withArgs(sinon.match(trade2)).resolves(trade2);

    await service.rescoreTrades(req);

    sinon.assert.calledWithMatch(deps.tradeRepo.bulkUpdate, {
      trades: [trade1, trade2],
    });
  });

  test('dailyChangeStdDev and dailyChangeMean calculated and passed to createTradeObj', async () => {
    const pastTrade1 = new Trade({
      traderID: 'trader1',
      sourceID: 'source3',
      sourceType: 'order',
      exchangeID: 'binance',
      asset: 'BTC',
      quoteAsset: 'USDT',
      quantity: 1.12345678,
      entry: {
        sourceID: 'source1',
        sourceType: 'order',
        price: 12.12345678,
        time: 1540000000000 - (24 * 60 * 60 * 1000),
      },
      exit: {
        price: 12.12345678,
        time: 1540000000000,
      },
      weight: 0.5,
      score: 10,
    });

    const pastTrade2 = new Trade({
      traderID: 'trader1',
      sourceID: 'source4',
      sourceType: 'order',
      exchangeID: 'binance',
      asset: 'BTC',
      quoteAsset: 'USDT',
      quantity: 1.12345678,
      entry: {
        sourceID: 'source1',
        sourceType: 'order',
        price: 12.12345678,
        time: 1540000000000 - (24 * 60 * 60 * 1000),
      },
      exit: {
        price: 12.12345678,
        time: 1540000000000,
      },
      weight: 0.5,
      score: 5,
    });

    deps.tradeRepo.getTrades
      .withArgs(sinon.match({ endTime: req.startTime }))
      .onFirstCall()
      .resolves([pastTrade1, pastTrade2]);

    const trade1 = new Trade({
      traderID: 'trader1',
      sourceID: 'source1',
      sourceType: 'order',
      exchangeID: 'binance',
      asset: 'BTC',
      quoteAsset: 'USDT',
      quantity: 1.12345678,
      entry: {
        sourceID: 'source1',
        sourceType: 'order',
        price: 12.12345678,
        time: 1540000000000 - (24 * 60 * 60 * 1000),
      },
      exit: {
        price: 12.12345678,
        time: 1540000000000,
      },
      weight: 0.5,
      score: 15,
    });

    const trade2 = new Trade({
      traderID: 'trader1',
      sourceID: 'source2',
      sourceType: 'order',
      exchangeID: 'binance',
      asset: 'BTC',
      quoteAsset: 'USDT',
      quantity: 1.12345678,
      entry: {
        sourceID: 'source1',
        sourceType: 'order',
        price: 12.12345678,
        time: 1540000000000 - (24 * 60 * 60 * 1000),
      },
      exit: {
        price: 12.12345678,
        time: 1540000000000,
      },
      weight: 0.5,
      score: 20,
    });

    deps.tradeRepo.getTrades
      .withArgs(sinon.match({
        traderID: req.traderID,
        limit: deps.rescoreFetchLimit,
        sort: 'asc',
      }))
      .onFirstCall()
      .resolves([trade1, trade2]);

    service.createTradeObj.withArgs(sinon.match(trade1)).resolves(trade1);
    service.createTradeObj.withArgs(sinon.match(trade2)).resolves(trade2);

    await service.rescoreTrades(req);

    sinon.assert.calledWithMatch(service.createTradeObj, Object.assign({}, trade1, {
      dailyChangeStdDev: 2.5,
      dailyChangeMean: 7.5,
    }));

    sinon.assert.calledWithMatch(service.createTradeObj, Object.assign({}, trade2, {
      dailyChangeStdDev: 4.08248290463863,
      dailyChangeMean: 10,
    }));
  });
});
