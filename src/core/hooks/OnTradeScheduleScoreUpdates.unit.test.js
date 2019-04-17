const { EventEmitter } = require('events');
const OnTradeScheduleScoreUpdates = require('./OnTradeScheduleScoreUpdates');

let onTradeScheduleScoreUpdates;
let deps;

beforeEach(() => {
  deps = {
    events: new EventEmitter(),
    traderScorePeriodConfig: [
      { id: 'day', duration: 60 * 60 * 24 * 1000 },
      { id: 'week', duration: 60 * 60 * 24 * 7 * 1000 },
    ],
    scoreUpdateScheduleRepo: {
      schedule: jest.fn(),
    },
  };
  onTradeScheduleScoreUpdates = new OnTradeScheduleScoreUpdates(deps);
});

it('calls ScoreUpdateScheduleRepo.schedule for each period', async () => {
  onTradeScheduleScoreUpdates.watch();

  const trade = {
    traderID: 'trader1',
    exit: { time: 123 },
  };

  deps.events.emit('newTrade', trade);

  expect(deps.scoreUpdateScheduleRepo.schedule).toHaveBeenCalledWith({
    traderID: trade.traderID,
    period: 'day',
    time: trade.exit.time + (60 * 60 * 24 * 1000),
  });

  expect(deps.scoreUpdateScheduleRepo.schedule).toHaveBeenCalledWith({
    traderID: trade.traderID,
    period: 'week',
    time: trade.exit.time + (60 * 60 * 24 * 7 * 1000),
  });
});
