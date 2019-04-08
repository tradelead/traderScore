const sinon = require('sinon');
const PortfolioService = require('./PortfolioService');

let deps;

beforeEach(() => {
  deps = {
    portfolioRepo: {
      incr: sinon.stub(),
      decr: sinon.stub(),
      snapshot: sinon.stub(),
    },
    exchangeService: {
      findMarketQuoteAsset: sinon.stub(),
      getBTCValue: sinon.stub(),
    },
  };
});

describe('BTCValue', () => {
  let service;
  let req;
  let portfolioSnapshotData;

  beforeEach(() => {
    portfolioSnapshotData = [
      { asset: 'BTC', exchangeID: 'exchange123', quantity: 1.2345 },
      { asset: 'ETH', exchangeID: 'exchange123', quantity: 2.3456 },
    ];
    deps.portfolioRepo.snapshot.resolves(portfolioSnapshotData);

    deps.exchangeService.findMarketQuoteAsset
      .withArgs(sinon.match.has('asset', 'BTC'))
      .resolves('USDT');

    deps.exchangeService.findMarketQuoteAsset
      .withArgs(sinon.match.has('asset', 'ETH'))
      .resolves('BTC');

    deps.exchangeService.getBTCValue.resolves(1);

    service = new PortfolioService(deps);
    req = { traderID: 'trader123', time: 123 };
  });

  it('sum portfolio snapshot btc value floating points with precision', async () => {
    deps.exchangeService.getBTCValue.onFirstCall().resolves(0.1);
    deps.exchangeService.getBTCValue.onSecondCall().resolves(0.2);

    const btc = await service.BTCValue(req);
    expect(btc).toBe(0.3);
  });

  it('calls findMarketQuoteAsset with exchangeID, asset, and btc as preferred', async () => {
    await service.BTCValue(req);

    portfolioSnapshotData.forEach((portfolioItem) => {
      sinon.assert.calledWith(deps.exchangeService.findMarketQuoteAsset, {
        asset: portfolioItem.asset,
        exchangeID: portfolioItem.exchangeID,
        preferredQuoteAsset: 'BTC',
      });
    });
  });

  describe('calls getBTCValue', () => {
    beforeEach(async () => {
      await service.BTCValue(req);
    });

    it('calls getBTCValue with quote asset from findMarketQuoteAsset, ', async () => {
      sinon.assert.calledWithMatch(deps.exchangeService.getBTCValue, {
        asset: 'BTC',
        quoteAsset: 'USDT',
      });

      sinon.assert.calledWithMatch(deps.exchangeService.getBTCValue, {
        asset: 'ETH',
        quoteAsset: 'BTC',
      });
    });

    it('calls getBTCValue with exchangeID from portfolioItem', async () => {
      sinon.assert.calledWithMatch(deps.exchangeService.getBTCValue, {
        exchangeID: portfolioSnapshotData[0].exchangeID,
      });
    });

    it('calls getBTCValue with asset from portfolioItem', async () => {
      sinon.assert.calledWithMatch(deps.exchangeService.getBTCValue, {
        asset: portfolioSnapshotData[0].asset,
      });
    });

    it('calls getBTCValue with quantity from portfolioItem', async () => {
      sinon.assert.calledWithMatch(deps.exchangeService.getBTCValue, {
        qty: portfolioSnapshotData[0].quantity,
      });
    });

    it('calls getBTCValue with time', async () => {
      sinon.assert.calledWithMatch(deps.exchangeService.getBTCValue, {
        time: req.time,
      });
    });
  });
});

test('incr should call portfolioRepo', async () => {
  const service = new PortfolioService(deps);
  await service.incr({ test: 1 });
  sinon.assert.calledWith(deps.portfolioRepo.incr, { test: 1 });
});

test('decr should call portfolioRepo', async () => {
  const service = new PortfolioService(deps);
  await service.decr({ test: 1 });
  sinon.assert.calledWith(deps.portfolioRepo.decr, { test: 1 });
});

test('snapshot should call portfolioRepo', async () => {
  const service = new PortfolioService(deps);
  await service.snapshot({ test: 1 });
  sinon.assert.calledWith(deps.portfolioRepo.snapshot, { test: 1 });
});
