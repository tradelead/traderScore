const sinon = require('sinon');
const TraderScoreService = require('./TraderScoreService');

let deps;
let mutex;

beforeEach(() => {
  // reset deps for each test
  deps = {
    traderScorePeriodConfig: [
      { id: 'day', duration: 60 * 60 * 24 * 1000 },
      { id: 'week', duration: 60 * 60 * 24 * 7 * 1000 },
    ],
    tradeFetchLimit: 1000,
    tradeRepo: {
      getTrades: sinon.stub(),
    },
    traderScoreRepo: {
      getTraderScore: sinon.stub(),
      updateTraderScore: sinon.stub(),
    },
    traderScoreMutexFactory: {
      obtain: sinon.stub(),
    },
  };

  mutex = { release: sinon.stub() };
  deps.traderScoreMutexFactory.obtain.resolves(mutex);
});

describe('incrementScore', () => {
  let service;
  let req;

  beforeEach(() => {
    req = {
      traderID: 'trader123',
      score: 25,
      period: 'day',
      time: 123,
    };

    deps.traderScorePeriodConfig = [
      { id: 'day', duration: 60 * 60 * 24 * 1000 },
      { id: 'week', duration: 60 * 60 * 24 * 7 * 1000 },
    ];

    deps.traderScoreRepo.getTraderScore.resolves(50);

    service = new TraderScoreService(deps);
  });

  it('calls getTraderScore with traderID & period', async () => {
    await service.incrementScore(req);

    const { traderID, period } = req;
    const expectedArgs = { traderID, period };
    sinon.assert.calledWithExactly(deps.traderScoreRepo.getTraderScore, expectedArgs);
  });

  it('updates trader score for period with compounding arithmetic', async () => {
    await service.incrementScore(req);

    const { traderID, period, time } = req;
    const expectedArgs = {
      traderID,
      period,
      time,
      score: 62.5,
    };
    sinon.assert.calledWithExactly(deps.traderScoreRepo.updateTraderScore, expectedArgs);
  });

  it('calls getTraderScore with traderID and no period', async () => {
    delete req.period;
    await service.incrementScore(req);

    const { traderID, period } = req;
    const expectedArgs = { traderID, period };
    sinon.assert.calledWithExactly(deps.traderScoreRepo.getTraderScore, expectedArgs);
  });

  it('updates global trader score when no period with compounding arithmetic', async () => {
    delete req.period;
    await service.incrementScore(req);

    const { traderID, period, time } = req;
    const expectedArgs = {
      traderID,
      period,
      time,
      score: 62.5,
    };
    sinon.assert.calledWithExactly(deps.traderScoreRepo.updateTraderScore, expectedArgs);
  });

  it('rejects with error from getTraderScore', async () => {
    deps.traderScoreRepo.getTraderScore.rejects();
    expect(service.incrementScore(req)).rejects.toThrow();
  });

  it('rejects with error from updateTraderScore', async () => {
    deps.traderScoreRepo.updateTraderScore.rejects();
    expect(service.incrementScore(req)).rejects.toThrow();
  });

  it('obtains mutex with traderID and period', async () => {
    await service.incrementScore(req);

    const { traderID, period } = req;
    sinon.assert.calledWithExactly(deps.traderScoreMutexFactory.obtain, { traderID, period });
  });

  it('releases mutex', async () => {
    await service.incrementScore(req);
    sinon.assert.called(mutex.release);
  });

  it('releases mutex getTraderScore errors', async () => {
    deps.traderScoreRepo.getTraderScore.rejects();

    // eslint-disable-next-line no-empty
    try { await service.incrementScore(req); } catch (e) {}

    sinon.assert.called(mutex.release);
  });

  it('releases mutex updateTraderScore errors', async () => {
    deps.traderScoreRepo.updateTraderScore.rejects();

    // eslint-disable-next-line no-empty
    try { await service.incrementScore(req); } catch (e) {}

    sinon.assert.called(mutex.release);
  });
});

