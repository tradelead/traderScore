const knexFactory = require('knex');
const knexConfig = require('./knexfile');
const ScoreUpdateScheduleRepo = require('./ScoreUpdateScheduleRepo');

let deps;
let repo;

const env = (process.env.NODE_ENV ? process.env.NODE_ENV : 'development');
const knex = knexFactory(knexConfig[env]);
const tableName = 'scoreUpdateSchedule';

beforeEach(async () => {
  await knex(tableName).truncate();

  deps = {
    knexConn: knex,
  };

  repo = new ScoreUpdateScheduleRepo(deps);
});

// restore time after each
const { now } = Date;
afterEach(() => {
  Date.now = now;
});

let req;

beforeEach(() => {
  req = {
    traderID: 'trader1',
    period: 'day',
    time: 10000,
  };
});

it('works', async () => {
  await repo.schedule(req);

  Date.now = jest.fn().mockReturnValue(1000);
  let updatesDue = await repo.fetchDue(req);

  expect(updatesDue).toHaveLength(0);

  Date.now = jest.fn().mockReturnValue(10000);
  updatesDue = await repo.fetchDue(req);

  expect(updatesDue).toHaveLength(1);
  expect(updatesDue[0]).toMatchObject(req);
  expect(updatesDue[0].ID).toBeGreaterThan(0);

  await repo.complete(updatesDue);

  updatesDue = await repo.fetchDue(req);
  expect(updatesDue).toHaveLength(0);
});

test('complete only deletes items specified', async () => {
  const [ID1] = await repo.schedule(req);
  const [ID2] = await repo.schedule(req);

  await repo.complete([{ ID: ID1 }]);

  const updatesDue = await repo.fetchDue(req);
  expect(updatesDue[0].ID).toEqual(ID2);
  expect(updatesDue).toHaveLength(1);
});
