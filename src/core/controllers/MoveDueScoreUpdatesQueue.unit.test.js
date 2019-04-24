const MoveDueScoreUpdatesQueue = require('./MoveDueScoreUpdatesQueue');

let deps;
let useCase;

beforeEach(() => {
  deps = {
    scoreUpdateScheduleRepo: {
      fetchDue: jest.fn(),
      complete: jest.fn(),
    },
    scoreUpdatesQueue: {
      push: jest.fn(),
    },
  };

  useCase = new MoveDueScoreUpdatesQueue(deps);
});

it('it adds fetchDue items to scoreUpdatesQueue', async () => {
  deps.scoreUpdateScheduleRepo.fetchDue.mockImplementation(async () => [
    {
      ID: '1',
      traderID: 'trader1',
      period: 'day',
    },
    {
      ID: '2',
      traderID: 'trader1',
      period: 'week',
    },
  ]);

  await useCase.execute();

  expect(deps.scoreUpdatesQueue.push).toHaveBeenCalledWith({
    traderID: 'trader1',
    period: 'day',
  });

  expect(deps.scoreUpdatesQueue.push).toHaveBeenCalledWith({
    traderID: 'trader1',
    period: 'week',
  });

  expect(deps.scoreUpdateScheduleRepo.complete).toHaveBeenCalledWith([{
    ID: '1',
    traderID: 'trader1',
    period: 'day',
  }, {
    ID: '2',
    traderID: 'trader1',
    period: 'week',
  }]);
});
