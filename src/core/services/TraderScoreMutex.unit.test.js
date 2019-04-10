const TraderScoreMutex = require('./TraderScoreMutex');

let traderScoreMutex;
let mutex;

beforeEach(() => {
  mutex = jest.fn();
  traderScoreMutex = new TraderScoreMutex({ mutex });
});

it('calls mutex', async () => {
  await traderScoreMutex.obtain({ traderID: 'trader1', period: 'day' });
  expect(mutex).toHaveBeenCalledWith('score-trader1-day');
});

test('when period is undefined', async () => {
  await traderScoreMutex.obtain({ traderID: 'trader1' });
  expect(mutex).toHaveBeenCalledWith('score-trader1-global');
});

test('returns lock from mutex factory', async () => {
  const obj = {};
  mutex.mockImplementation(async () => obj);
  const lock = await traderScoreMutex.obtain({ traderID: 'trader1' });
  return expect(lock).toBe(obj);
});

test('throws error when traderID undefined', async () => {
  return expect(traderScoreMutex.obtain({ })).rejects.toThrow();
});
