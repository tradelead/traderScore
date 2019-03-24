const sinon = require('sinon');
const Order = require('../models/Order');
const IngressFilledOrder = require('./IngressFilledOrder');

const defaultReq = {
  sourceID: 'source123',
  traderID: 'trader123',
  exchangeID: 'exchange123',
  side: 'buy',
  asset: 'ETH',
  quoteAsset: 'BTC',
  quantity: 0.2,
  time: Date.now(),
  price: 0.1,
};

let unitOfWork = {};

const unitOfWorkFactory = {
  create: async () => unitOfWork,
};

const deps = { unitOfWorkFactory };

beforeEach(() => {
  unitOfWork = {
    orderRepo: {
      add: sinon.stub(),
    },
    tradeService: {
      newTrade: sinon.stub(),
    },
    complete: sinon.stub(),
    rollback: sinon.stub(),
  };

  unitOfWork.orderRepo.add.resolves('order123');
});

describe('execute', () => {
  it('completes unit of work on success', async () => {
    const useCase = new IngressFilledOrder(deps);
    await useCase.execute(defaultReq);

    const unitOfWorkCompletedCalled = unitOfWork.complete.called;
    return expect(unitOfWorkCompletedCalled).toBe(true);
  });

  it('rollback unit of work on orderRepo throws error', async () => {
    unitOfWork.orderRepo.add.rejects();

    const useCase = new IngressFilledOrder(deps);
    try {
      await useCase.execute(defaultReq);
    } catch (e) {}

    const unitOfWorkRollbackCalled = unitOfWork.rollback.called;
    return expect(unitOfWorkRollbackCalled).toBe(true);
  });

  it('throws error on orderRepo throws error', async () => {
    unitOfWork.orderRepo.add.rejects();

    const useCase = new IngressFilledOrder(deps);
    return expect(useCase.execute(defaultReq)).rejects.toThrow();
  });

  it('saves order', async () => {
    const useCase = new IngressFilledOrder(deps);
    await useCase.execute(defaultReq);

    const order = new Order(defaultReq);
    const called = unitOfWork.orderRepo.add.calledWith(order);

    expect(called).toBe(true);
  });

  describe('new trade', () => {
    test('new trade use case called', async () => {
      const useCase = new IngressFilledOrder(deps);
      await useCase.execute(defaultReq);

      const newTradeCalled = unitOfWork.tradeService.newTrade.called;
      expect(newTradeCalled).toBe(true);
    });

    test('called with order sourceID', async () => {
      const useCase = new IngressFilledOrder(deps);
      await useCase.execute(defaultReq);

      const newTradeArg = unitOfWork.tradeService.newTrade.getCall(0).args[0];
      expect(newTradeArg).toHaveProperty('sourceID', defaultReq.sourceID);
    });

    test('called with sourceType as order', async () => {
      const useCase = new IngressFilledOrder(deps);
      await useCase.execute(defaultReq);

      const newTradeArg = unitOfWork.tradeService.newTrade.getCall(0).args[0];
      expect(newTradeArg).toHaveProperty('sourceType', 'order');
    });

    test('called with order traderID', async () => {
      const useCase = new IngressFilledOrder(deps);
      await useCase.execute(defaultReq);

      const newTradeArg = unitOfWork.tradeService.newTrade.getCall(0).args[0];
      expect(newTradeArg).toHaveProperty('traderID', defaultReq.traderID);
    });

    test('called with order exchangeID', async () => {
      const useCase = new IngressFilledOrder(deps);
      await useCase.execute(defaultReq);

      const newTradeArg = unitOfWork.tradeService.newTrade.getCall(0).args[0];
      expect(newTradeArg).toHaveProperty('exchangeID', defaultReq.exchangeID);
    });

    test('called with order asset', async () => {
      const useCase = new IngressFilledOrder(deps);
      await useCase.execute(defaultReq);

      const newTradeArg = unitOfWork.tradeService.newTrade.getCall(0).args[0];
      expect(newTradeArg).toHaveProperty('asset', defaultReq.asset);
    });

    test('called with incrementScores as inverse of past', async () => {
      const useCase = new IngressFilledOrder(deps);
      const req = Object.assign({}, defaultReq);
      req.past = true;
      await useCase.execute(req);

      const newTradeArg = unitOfWork.tradeService.newTrade.getCall(0).args[0];
      expect(newTradeArg).toHaveProperty('incrementScores', false);
    });

    test('buy order called with order quantity * price (with arithmetic precision) as exitQuantity', async () => {
      const useCase = new IngressFilledOrder(deps);
      const req = Object.assign({}, defaultReq);
      req.side = 'buy';
      req.quantity = 0.2;
      req.price = 0.1;

      await useCase.execute(req);

      const newTradeArg = unitOfWork.tradeService.newTrade.getCall(0).args[0];
      expect(newTradeArg).toHaveProperty('exitQuantity', 0.02);
    });

    test('buy order called with asset as trade asset', async () => {
      const useCase = new IngressFilledOrder(deps);
      const req = Object.assign({}, defaultReq);
      req.side = 'buy';

      await useCase.execute(req);

      const newTradeArg = unitOfWork.tradeService.newTrade.getCall(0).args[0];
      expect(newTradeArg).toHaveProperty('asset', req.asset);
    });

    test('sell order called with order quantity as exitQuantity', async () => {
      const useCase = new IngressFilledOrder(deps);
      const req = Object.assign({}, defaultReq);
      req.side = 'sell';
      req.quantity = 0.2;

      await useCase.execute(req);

      const newTradeArg = unitOfWork.tradeService.newTrade.getCall(0).args[0];
      expect(newTradeArg).toHaveProperty('exitQuantity', 0.2);
    });

    test('sell order called with quote asset as trade asset', async () => {
      const useCase = new IngressFilledOrder(deps);
      const req = Object.assign({}, defaultReq);
      req.side = 'sell';

      await useCase.execute(req);

      const newTradeArg = unitOfWork.tradeService.newTrade.getCall(0).args[0];
      expect(newTradeArg).toHaveProperty('asset', req.quoteAsset);
    });

    test('called with order time as exitTime', async () => {
      const useCase = new IngressFilledOrder(deps);
      await useCase.execute(defaultReq);

      const newTradeArg = unitOfWork.tradeService.newTrade.getCall(0).args[0];
      expect(newTradeArg).toHaveProperty('exitTime', defaultReq.time);
    });
  });
});

