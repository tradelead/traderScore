const knexFactory = require('knex');
const { EventEmitter } = require('events');
const Redis = require('ioredis');

const knexConfig = require('./knexfile');
const msToMySQLFormat = require('./msToMySQLFormat');
const ScoreRepo = require('./ScoreRepo');
const KnexTrxFactory = require('./KnexTrxFactory');

const env = (process.env.NODE_ENV ? process.env.NODE_ENV : 'development');
const knex = knexFactory(knexConfig[env]);
const knexTrxFactory = new KnexTrxFactory({ knex });
const tableName = 'scores';

const redis = new Redis(process.env.REDIS_URL);

let unitOfWork;
let scoreRepo;
let knexTrx;
let rolledBack;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

beforeEach(async () => {
  unitOfWork = new EventEmitter();
  unitOfWork.idShort = () => 'test';

  await knex(tableName).truncate();

  knexTrx = await knexTrxFactory.create();
  rolledBack = false;

  scoreRepo = new ScoreRepo({
    knexConn: knexTrx,
    knex,
    redis,
    unitOfWork,
  });
});

afterEach(async () => {
  if (!rolledBack) {
    await knexTrx.commit();
  }
});

afterAll(async () => {
  await knex.destroy();
});

beforeAll(async () => redis.flushdb());
afterAll(async () => redis.flushdb());

afterAll(async () => knex(tableName).truncate());

it('main: rolls back', async () => {
  await scoreRepo.updateTraderScore({
    traderID: 'trader1',
    score: 123.456789,
    period: 'day',
    time: 1540000000000,
  });
  await scoreRepo.knexConn.rollback();
  rolledBack = true;
  expect(await knex('scores').select()).toHaveLength(0);
});

describe('updateTraderScore', () => {
  const defaultReq = {
    traderID: 'trader1',
    score: 123.456789,
    period: 'day',
    time: 1540000000000,
  };

  it('saves to mysql table', async () => {
    await scoreRepo.updateTraderScore(defaultReq);
    const [scoreDb] = await knexTrx.from(tableName).select([
      'traderID',
      'period',
      'score',
      'time',
    ]);

    expect(scoreDb.traderID).toEqual(defaultReq.traderID);
    expect(scoreDb.period).toEqual(defaultReq.period);
    expect(scoreDb.score).toEqual(defaultReq.score);
    expect(new Date(scoreDb.time).getTime()).toEqual(defaultReq.time);
  });

  it('saves to mysql table with global period when period empty', async () => {
    const req = Object.assign({}, defaultReq, {
      time: 1550000000000,
      period: undefined,
      score: 23,
    });
    await scoreRepo.updateTraderScore(req);

    const [scoreDb] = await knexTrx.from(tableName)
      .select([
        'traderID',
        'period',
        'score',
        'time',
      ])
      .orderBy('time', 'desc')
      .limit(1);

    expect(scoreDb.traderID).toEqual(req.traderID);
    expect(scoreDb.period).toEqual('global');
    expect(scoreDb.score).toEqual(req.score);
    expect(new Date(scoreDb.time).getTime()).toEqual(req.time);
  });

  it('saves to redis', async () => {
    await scoreRepo.updateTraderScore(defaultReq);
    const score = await redis.zscore('scores-day', 'trader1');
    expect(score).toBe('123.456789');
  });

  it('does not save to redis when not latest score', async () => {
    await scoreRepo.updateTraderScore(defaultReq);

    const req = Object.assign({}, defaultReq, {
      time: 1530000000000,
      score: 23,
    });
    await scoreRepo.updateTraderScore(req);

    const score = await redis.zscore('scores-day', 'trader1');
    expect(score).toBe('123.456789');
  });

  it('updates redis score and does not create new', async () => {
    await scoreRepo.updateTraderScore(defaultReq);

    const req = Object.assign({}, defaultReq, {
      time: 1550000000000,
      score: 23,
    });
    await scoreRepo.updateTraderScore(req);

    const scores = await redis.zrange('scores-day', 0, -1);
    const score = await redis.zscore('scores-day', 'trader1');
    expect(scores).toEqual(['trader1']);
    expect(score).toBe('23');
  });

  it('rolls back', async () => {
    await scoreRepo.updateTraderScore(defaultReq);

    await scoreRepo.knexConn.rollback();
    rolledBack = true;
    expect(await knex(tableName).select()).toHaveLength(0);
  });

  describe('redis rollback', () => {
    it('rollback when previously didn\'t exist', async () => {
      await scoreRepo.updateTraderScore(defaultReq);

      await scoreRepo.knexConn.rollback();
      unitOfWork.emit('rollback');

      await sleep(100);

      const score = await redis.zscore('scores-day', 'trader1');
      expect(score).toBe('0');
    });

    it('rollback decrements score when additional score changes made since execution', async () => {
      await scoreRepo.updateTraderScore(defaultReq);
      await scoreRepo.knexConn.commit();

      await knex.transaction(async (trx1) => {
        const unitOfWork1 = new EventEmitter();
        unitOfWork1.idShort = () => 'test';
        const dup1ScoreRepo = new ScoreRepo({
          knexConn: trx1,
          knex,
          redis,
          unitOfWork: unitOfWork1,
        });
        const req1 = Object.assign({}, defaultReq, { time: 1541000000000, score: 100.456789 });
        await dup1ScoreRepo.updateTraderScore(req1);

        await trx1.commit();
        unitOfWork1.emit('complete');
      });

      try {
        await knex.transaction(async (trx2) => {
          const unitOfWork2 = new EventEmitter();
          unitOfWork2.idShort = () => 'test';
          const dup2ScoreRepo = new ScoreRepo({
            knexConn: trx2,
            knex,
            redis,
            unitOfWork: unitOfWork2,
          });
          const req2 = Object.assign({}, defaultReq, { time: 1542000000000, score: 234 });
          await dup2ScoreRepo.updateTraderScore(req2);

          await dup2ScoreRepo.knexConn.rollback(new Error('test'));
          unitOfWork2.emit('rollback');
        });
      } catch (e) {}

      await sleep(100);

      const score = await redis.zscore('scores-day', 'trader1');
      expect(score).toBe('100.456789');

      expect(await knex(tableName).select()).toHaveLength(2);
    });
  });
});

