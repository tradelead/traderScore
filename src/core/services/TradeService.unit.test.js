const sinon = require('sinon');
const BigNumber = require('bignumber.js');
const TradeService = require('./TradeService');

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
    traderScorePeriodConfig: [
      { id: 'day', duration: 60 * 60 * 24 * 1000 },
      { id: 'week', duration: 60 * 60 * 24 * 7 * 1000 },
    ],
    tradeRepo: {
      addTrade: sinon.stub(),
      getDailyTradeChangeStdDeviation: sinon.stub(),
      getDailyTradeChangeMean: sinon.stub(),
    },
    traderScoreRepo: {
      getTraderScore: sinon.stub(),
      updateTraderScore: sinon.stub(),
    },
    traderPortfolio: {
      BTCValue: sinon.stub(),
    },
    exchangeService: {
      getEntries: sinon.stub(),
      getPrice: sinon.stub(),
      getBTCValue: sinon.stub(),
      isRootAsset: sinon.stub(),
      findMarketQuoteAsset: sinon.stub(),
    },
    globalMarketService: {
      marketChange: sinon.stub(),
    },
  };
});

describe('execute', () => {
  beforeEach(() => {
    const entryTime = Date.now() - 10000;

    deps.exchangeService.getEntries.resolves([
      {
        time: entryTime,
        quantity: defaultReq.exitQuantity - 5,
        sourceType: 'order',
        sourceID: 'entry1',
        order: {
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

    deps.exchangeService.getPrice.resolves(123);
    deps.exchangeService.getBTCValue.resolves(50);
    deps.exchangeService.findMarketQuoteAsset.resolves('BTC');
    deps.globalMarketService.marketChange.resolves(0.02);
    deps.traderPortfolio.BTCValue.resolves(100);
    deps.tradeRepo.getDailyTradeChangeStdDeviation.resolves(0.01);
    deps.tradeRepo.getDailyTradeChangeMean.resolves(0.03);
    deps.traderScoreRepo.getTraderScore.resolves(100);
  });

  it('saves new trade for each entry', async () => {
    const entryTime = Date.now() - 10000;
    deps.exchangeService.getEntries.resetBehavior();
    deps.exchangeService.getEntries.resolves([
      {
        time: entryTime,
        quantity: defaultReq.exitQuantity - 5,
        sourceType: 'order',
        sourceID: 'entry1',
        order: {
          side: 'buy',
          quoteAsset: 'USDT',
        },
      },
      {
        time: entryTime,
        quantity: 5,
        sourceID: 'entry2',
        sourceType: 'withdrawal',
      },
    ]);

    const useCase = new TradeService(deps);
    await useCase.newTrade(defaultReq);

    sinon.assert.callCount(deps.tradeRepo.addTrade, 2);
  });

  describe('getEntries', () => {
    it('passes exitQuantity to getEntries qty', async () => {
      const useCase = new TradeService(deps);
      const req = Object.assign({}, defaultReq);
      req.exitQuantity = 0.2;

      await useCase.newTrade(req);

      const getEntriesFirstArg = deps.exchangeService.getEntries.getCall(0).args[0];
      expect(getEntriesFirstArg).toHaveProperty('qty', 0.2);
    });

    it('passes exchangeID to exchangeService.getEntries', async () => {
      const useCase = new TradeService(deps);
      await useCase.newTrade(defaultReq);

      const getEntriesFirstArg = deps.exchangeService.getEntries.getCall(0).args[0];
      expect(getEntriesFirstArg).toHaveProperty('exchange', defaultReq.exchangeID);
    });

    it('passes asset to exchangeService.getEntries', async () => {
      const useCase = new TradeService(deps);
      await useCase.newTrade(defaultReq);

      const getEntriesFirstArg = deps.exchangeService.getEntries.getCall(0).args[0];
      expect(getEntriesFirstArg).toHaveProperty('asset', defaultReq.asset);
    });
  });

  describe('trade quote asset', () => {
    it('equals asset if root asset', async () => {
      deps.exchangeService.isRootAsset
        .withArgs(defaultReq.exchangeID, defaultReq.asset)
        .resolves(true);

      const useCase = new TradeService(deps);
      const trades = await useCase.newTrade(defaultReq);

      expect(trades[0]).toHaveProperty('quoteAsset', defaultReq.asset);
    });

    it('equals entry\'s order quoteAsset if entry is buy order', async () => {
      deps.exchangeService.getEntries.resolves([{
        time: Date.now(),
        quantity: defaultReq.exitQuantity - 5,
        sourceType: 'order',
        sourceID: 'entry1',
        order: {
          side: 'buy',
          quoteAsset: 'USDT',
        },
      }]);

      const useCase = new TradeService(deps);
      const trades = await useCase.newTrade(defaultReq);

      expect(trades[0]).toHaveProperty('quoteAsset', 'USDT');
    });

    it('equals exchangeService.findMarketQuoteAsset if entry is sell order', async () => {
      deps.exchangeService.getEntries.resolves([{
        time: Date.now(),
        quantity: defaultReq.exitQuantity - 5,
        sourceType: 'order',
        sourceID: 'entry1',
        order: {
          side: 'sell',
        },
      }]);

      deps.exchangeService.findMarketQuoteAsset.resolves('ABC');

      const useCase = new TradeService(deps);
      const trades = await useCase.newTrade(defaultReq);

      expect(trades[0]).toHaveProperty('quoteAsset', 'ABC');
    });

    it('equals exchangeService.findMarketQuoteAsset if entry is withdrawal', async () => {
      deps.exchangeService.getEntries.resolves([{
        time: Date.now(),
        quantity: defaultReq.exitQuantity - 5,
        sourceType: 'withdrawal',
        sourceID: 'entry1',
      }]);

      deps.exchangeService.findMarketQuoteAsset.resolves('ABC');

      const useCase = new TradeService(deps);
      const trades = await useCase.newTrade(defaultReq);

      expect(trades[0]).toHaveProperty('quoteAsset', 'ABC');
    });

    it('equals exchangeService.findMarketQuoteAsset if entry is deposit', async () => {
      deps.exchangeService.getEntries.resolves([{
        time: Date.now(),
        quantity: defaultReq.exitQuantity - 5,
        sourceType: 'deposit',
        sourceID: 'entry1',
      }]);

      deps.exchangeService.findMarketQuoteAsset.resolves('ABC');

      const useCase = new TradeService(deps);
      const trades = await useCase.newTrade(defaultReq);

      expect(trades[0]).toHaveProperty('quoteAsset', 'ABC');
    });

    it('throws error on unknown entry type', async () => {
      deps.exchangeService.getEntries.resolves([{
        time: Date.now(),
        quantity: defaultReq.exitQuantity - 5,
        sourceType: 'test',
        sourceID: 'entry1',
      }]);

      const useCase = new TradeService(deps);
      return expect(useCase.newTrade(defaultReq)).rejects.toThrow('Unexpected entry type');
    });
  });

  describe('exchangeService.findMarketQuoteAsset', () => {
    it('is called with exchange', async () => {
      const useCase = new TradeService(deps);
      await useCase.newTrade(defaultReq);

      const findMarketQuoteAssetArg = deps.exchangeService.findMarketQuoteAsset.getCall(0).args[0];
      expect(findMarketQuoteAssetArg).toHaveProperty('exchange', defaultReq.exchangeID);
    });

    it('is called with asset', async () => {
      const useCase = new TradeService(deps);
      await useCase.newTrade(defaultReq);

      const findMarketQuoteAssetArg = deps.exchangeService.findMarketQuoteAsset.getCall(0).args[0];
      expect(findMarketQuoteAssetArg).toHaveProperty('asset', defaultReq.asset);
    });

    it('is called with preferredQuoteAsset of BTC', async () => {
      const useCase = new TradeService(deps);
      await useCase.newTrade(defaultReq);

      const findMarketQuoteAssetArg = deps.exchangeService.findMarketQuoteAsset.getCall(0).args[0];
      expect(findMarketQuoteAssetArg).toHaveProperty('preferredQuoteAsset', 'BTC');
    });
  });

  test('entry price returns price from exchangeService.getPrice', async () => {
    const entryTime = Date.now() - 10000;

    // used to determine quote asset for test
    deps.exchangeService.getEntries.resolves([{
      time: entryTime,
      quantity: defaultReq.exitQuantity,
      sourceType: 'order',
      sourceID: 'entry1',
      order: {
        side: 'buy',
        quoteAsset: 'USDT',
      },
    }]);

    deps.exchangeService.getPrice.withArgs({
      exchangeID: defaultReq.exchangeID,
      asset: defaultReq.asset,
      quoteAsset: 'USDT',
      time: entryTime,
    }).resolves(0.12345);

    const useCase = new TradeService(deps);
    const trades = await useCase.newTrade(defaultReq);

    expect(trades[0]).toHaveProperty('entry.price', 0.12345);
  });

  test('exit price returns price from exchangeService.getPrice', async () => {
    const entryTime = Date.now() - 10000;

    // used to determine quote asset for test
    deps.exchangeService.getEntries.resolves([{
      time: entryTime,
      quantity: defaultReq.exitQuantity,
      sourceType: 'order',
      sourceID: 'entry1',
      order: {
        side: 'buy',
        quoteAsset: 'USDT',
      },
    }]);

    deps.exchangeService.getPrice.withArgs({
      exchangeID: defaultReq.exchangeID,
      asset: defaultReq.asset,
      quoteAsset: 'USDT',
      time: defaultReq.exitTime,
    }).resolves(0.123456);

    const useCase = new TradeService(deps);
    const trades = await useCase.newTrade(defaultReq);

    expect(trades[0]).toHaveProperty('exit.price', 0.123456);
  });

  test('globalMarketService.marketChange called with entry time and exit time', async () => {
    const entryTime = Date.now() - 10000;
    deps.exchangeService.getEntries.resolves([{
      time: entryTime,
      quantity: defaultReq.exitQuantity,
      sourceType: 'order',
      sourceID: 'entry1',
      order: {
        side: 'buy',
        quoteAsset: 'USDT',
      },
    }]);

    const useCase = new TradeService(deps);
    await useCase.newTrade(defaultReq);

    sinon.assert.calledWith(deps.globalMarketService.marketChange, entryTime, defaultReq.exitTime);
  });

  describe('update trader scores', () => {
    beforeEach(() => {
      deps.traderScorePeriodConfig = [
        { id: 'day', duration: 60 * 60 * 24 * 1000 },
        { id: 'week', duration: 60 * 60 * 24 * 7 * 1000 },
      ];

      const exitTime = new BigNumber(defaultReq.exitTime);
      const entryTime = exitTime.minus(60 * 60 * 24 * 1000).toNumber();
      deps.exchangeService.getEntries.resolves([
        {
          time: entryTime,
          quantity: defaultReq.exitQuantity,
          sourceType: 'order',
          sourceID: 'entry1',
          order: { side: 'buy', quoteAsset: 'USDT' },
        },
      ]);

      deps.traderScoreRepo.getTraderScore.resolves(50);
      deps.exchangeService.getPrice.withArgs(sinon.match.has('time', entryTime)).resolves(1);
      deps.exchangeService.getPrice.resolves(1.5);
      deps.exchangeService.getBTCValue.resolves(1);
      deps.exchangeService.findMarketQuoteAsset.resolves('BTC');
      deps.globalMarketService.marketChange.resolves(0);
      deps.traderPortfolio.BTCValue.resolves(1);
      deps.tradeRepo.getDailyTradeChangeStdDeviation.resolves(0.0);
      deps.tradeRepo.getDailyTradeChangeMean.resolves(0.5);
    });

    it('calls getTraderScore correct number of time', async () => {
      const useCase = new TradeService(deps);
      await useCase.newTrade(defaultReq);

      sinon.assert.callCount(deps.traderScoreRepo.getTraderScore, 3);
    });

    it('calls getTraderScore with traderID and no period', async () => {
      const useCase = new TradeService(deps);
      await useCase.newTrade(defaultReq);

      const expectedArgs = { traderID: defaultReq.traderID };
      sinon.assert.calledWith(deps.traderScoreRepo.getTraderScore, expectedArgs);
    });

    it('calls getTraderScore with traderID and day period', async () => {
      const useCase = new TradeService(deps);
      await useCase.newTrade(defaultReq);

      const expectedArgs = { traderID: defaultReq.traderID, period: 'day' };
      sinon.assert.calledWith(deps.traderScoreRepo.getTraderScore, expectedArgs);
    });

    it('calls getTraderScore with traderID and week period', async () => {
      const useCase = new TradeService(deps);
      await useCase.newTrade(defaultReq);

      const expectedArgs = { traderID: defaultReq.traderID, period: 'week' };
      sinon.assert.calledWith(deps.traderScoreRepo.getTraderScore, expectedArgs);
    });

    it('updates global trader score with compounding arithmetic', async () => {
      const useCase = new TradeService(deps);
      await useCase.newTrade(defaultReq);

      const expectedArgs = { traderID: defaultReq.traderID, score: 75 };
      sinon.assert.calledWith(deps.traderScoreRepo.updateTraderScore, expectedArgs);
    });

    it('updates day trader score with compounding arithmetic', async () => {
      const useCase = new TradeService(deps);
      await useCase.newTrade(defaultReq);

      const expectedArgs = { traderID: defaultReq.traderID, period: 'day', score: 75 };
      sinon.assert.calledWith(deps.traderScoreRepo.updateTraderScore, expectedArgs);
    });

    it('updates week trader score with compounding arithmetic', async () => {
      const useCase = new TradeService(deps);
      await useCase.newTrade(defaultReq);

      const expectedArgs = { traderID: defaultReq.traderID, period: 'week', score: 75 };
      sinon.assert.calledWith(deps.traderScoreRepo.updateTraderScore, expectedArgs);
    });
  });
});

describe('score', () => {
  beforeEach(() => {
    deps.tradeRepo.getDailyTradeChangeStdDeviation.withArgs('trader123').resolves(0.01);
    deps.tradeRepo.getDailyTradeChangeMean.withArgs('trader123').resolves(0.03);
  });

  it('returns negative when less than market change', async () => {
    const useCase = new TradeService(deps);
    const score = await useCase.score({
      traderID: 'trader123',
      marketChange: 0.10,
      tradeChange: 0.05,
      entryTime: Date.now() - (60 * 60 * 24 * 1000),
      exitTime: Date.now(),
      weight: 0.5,
    });

    expect(score).toBe(-2.5);
  });

  it('returns positive when more than market change', async () => {
    const useCase = new TradeService(deps);
    const score = await useCase.score({
      traderID: 'trader123',
      marketChange: 0.10,
      tradeChange: 0.25,
      entryTime: Date.now() - (60 * 60 * 24 * 1000),
      exitTime: Date.now(),
      weight: 0.5,
    });

    expect(score).toBe(3.729715809318648);
  });

  it('returns positive when more than market change and only 6 hrs', async () => {
    const useCase = new TradeService(deps);
    const score = await useCase.score({
      traderID: 'trader123',
      marketChange: 0.10,
      tradeChange: 0.25,
      entryTime: Date.now() - (60 * 60 * 6 * 1000),
      exitTime: Date.now(),
      weight: 0.5,
    });

    expect(score).toBe(2.4036774610288023);
  });

  // TODO: more exact tests should be written. to determine if the score is correct
});

describe('tradeWeight', () => {
  beforeEach(() => {
    deps.traderPortfolio.BTCValue.withArgs({
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
    deps.traderPortfolio.BTCValue.resetBehavior();
    deps.traderPortfolio.BTCValue.resolves(0.1);

    return expect(useCase.tradeWeight(req)).resolves.toBe(0.1);
  });
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