describe('data validation', () => {
  test('invalid request throws BadRequest', async () => {
    const useCase = new IngressFilledOrder({});

    expect.assertions(1);

    try {
      await useCase.execute({});
    } catch (error) {
      expect(error.name).toBe('BadRequest');
    }
  });

  it('throws error when missing sourceID', () => {
    const useCase = new IngressFilledOrder(deps);
    const req = Object.assign({}, defaultReq);
    req.sourceID = '';
    expect(useCase.execute(req)).rejects.toThrow('"Source ID" is not allowed to be empty');
  });

  it('throws error when missing traderID', () => {
    const useCase = new IngressFilledOrder(deps);
    const req = Object.assign({}, defaultReq);
    req.traderID = '';
    expect(useCase.execute(req)).rejects.toThrow('"Trader ID" is not allowed to be empty');
  });

  it('throws error when missing exchangeID', () => {
    const useCase = new IngressFilledOrder(deps);
    const req = Object.assign({}, defaultReq);
    req.exchangeID = '';
    expect(useCase.execute(req)).rejects.toThrow('"Exchange ID" is not allowed to be empty');
  });

  it('throws error when missing side', () => {
    const useCase = new IngressFilledOrder(deps);
    const req = Object.assign({}, defaultReq);
    req.side = '';
    expect(useCase.execute(req)).rejects.toThrow('"Side" is not allowed to be empty');
  });

  it('throws error when missing asset', () => {
    const useCase = new IngressFilledOrder(deps);
    const req = Object.assign({}, defaultReq);
    req.asset = '';
    expect(useCase.execute(req)).rejects.toThrow('"Asset" is not allowed to be empty');
  });

  it('throws error when missing quoteAsset', () => {
    const useCase = new IngressFilledOrder(deps);
    const req = Object.assign({}, defaultReq);
    req.quoteAsset = '';
    expect(useCase.execute(req)).rejects.toThrow('"Quote Asset" is not allowed to be empty');
  });

  it('throws error when missing quantity', () => {
    const useCase = new IngressFilledOrder(deps);
    const req = Object.assign({}, defaultReq);
    req.quantity = 0;
    expect(useCase.execute(req)).rejects.toThrow('"Quantity" must be a positive number');
  });

  it('throws error when missing time', () => {
    const useCase = new IngressFilledOrder(deps);
    const req = Object.assign({}, defaultReq);
    req.time = 0;
    expect(useCase.execute(req)).rejects.toThrow('"Time" must be greater than 0');
  });

  it('throws error when missing price', () => {
    const useCase = new IngressFilledOrder(deps);
    const req = Object.assign({}, defaultReq);
    req.price = 0;
    expect(useCase.execute(req)).rejects.toThrow('"Price" must be a positive number');
  });

  test('no error when unknown key is passed', async () => {
    const useCase = new IngressFilledOrder(deps);
    const req = Object.assign({}, defaultReq);
    req.type = 'test';

    return expect(useCase.execute(req)).resolves;
  });
});
