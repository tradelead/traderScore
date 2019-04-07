const RemoveTraderExchange = require('./RemoveTraderExchange');

let req;
let deps;
let useCase;

beforeEach(() => {
  deps = {
    exchangeIngressRepo: {
      markIncomplete: jest.fn(),
    },
  };

  req = {
    traderID: 'trader1',
    exchangeID: 'binance',
  };

  useCase = new RemoveTraderExchange(deps);
});

it('calls exchangeIngressRepo.markIncomplete', async () => {
  await useCase.execute(req);
  expect(deps.exchangeIngressRepo.markIncomplete).toHaveBeenCalledWith(req);
});