describe('bulkUpdateTraderScore', () => {
  const defaultReq = [
    {
      traderID: 'trader1',
      score: 123.456789,
      period: 'day',
      time: 1540000000000,
    },
    {
      traderID: 'trader1',
      score: 23,
      period: 'day',
      time: 1550000000000,
    },
    {
      traderID: 'trader1',
      score: 11,
      period: 'day',
      time: 1530000000000,
    },
    {
      traderID: 'trader1',
      score: 10,
      period: 'day',
      time: 1560000000000,
    },
  ];

  it('works', async () => {
    await knexTrx.from(tableName).truncate();
    await redis.flushdb();
    await scoreRepo.bulkUpdateTraderScore(defaultReq);

    const scores = await knexTrx.from(tableName).select([
      'traderID',
      'period',
      'score',
      'time',
    ]);
    expect(scores).toHaveLength(4);

    const score = await redis.zscore('scores-day', 'trader1');
    expect(score).toBe('10');
  });
});

describe('getTopTraders', () => {
  beforeEach(async () => {
    await redis.pipeline()
      .zadd('scores-day', 40, 'trader4')
      .zadd('scores-day', 30, 'trader3')
      .zadd('scores-day', 20, 'trader2')
      .zadd('scores-day', 10, 'trader1')
      .exec();
  });

  it('works', async () => {
    const traders = await scoreRepo.getTopTraders({ period: 'day', limit: 3 });
    return expect(traders).toEqual([
      { traderID: 'trader4' },
      { traderID: 'trader3' },
      { traderID: 'trader2' },
    ]);
  });
});

describe('getTraderRanks', () => {
  beforeEach(async () => {
    await redis.pipeline()
      .zadd('scores-global', 40, 'trader4')
      .zadd('scores-global', 30, 'trader3')
      .zadd('scores-global', 20, 'trader2')
      .zadd('scores-global', 10, 'trader1')
      .exec();
  });

  it('works', async () => {
    const ranks = await scoreRepo.getTraderRanks(['trader1', 'trader3', 'trader2']);
    return expect(ranks).toEqual({
      trader1: 4,
      trader3: 2,
      trader2: 3,
    });
  });

  it('returns null rank when trader doesn\'t exist', async () => {
    const ranks = await scoreRepo.getTraderRanks(['trader1', 'trader3', 'trader2', 'trader5']);
    return expect(ranks).toEqual({
      trader1: 4,
      trader3: 2,
      trader2: 3,
      trader5: null,
    });
  });
});