describe('incrementScores', () => {
  let service;
  const req = {
    trades: [
      { traderID: '123', score: 25 },
      { traderID: '123', score: 28 },
    ],
  };

  beforeEach(() => {
    deps.traderScorePeriodConfig = [
      { id: 'day', duration: 60 * 60 * 24 * 1000 },
      { id: 'week', duration: 60 * 60 * 24 * 7 * 1000 },
    ];

    deps.traderScoreRepo.getTraderScore.resolves(50);

    service = new TraderScoreService(deps);

    sinon.stub(service, 'incrementScore');
  });

  it('calls incrementScore correct number of time', async () => {
    await service.incrementScores(req);

    const expectedCount = (deps.traderScorePeriodConfig.length + 1) * req.trades.length;
    sinon.assert.callCount(service.incrementScore, expectedCount);
  });

  it('calls incrementScore for each period', async () => {
    await service.incrementScores(req);

    req.trades.forEach((trade) => {
      deps.traderScorePeriodConfig.forEach((periodConfig) => {
        const expectedArgs = {
          traderID: trade.traderID,
          score: trade.score,
          period: periodConfig.id,
        };
        sinon.assert.calledWithExactly(service.incrementScore, expectedArgs);
      });

      const expectedArgs = {
        traderID: trade.traderID,
        score: trade.score,
      };
      sinon.assert.calledWithExactly(service.incrementScore, expectedArgs);
    });
  });

  it('calls incrementScore once without period foreach trade', async () => {
    await service.incrementScores(req);

    req.trades.forEach((trade) => {
      const expectedArgs = {
        traderID: trade.traderID,
        score: trade.score,
      };
      sinon.assert.calledWithExactly(service.incrementScore, expectedArgs);
    });
  });

  it('rejects with error if incrementScore throws error', async () => {
    service.incrementScore.rejects();
    return expect(service.incrementScores(req)).rejects.toThrow();
  });
});

