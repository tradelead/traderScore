const TransferService = require('./TransferService');
const Deposit = require('../models/Deposit');
const Withdrawal = require('../models/Withdrawal');

let deps;
let service;

beforeEach(async () => {
  deps = {
    transferRepo: {
      addDeposit: jest.fn(),
      addWithdrawal: jest.fn(),
      findDeposits: jest.fn(),
      findWithdrawals: jest.fn(),
      use: jest.fn(),
    },
    portfolioService: {
      incr: jest.fn(),
      decr: jest.fn(),
    },
  };
  service = new TransferService(deps);
});

describe('addDeposit', () => {
  let req;

  beforeEach(() => {
    req = new Deposit({
      traderID: 'trader123',
      sourceID: 'source123',
      exchangeID: 'exchange123',
      asset: 'ETH',
      time: Date.now(),
      quantity: 12.345,
    });
  });

  it('calls transferRepo', async () => {
    await service.addDeposit(req);

    return expect(deps.transferRepo.addDeposit).toHaveBeenCalledWith(req);
  });

  it('throws error if transferRepo addDeposit rejects', async () => {
    deps.transferRepo.addDeposit.mockRejectedValue(new Error('test'));
    return expect(service.addDeposit(req)).rejects.toThrow('test');
  });

  it('calls portfolioService incr', async () => {
    await service.addDeposit(req);

    return expect(deps.portfolioService.incr).toHaveBeenCalledWith({
      traderID: req.traderID,
      exchangeID: req.exchangeID,
      asset: req.asset,
      time: req.time,
      quantity: req.quantity,
    });
  });

  it('throws error if portfolioService incr rejects', async () => {
    deps.portfolioService.incr.mockRejectedValue(new Error('test'));
    return expect(service.addDeposit(req)).rejects.toThrow('test');
  });
});

describe('addWithdrawal', () => {
  let req;

  beforeEach(() => {
    req = new Withdrawal({
      traderID: 'trader123',
      sourceID: 'source123',
      exchangeID: 'exchange123',
      asset: 'ETH',
      time: Date.now(),
      quantity: 12.345,
    });
  });

  it('calls transferRepo', async () => {
    await service.addWithdrawal(req);

    return expect(deps.transferRepo.addWithdrawal).toHaveBeenCalledWith(req);
  });

  it('throws error if transferRepo addWithdrawal rejects', async () => {
    deps.transferRepo.addWithdrawal.mockRejectedValue(new Error('test'));
    return expect(service.addWithdrawal(req)).rejects.toThrow('test');
  });

  it('calls portfolioService decr', async () => {
    await service.addWithdrawal(req);

    return expect(deps.portfolioService.decr).toHaveBeenCalledWith({
      traderID: req.traderID,
      exchangeID: req.exchangeID,
      asset: req.asset,
      time: req.time,
      quantity: req.quantity,
    });
  });

  it('throws error if portfolioService decr rejects', async () => {
    deps.portfolioService.decr.mockRejectedValue(new Error('test'));
    return expect(service.addWithdrawal(req)).rejects.toThrow('test');
  });
});

test('findDeposits() should call transferRepo', async () => {
  await service.findDeposits({ test: 1 });
  expect(deps.transferRepo.findDeposits).toHaveBeenCalledWith({ test: 1 });
});

test('findWithdrawals() should call transferRepo', async () => {
  await service.findWithdrawals({ test: 1 });
  expect(deps.transferRepo.findWithdrawals).toHaveBeenCalledWith({ test: 1 });
});

test('use() should call transferRepo', async () => {
  await service.use({ test: 1 });
  expect(deps.transferRepo.use).toHaveBeenCalledWith({ test: 1 });
});
