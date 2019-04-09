const sinon = require('sinon');
const EntryService = require('./EntryService');

let deps = {};

beforeEach(() => {
  // reset deps for each test
  deps = {
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
    getEntriesLimitPerFetch: 3,
  };
});

describe('getEntries', () => {
  let service;
  let req;
  let orders;
  let deposits;

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

    deps.orderService.getFilledOrders.callsFake(async () => nextOrder());

    const defaultTransfer = {
      quantity: 1,
      unusedQty: 0.5,
      asset: req.asset,
    };
    deposits = [
      Object.assign({}, defaultTransfer, { sourceID: '1', time: 1 }),
      Object.assign({}, defaultTransfer, { sourceID: '4', time: 4 }),
      Object.assign({}, defaultTransfer, { sourceID: '5', time: 5 }),
      Object.assign({}, defaultTransfer, { sourceID: '6', time: 6 }),
    ];

    let depositIndex = 0;
    const nextDeposit = () => {
      if (deposits.length - 1 < depositIndex) { return null; }
      const deposit = deposits[depositIndex];
      depositIndex += 1;
      return [deposit];
    };

    deps.transferService.findDeposits.callsFake(async () => nextDeposit());

    service = new EntryService(deps);
  });

  describe('calls getFilledOrders', () => {
    beforeEach(async () => {
      await service.getEntries(req);
    });

    it('calls with traderID', async () => {
      const { traderID } = req;
      sinon.assert.calledWithMatch(deps.orderService.getFilledOrders, { traderID });
    });

    it('calls with exchangeID', async () => {
      const { exchangeID } = req;
      sinon.assert.calledWithMatch(deps.orderService.getFilledOrders, { exchangeID });
    });

    it('calls with asset', async () => {
      const { asset } = req;
      sinon.assert.calledWithMatch(deps.orderService.getFilledOrders, { asset });
    });

    it('calls with exitTime', async () => {
      const endTime = req.exitTime;
      expect(deps.orderService.getFilledOrders.calledWithMatch({ endTime })).toBe(true);
      sinon.assert.calledWithMatch(deps.orderService.getFilledOrders, { sort: 'desc' });
    });

    it('calls with sort desc', async () => {
      sinon.assert.calledWithMatch(deps.orderService.getFilledOrders, { sort: 'desc' });
    });

    it('calls with unused', async () => {
      sinon.assert.calledWithMatch(deps.orderService.getFilledOrders, { unused: true });
    });

    test('first call has startTime of zero', async () => {
      const startTime = 0;
      sinon.assert.calledWithMatch(deps.orderService.getFilledOrders, { startTime });
    });

    it('calls startTime with time of last item', async () => {
      const { time } = orders[0];
      sinon.assert.calledWithMatch(
        deps.orderService.getFilledOrders.secondCall,
        { startTime: time },
      );
    });
  });

  describe('calls findDeposits', () => {
    beforeEach(async () => {
      await service.getEntries(req);
    });

    it('calls with traderID', async () => {
      const { traderID } = req;
      deps.transferService.findDeposits.calledWithMatch({ traderID });
      sinon.assert.calledWithMatch(deps.transferService.findDeposits, { traderID });
    });

    it('calls with exchangeID', async () => {
      const { exchangeID } = req;
      sinon.assert.calledWithMatch(deps.transferService.findDeposits, { exchangeID });
    });

    it('calls with asset', async () => {
      const { asset } = req;
      sinon.assert.calledWithMatch(deps.transferService.findDeposits, { asset });
    });

    it('calls with exitTime', async () => {
      const endTime = req.exitTime;
      sinon.assert.calledWithMatch(deps.transferService.findDeposits, { endTime });
    });

    it('calls with sort desc', async () => {
      sinon.assert.calledWithMatch(deps.transferService.findDeposits, { sort: 'desc' });
    });

    it('calls with unused', async () => {
      sinon.assert.calledWithMatch(deps.transferService.findDeposits, { unused: true });
    });

    test('first call has startTime of zero', async () => {
      const startTime = 0;
      sinon.assert.calledWithMatch(deps.transferService.findDeposits, { startTime });
    });

    it('calls startTime with time of last item', async () => {
      const { time } = deposits[0];
      sinon.assert.calledWithMatch(
        deps.transferService.findDeposits.secondCall,
        { startTime: time },
      );
    });
  });

  it('returns entries (orders, deposits) in order when multi-fetch needed', async () => {
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
    service = new EntryService(deps);
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
      entry = { sourceType: 'deposit' };
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
