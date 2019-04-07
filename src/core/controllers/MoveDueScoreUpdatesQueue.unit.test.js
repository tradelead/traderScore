const MoveDueScoreUpdatesQueue = require('./MoveDueScoreUpdatesQueue');

let deps;
let useCase;

beforeEach(() => {
  deps = {
    scoreUpdateScheduleRepo: {
      fetchDue: jest.fn(),
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
      traderID: 'trader1',
      period: 'day',
    },
    {
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
});
