const knexFactory = require('knex');
const { EventEmitter } = require('events');
const Redis = require('ioredis');

const knexConfig = require('./knexfile');
const msToMySQLFormat = require('./msToMySQLFormat');
const ScoreRepo = require('./ScoreRepo');

const env = (process.env.NODE_ENV ? process.env.NODE_ENV : 'development');
const knex = knexFactory(knexConfig[env]);
const tableName = 'scores';

const redis = new Redis(process.env.REDIS_URL);
const unitOfWork = new EventEmitter();

const scoreRepo = new ScoreRepo({
  knexConn: knex,
  redis,
  unitOfWork,
});

beforeAll(async () => redis.flushdb());
afterAll(async () => redis.flushdb());

beforeAll(async () => knex(tableName).truncate());
afterAll(async () => knex(tableName).truncate());

describe('updateTraderScore', () => {
  const defaultReq = {
    traderID: 'trader1',
    score: 123.456789,
    period: 'day',
    time: 1540000000000,
  };

  beforeEach(async () => {
    await knex(tableName).truncate();
    await redis.flushdb();
    await scoreRepo.updateTraderScore(defaultReq);
  });

  it('saves to mysql table', async () => {
    const [scoreDb] = await knex(tableName).select([
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
    await knex(tableName).truncate();
    const req = Object.assign({}, defaultReq, {
      time: 1550000000000,
      period: undefined,
      score: 23,
    });
    await scoreRepo.updateTraderScore(req);

    const [scoreDb] = await knex(tableName)
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
    const score = await redis.zscore('scores-day', 'trader1');
    expect(score).toBe('123.456789');
  });

  it('does not save to redis when not latest score', async () => {
    const req = Object.assign({}, defaultReq, {
      time: 1530000000000,
      score: 23,
    });
    await scoreRepo.updateTraderScore(req);

    const score = await redis.zscore('scores-day', 'trader1');
    expect(score).toBe('123.456789');
  });

  it('updates redis score and does not create new', async () => {
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

  describe('redis rollback', () => {
    it('rollback when previously didn\'t exist', async () => {
      unitOfWork.emit('rollback');

      const score = await redis.zscore('scores-day', 'trader1');
      expect(score).toBe('0');
    });

    it('rollback to last score', async () => {
      const unitOfWork2 = new EventEmitter();

      const dupScoreRepo = new ScoreRepo({
        knexConn: knex,
        redis,
        unitOfWork: unitOfWork2,
      });

      const req = Object.assign({}, defaultReq, {
        time: 1541000000000,
        score: 23,
      });
      await dupScoreRepo.updateTraderScore(req);

      unitOfWork2.emit('rollback');

      const score = await redis.zscore('scores-day', 'trader1');
      expect(score).toBe('123.456789');
    });

    it('rollback decrements score when additional score changes made since execution', async () => {
      const unitOfWork1 = new EventEmitter();
      const dup1ScoreRepo = new ScoreRepo({ knexConn: knex, redis, unitOfWork: unitOfWork1 });
      const req1 = Object.assign({}, defaultReq, { time: 1541000000000, score: 100.456789 });
      await dup1ScoreRepo.updateTraderScore(req1);

      const unitOfWork2 = new EventEmitter();
      const dup2ScoreRepo = new ScoreRepo({ knexConn: knex, redis, unitOfWork: unitOfWork2 });
      const req2 = Object.assign({}, defaultReq, { time: 1542000000000, score: 234 });
      await dup2ScoreRepo.updateTraderScore(req2);

      unitOfWork1.emit('rollback');

      const score = await redis.zscore('scores-day', 'trader1');
      expect(score).toBe('211');
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
    await knex(tableName).truncate();
    await redis.flushdb();
    await scoreRepo.bulkUpdateTraderScore(defaultReq);

    const scores = await knex(tableName).select([
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
});

describe('getTradersScoreHistories', () => {
  beforeEach(async () => {
    await knex(tableName).truncate();
    await knex(tableName).insert([
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
          time: '2019-02-12T19:33:20.000Z',
        },
        {
          ID: 1,
          traderID: 'trader1',
          period: 'day',
          score: 1,
          time: '2018-10-20T01:46:40.000Z',
        },
      ],
      [
        {
          ID: 5,
          traderID: 'trader2',
          period: 'day',
          score: 4,
          time: '2019-10-02T07:06:40.000Z',
        },
        {
          ID: 4,
          traderID: 'trader2',
          period: 'day',
          score: 3,
          time: '2019-06-08T13:20:00.000Z',
        },
      ],
    ]);
  });
});
