const sinon = require('sinon');
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
    tradeRepo: {
      addTrade: sinon.stub(),
      getDailyTradeChangeStdDeviation: sinon.stub(),
      getDailyTradeChangeMean: sinon.stub(),
    },
    traderScoreService: {
      incrementScores: sinon.stub(),
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
    transferRepo: {
      getSuccessfulDeposits: sinon.stub(),
      getSuccessfulWithdrawals: sinon.stub(),
    },
    orderRepo: {
      getFilledOrders: sinon.stub(),
    },
    getEntriesLimitPerFetch: 3,
  };
});

describe('newTrade', () => {
  let service;

  beforeEach(() => {
    deps.exchangeService.getPrice.resolves(123);
    deps.exchangeService.getBTCValue.resolves(50);
    deps.globalMarketService.marketChange.resolves(0.02);
    deps.traderPortfolio.BTCValue.resolves(100);
    deps.tradeRepo.getDailyTradeChangeStdDeviation.resolves(0.01);
    deps.tradeRepo.getDailyTradeChangeMean.resolves(0.03);

    service = new TradeService(deps);

    sinon.stub(service, 'getEntries');
    const entryTime = Date.now() - 10000;
    service.getEntries.resolves([
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

    sinon.stub(service, 'getEntryQuoteAsset');
    service.getEntryQuoteAsset.resolves('ABC');
  });

  describe('calls getEntries', () => {
    it('calls getEntries once', async () => {
      await service.newTrade(defaultReq);

      sinon.assert.callCount(service.getEntries, 1);
    });

    it('passes exitQuantity to getEntries qty', async () => {
      const req = Object.assign({}, defaultReq);
      req.exitQuantity = 0.2;

      await service.newTrade(req);

      sinon.assert.calledWithMatch(service.getEntries, { qty: 0.2 });
    });

    it('passes exitTime to getEntries', async () => {
      const req = Object.assign({}, defaultReq);

      await service.newTrade(req);

      sinon.assert.calledWithMatch(service.getEntries, { exitTime: req.exitTime });
    });

    it('passes traderID to getEntries', async () => {
      await service.newTrade(defaultReq);

      sinon.assert.calledWithMatch(service.getEntries, { traderID: defaultReq.traderID });
    });

    it('passes exchangeID to getEntries', async () => {
      await service.newTrade(defaultReq);

      sinon.assert.calledWithMatch(service.getEntries, { exchangeID: defaultReq.exchangeID });
    });

    it('passes asset to getEntries', async () => {
      await service.newTrade(defaultReq);

      sinon.assert.calledWithMatch(service.getEntries, { asset: defaultReq.asset });
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
      service.getEntries.resolves(entries);
      await service.newTrade(defaultReq);
    });

    it('called with first entry, exchangeID, & asset', () => {
      sinon.assert.calledWithMatch(service.getEntryQuoteAsset, entries[0], exchangeID, asset);
    });

    it('called with second entry, exchangeID, & asset', () => {
      sinon.assert.calledWithMatch(service.getEntryQuoteAsset, entries[1], exchangeID, asset);
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
    service.getEntries.resolves(entries);

    service.getEntryQuoteAsset.resolves('USDT');

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
    service.getEntryQuoteAsset.resolves('USDT');

    deps.exchangeService.getPrice.withArgs({
      exchangeID: defaultReq.exchangeID,
      asset: defaultReq.asset,
      quoteAsset: 'USDT',
      time: defaultReq.exitTime,
    }).resolves(0.123456);

    const trades = await service.newTrade(defaultReq);

    expect(trades[0]).toHaveProperty('exit.price', 0.123456);
  });

  test('globalMarketService.marketChange called with entry time and exit time', async () => {
    const entryTime = Date.now() - 10000;
    service.getEntries.resolves([{
      time: entryTime,
      quantity: defaultReq.exitQuantity,
      sourceType: 'order',
      sourceID: 'entry1',
      source: {
        side: 'buy',
        quoteAsset: 'USDT',
      },
    }]);

    await service.newTrade(defaultReq);

    sinon.assert.calledWith(deps.globalMarketService.marketChange, entryTime, defaultReq.exitTime);
  });

  it('saves new trade for each entry', async () => {
    await service.newTrade(defaultReq);

    sinon.assert.callCount(deps.tradeRepo.addTrade, 2);
  });

  it('calls traderScoreService.incrementScore', async () => {
    const trades = await service.newTrade(defaultReq);

    const expectedArgs = { trades };
    sinon.assert.calledWith(deps.traderScoreService.incrementScores, expectedArgs);
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

describe('getEntries', () => {
  let service;
  let req;
  let orders;
  let deposits;
  let withdrawals;

  beforeEach(() => {
    deps.getEntriesLimitPerFetch = 1;

    req = {
      traderID: '123',
      exchangeID: 'binance',
      asset: 'ETH',
      qty: 3.0,
      exitTime: Date.now(),
    };

    const defaultOrder = {
      quantity: 1,
      unusedQty: 0.5,
    };
    const defaultSellOrder = Object.assign({}, defaultOrder, {
      type: 'sell',
      asset: 'ABC',
      quoteAsset: req.asset,
    });
    const defaultBuyOrder = Object.assign({}, defaultOrder, {
      type: 'buy',
      asset: req.asset,
      quoteAsset: 'USDT',
    });

    orders = [
      Object.assign({}, defaultBuyOrder, { sourceID: '2', time: 2 }),
      Object.assign({}, defaultSellOrder, { sourceID: '3', time: 3 }),
    ];

    let orderIndex = 0;
    const nextOrder = () => {
      if (orders.length - 1 < orderIndex) { return null; }
      const order = orders[orderIndex];
      orderIndex += 1;
      return [order];
    };

    deps.orderRepo.getFilledOrders.callsFake(async () => nextOrder());

    const defaultTransfer = {
      quantity: 1,
      unusedQty: 0.5,
      asset: req.asset,
    };
    deposits = [
      Object.assign({}, defaultTransfer, { sourceID: '1', time: 1 }),
    ];

    let depositIndex = 0;
    const nextDeposit = () => {
      if (deposits.length - 1 < depositIndex) { return null; }
      const deposit = deposits[depositIndex];
      depositIndex += 1;
      return [deposit];
    };

    deps.transferRepo.getSuccessfulDeposits.callsFake(async () => nextDeposit());

    withdrawals = [
      Object.assign({}, defaultTransfer, { sourceID: '4', time: 4 }),
      Object.assign({}, defaultTransfer, { sourceID: '5', time: 5 }),
      Object.assign({}, defaultTransfer, { sourceID: '6', time: 6 }),
    ];

    let withdrawalIndex = 0;
    const nextWithdrawal = () => {
      if (withdrawals.length - 1 < withdrawalIndex) { return null; }
      const withdrawal = withdrawals[withdrawalIndex];
      withdrawalIndex += 1;
      return [withdrawal];
    };

    deps.transferRepo.getSuccessfulWithdrawals.callsFake(async () => nextWithdrawal());

    service = new TradeService(deps);
  });

  describe('calls getFilledOrders', () => {
    beforeEach(async () => {
      await service.getEntries(req);
    });

    it('calls with traderID', async () => {
      const { traderID } = req;
      deps.orderRepo.getFilledOrders.calledWithMatch({ traderID });
    });

    it('calls with exchangeID', async () => {
      const { exchangeID } = req;
      deps.orderRepo.getFilledOrders.calledWithMatch({ exchangeID });
    });

    it('calls with asset', async () => {
      const { asset } = req;
      deps.orderRepo.getFilledOrders.calledWithMatch({ asset });
    });

    it('calls with exitTime', async () => {
      const endTime = req.exitTime;
      deps.orderRepo.getFilledOrders.calledWithMatch({ endTime });
    });

    it('calls with sort desc', async () => {
      deps.orderRepo.getFilledOrders.calledWithMatch({ sort: 'desc' });
    });

    test('first call has startTime of zero', async () => {
      const startTime = 0;
      deps.orderRepo.getFilledOrders.calledWithMatch({ startTime });
    });

    it('calls startTime with time of last item', async () => {
      const { startTime } = orders[1];
      deps.orderRepo.getFilledOrders.secondCall.calledWithMatch({ startTime });
    });
  });

  describe('calls getSuccessfulDeposits', () => {
    beforeEach(async () => {
      await service.getEntries(req);
    });

    it('calls with traderID', async () => {
      const { traderID } = req;
      deps.transferRepo.getSuccessfulDeposits.calledWithMatch({ traderID });
    });

    it('calls with exchangeID', async () => {
      const { exchangeID } = req;
      deps.transferRepo.getSuccessfulDeposits.calledWithMatch({ exchangeID });
    });

    it('calls with asset', async () => {
      const { asset } = req;
      deps.transferRepo.getSuccessfulDeposits.calledWithMatch({ asset });
    });

    it('calls with exitTime', async () => {
      const endTime = req.exitTime;
      deps.transferRepo.getSuccessfulDeposits.calledWithMatch({ endTime });
    });

    it('calls with sort desc', async () => {
      deps.transferRepo.getSuccessfulDeposits.calledWithMatch({ sort: 'desc' });
    });

    test('first call has startTime of zero', async () => {
      const startTime = 0;
      deps.transferRepo.getSuccessfulDeposits.calledWithMatch({ startTime });
    });

    it('calls startTime with time of last item', async () => {
      const { startTime } = orders[1];
      deps.transferRepo.getSuccessfulDeposits.secondCall.calledWithMatch({ startTime });
    });
  });

  describe('calls getSuccessfulWithdrawals', () => {
    beforeEach(async () => {
      await service.getEntries(req);
    });

    it('calls with traderID', async () => {
      const { traderID } = req;
      deps.transferRepo.getSuccessfulWithdrawals.calledWithMatch({ traderID });
    });

    it('calls with exchangeID', async () => {
      const { exchangeID } = req;
      deps.transferRepo.getSuccessfulWithdrawals.calledWithMatch({ exchangeID });
    });

    it('calls with asset', async () => {
      const { asset } = req;
      deps.transferRepo.getSuccessfulWithdrawals.calledWithMatch({ asset });
    });

    it('calls with exitTime', async () => {
      const endTime = req.exitTime;
      deps.transferRepo.getSuccessfulWithdrawals.calledWithMatch({ endTime });
    });

    it('calls with sort desc', async () => {
      deps.transferRepo.getSuccessfulWithdrawals.calledWithMatch({ sort: 'desc' });
    });

    test('first call has startTime of zero', async () => {
      const startTime = 0;
      deps.transferRepo.getSuccessfulWithdrawals.calledWithMatch({ startTime });
    });

    it('calls startTime with time of last item', async () => {
      const { startTime } = orders[1];
      deps.transferRepo.getSuccessfulWithdrawals.secondCall.calledWithMatch({ startTime });
    });
  });

  it('returns entries (orders, deposits, withdrawals) in order when multi-fetch needed', async () => {
    const entries = await service.getEntries(req);

    const entrySourceIDs = entries.map(entry => entry.sourceID);
    expect(entrySourceIDs).toEqual(['1', '2', '3', '4', '5', '6']);
  });

  it('loops until sufficient entries quantity then stops', async () => {
    req.qty = 1.5;
    const entries = await service.getEntries(req);

    const entrySourceIDs = entries.map(entry => entry.sourceID);
    expect(entrySourceIDs).toEqual(['1', '2', '3']);
  });

  it('returns exact requested qty when entries unused qty sum is greater', async () => {
    req.qty = 1.3;
    const entries = await service.getEntries(req);

    const entrySum = entries.reduce((sum, entry) => sum + entry.quantity, 0);
    expect(entrySum).toEqual(1.3);
  });

  it('floating point precision', async () => {
    req.qty = 0.2;
    deposits[0].unusedQty = 0.1;
    orders[0].unusedQty = 0.2;
    const entries = await service.getEntries(req);

    const entrySum = entries.reduce((sum, entry) => sum + entry.quantity, 0);
    expect(entrySum).toEqual(0.2);
  });

  it('throws error when insufficient entry quantity sum', async () => {
    req.qty = 4;
    expect(service.getEntries(req)).rejects.toThrow('Insufficient entries');
  });
});

describe('getEntryQuoteAsset', () => {
  let service;
  let entry;
  let exchangeID;
  let asset;

  beforeEach(() => {
    entry = {
      sourceType: 'order',
      source: {
        side: 'buy',
        quoteAsset: 'USDT',
      },
    };
    exchangeID = 'binance';
    asset = 'ETH';

    deps.exchangeService.findMarketQuoteAsset.resolves('ABC');
    service = new TradeService(deps);
  });

  it('equals asset if root asset', async () => {
    deps.exchangeService.isRootAsset
      .withArgs(exchangeID, asset)
      .resolves(true);

    const quoteAsset = await service.getEntryQuoteAsset(entry, exchangeID, asset);

    expect(quoteAsset).toBe(asset);
  });

  it('equals entry\'s order quoteAsset if entry is buy order', async () => {
    entry = {
      sourceType: 'order',
      source: {
        side: 'buy',
        quoteAsset: 'USDT',
      },
    };

    const quoteAsset = await service.getEntryQuoteAsset(entry, exchangeID, asset);

    expect(quoteAsset).toBe('USDT');
  });

  it('equals exchangeService.findMarketQuoteAsset if entry is sell order', async () => {
    entry = {
      sourceType: 'order',
      source: {
        side: 'sell',
      },
    };

    const quoteAsset = await service.getEntryQuoteAsset(entry, exchangeID, asset);

    expect(quoteAsset).toBe('ABC');
  });

  it('equals exchangeService.findMarketQuoteAsset if entry is withdrawal', async () => {
    entry = {
      sourceType: 'withdrawal',
    };

    const quoteAsset = await service.getEntryQuoteAsset(entry, exchangeID, asset);

    expect(quoteAsset).toBe('ABC');
  });

  it('equals exchangeService.findMarketQuoteAsset if entry is deposit', async () => {
    entry = {
      sourceType: 'deposit',
    };

    const quoteAsset = await service.getEntryQuoteAsset(entry, exchangeID, asset);

    expect(quoteAsset).toBe('ABC');
  });

  it('throws error on unknown entry type', async () => {
    entry = {
      sourceType: 'unknownType',
    };

    expect(service.getEntryQuoteAsset(entry, exchangeID, asset)).rejects.toThrow('Unexpected entry type');
  });

  describe('calls exchangeService.findMarketQuoteAsset', () => {
    beforeEach(async () => {
      entry = { sourceType: 'withdrawal' };
      await service.getEntryQuoteAsset(entry, exchangeID, asset);
    });

    it('is called with exchange', async () => {
      sinon.assert.calledWithMatch(deps.exchangeService.findMarketQuoteAsset, { exchangeID });
    });

    it('is called with asset', async () => {
      sinon.assert.calledWithMatch(deps.exchangeService.findMarketQuoteAsset, { asset });
    });

    it('is called with preferredQuoteAsset of BTC', async () => {
      sinon.assert.calledWithMatch(deps.exchangeService.findMarketQuoteAsset, { preferredQuoteAsset: 'BTC' });
    });
  });
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
});