describe('calculateScore', () => {
  let service;
  let req;

  const tradesData = [
    { traderID: '123', score: 25, exit: { time: 123 } },
    { traderID: '123', score: 28, exit: { time: 234 } },
  ];

  beforeEach(() => {
    req = {
      traderID: 'trader123',
      period: 'day',
    };

    deps.tradeFetchLimit = 1;

    let tradesIndex = 0;
    const getNextTrades = async () => {
      const trades = tradesData.slice(tradesIndex, tradesIndex + deps.tradeFetchLimit);
      tradesIndex += deps.tradeFetchLimit;
      return trades;
    };
    deps.tradeRepo.getTrades.callsFake(getNextTrades);

    service = new TraderScoreService(deps);
  });

  it('compound increments scores from tradeRepo.getTrades when more than fetch limit', async () => {
    const score = await service.calculateScore(req);

    expect(score).toBe(1.6);
  });

  test('offsets second call to tradeRepo.getTrades', async () => {
    await service.calculateScore(req);

    const offset = deps.tradeFetchLimit;
    sinon.assert.calledWithMatch(deps.tradeRepo.getTrades.getCall(1), { offset });
  });

  it('calls tradeRepo.getTrades with traderID', async () => {
    await service.calculateScore(req);

    const { traderID } = req;
    sinon.assert.calledWithMatch(deps.tradeRepo.getTrades, { traderID });
  });

  it('calls tradeRepo.getTrades with period', async () => {
    await service.calculateScore(req);

    const { period } = req;
    sinon.assert.calledWithMatch(deps.tradeRepo.getTrades, { period });
  });

  it('calls tradeRepo.getTrades with startTime as Date.now subtracted by period duration', async () => {
    const curTime = Date.now();
    Date.now = jest.fn(() => curTime);

    await service.calculateScore(req);

    const { period } = req;
    const periodConfig = deps.traderScorePeriodConfig.filter(cfg => cfg.id === period)[0];
    const startTime = Date.now() - periodConfig.duration;

    sinon.assert.calledWithMatch(deps.tradeRepo.getTrades, { startTime });
  });

  it('calls tradeRepo.getTrades with the same endTime from the start', async () => {
    // force Date.now() to change every time it's called
    const curTime = Date.now();
    let nowIndex = 0;
    Date.now = jest.fn(() => {
      const time = curTime + nowIndex;
      nowIndex += 1;
      return time;
    });

    await service.calculateScore(req);

    const { endTime } = deps.tradeRepo.getTrades.getCall(0).args[0];
    sinon.assert.alwaysCalledWithMatch(deps.tradeRepo.getTrades, { endTime });
  });

  it('calls tradeRepo.getTrades with the same startTime from the start', async () => {
    // force Date.now() to change every time it's called
    const curTime = Date.now();
    let nowIndex = 0;
    Date.now = jest.fn(() => {
      const time = curTime + nowIndex;
      nowIndex += 1;
      return time;
    });

    await service.calculateScore(req);

    const { startTime } = deps.tradeRepo.getTrades.getCall(0).args[0];
    sinon.assert.alwaysCalledWithMatch(deps.tradeRepo.getTrades, { startTime });
  });

  it('rejects when tradeRepo.getTrades throws error', async () => {
    deps.tradeRepo.getTrades.rejects();

    return expect(service.calculateScore(req)).rejects.toThrow();
  });

  it('calls traderScoreRepo.updateTraderScore with new score, traderID, period', async () => {
    const score = await service.calculateScore(req);

    const { traderID, period } = req;
    sinon.assert.calledWith(deps.traderScoreRepo.updateTraderScore, { traderID, period, score });
  });

  it('rejects when traderScoreRepo.updateTraderScore throws error', async () => {
    deps.traderScoreRepo.updateTraderScore.rejects();

    return expect(service.calculateScore(req)).rejects.toThrow();
  });

  it('obtains mutex with traderID and period', async () => {
    await service.calculateScore(req);
    const { traderID, period } = req;
    sinon.assert.calledWithExactly(deps.traderScoreMutexFactory.obtain, { traderID, period });
  });

  it('releases mutex', async () => {
    await service.calculateScore(req);
    sinon.assert.called(mutex.release);
  });

  it('releases mutex when tradeRepo.getTrades throws error', async () => {
    deps.tradeRepo.getTrades.rejects();

    // eslint-disable-next-line no-empty
    try { await service.calculateScore(req); } catch (e) {}

    sinon.assert.called(mutex.release);
  });

  it('releases mutex when traderScoreRepo.updateTraderScore throws error', async () => {
    deps.traderScoreRepo.updateTraderScore.rejects();

    // eslint-disable-next-line no-empty
    try { await service.calculateScore(req); } catch (e) {}

    sinon.assert.called(mutex.release);
  });

  it('throws error when period doesn\'t exist', async () => {
    req.period = 'test';
    return expect(service.calculateScore(req)).rejects.toThrow('Period doesn\'t exist');
  });

  it('success when calculating global score', async () => {
    delete req.period;
    return expect(service.calculateScore(req)).resolves.toBeDefined();
  });
});

describe('calculateScores', () => {
  let service;

  const req = {
    traderID: '123',
  };

  beforeEach(() => {
    deps.traderScorePeriodConfig = [
      { id: 'day', duration: 60 * 60 * 24 * 1000 },
      { id: 'week', duration: 60 * 60 * 24 * 7 * 1000 },
    ];

    service = new TraderScoreService(deps);

    sinon.stub(service, 'calculateScore');
  });

  it('calls calculateScore for each period', async () => {
    await service.calculateScores(req);

    deps.traderScorePeriodConfig.forEach((periodConfig) => {
      const expectedArgs = {
        traderID: req.traderID,
        period: periodConfig.id,
      };
      sinon.assert.calledWith(service.calculateScore, expectedArgs);
    });
  });

  it('rejects with error if calculateScore throws error', async () => {
    service.calculateScore.rejects();
    return expect(service.calculateScores(req)).rejects.toThrow();
  });
});