describe('getTradersScoreHistories', () => {
  beforeEach(async () => {
    await knexTrx.from(tableName).truncate();
    await knexTrx.from(tableName).insert([
      {
        traderID: 'trader1',
        score: 1,
        period: 'day',
        time: msToMySQLFormat(1540000000000),
      },
      {
        traderID: 'trader1',
        score: 2,
        period: 'day',
        time: msToMySQLFormat(1550000000000),
      },
      {
        traderID: 'trader1',
        score: 3,
        period: 'day',
        time: msToMySQLFormat(1560000000000),
      },
      {
        traderID: 'trader2',
        score: 3,
        period: 'day',
        time: msToMySQLFormat(1560000000000),
      },
      {
        traderID: 'trader2',
        score: 4,
        period: 'day',
        time: msToMySQLFormat(1570000000000),
      },
      {
        traderID: 'trader2',
        score: 5,
        period: 'day',
        time: msToMySQLFormat(1580000000000),
      },
    ]);
  });

  it('works', async () => {
    const scoreHistories = await scoreRepo.getTradersScoreHistories([
      {
        traderID: 'trader1',
        period: 'day',
        limit: 2,
        endTime: 1550000000000,
      },
      {
        traderID: 'traderThatDoesNotExist',
        period: 'day',
        limit: 2,
        endTime: 1550000000000,
      },
      {
        traderID: 'trader2',
        period: 'day',
        limit: 2,
        endTime: 1570000000000,
      },
    ]);

    expect(JSON.parse(JSON.stringify(scoreHistories))).toEqual([
      [
        {
          ID: 2,
          traderID: 'trader1',
          period: 'day',
          score: 2,
          time: 1550000000000,
        },
        {
          ID: 1,
          traderID: 'trader1',
          period: 'day',
          score: 1,
          time: 1540000000000,
        },
      ],
      [],
      [
        {
          ID: 5,
          traderID: 'trader2',
          period: 'day',
          score: 4,
          time: 1570000000000,
        },
        {
          ID: 4,
          traderID: 'trader2',
          period: 'day',
          score: 3,
          time: 1560000000000,
        },
      ],
    ]);
  });
});

describe('removeTraderScores', () => {
  it('works', async () => {
    await knexTrx.from(tableName).insert([
      {
        traderID: 'trader1',
        score: 1,
        period: 'day',
        time: msToMySQLFormat(1540000000000),
      },
      {
        traderID: 'trader1',
        score: 2,
        period: 'day',
        time: msToMySQLFormat(1550000000000),
      },
      {
        traderID: 'trader1',
        score: 3,
        period: 'week',
        time: msToMySQLFormat(1560000000000),
      },
      {
        traderID: 'trader2',
        score: 3,
        period: 'day',
        time: msToMySQLFormat(1570000000000),
      },
      {
        traderID: 'trader1',
        score: 4,
        period: 'day',
        time: msToMySQLFormat(1580000000000),
      },
      {
        traderID: 'trader1',
        score: 5,
        period: 'day',
        time: msToMySQLFormat(1590000000000),
      },
    ]);

    await scoreRepo.removeTraderScores({
      traderID: 'trader1',
      period: 'day',
      endTime: 1580000000000,
    });

    const rows = await knexTrx(tableName).select();
    expect(rows).toHaveLength(4);

    expect(rows[0]).toMatchObject({
      traderID: 'trader1',
      score: 3,
      period: 'week',
      time: new Date(new Date(1560000000000).toISOString()),
    });

    expect(rows[1]).toMatchObject({
      traderID: 'trader2',
      score: 3,
      period: 'day',
      time: new Date(new Date(1570000000000).toISOString()),
    });

    expect(rows[2]).toMatchObject({
      traderID: 'trader1',
      score: 4,
      period: 'day',
      time: new Date(new Date(1580000000000).toISOString()),
    });

    expect(rows[3]).toMatchObject({
      traderID: 'trader1',
      score: 5,
      period: 'day',
      time: new Date(new Date(1590000000000).toISOString()),
    });
  });

  it('works with global score', async () => {
    await knexTrx.from(tableName).insert([
      {
        traderID: 'trader1',
        score: 1,
        period: 'global',
        time: msToMySQLFormat(1540000000000),
      },
      {
        traderID: 'trader1',
        score: 2,
        period: 'global',
        time: msToMySQLFormat(1550000000000),
      },
      {
        traderID: 'trader1',
        score: 3,
        period: 'week',
        time: msToMySQLFormat(1560000000000),
      },
      {
        traderID: 'trader2',
        score: 3,
        period: 'global',
        time: msToMySQLFormat(1570000000000),
      },
      {
        traderID: 'trader1',
        score: 4,
        period: 'global',
        time: msToMySQLFormat(1580000000000),
      },
      {
        traderID: 'trader1',
        score: 5,
        period: 'global',
        time: msToMySQLFormat(1590000000000),
      },
    ]);

    await scoreRepo.removeTraderScores({
      traderID: 'trader1',
      endTime: 1580000000000,
    });

    const rows = await knexTrx(tableName).select();
    expect(rows).toHaveLength(4);

    expect(rows[0]).toMatchObject({
      traderID: 'trader1',
      score: 3,
      period: 'week',
      time: new Date(new Date(1560000000000).toISOString()),
    });

    expect(rows[1]).toMatchObject({
      traderID: 'trader2',
      score: 3,
      period: 'global',
      time: new Date(new Date(1570000000000).toISOString()),
    });

    expect(rows[2]).toMatchObject({
      traderID: 'trader1',
      score: 4,
      period: 'global',
      time: new Date(new Date(1580000000000).toISOString()),
    });

    expect(rows[3]).toMatchObject({
      traderID: 'trader1',
      score: 5,
      period: 'global',
      time: new Date(new Date(1590000000000).toISOString()),
    });
  });
});
