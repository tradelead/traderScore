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
    tradeRepo: {
      addTrade: sinon.stub(),
      getDailyTradeChangeStdDeviation: sinon.stub(),
      getDailyTradeChangeMean: sinon.stub(),
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
    };

    deps.traderScorePeriodConfig = [
      { id: 'day', duration: 60 * 60 * 24 * 1000 },
      { id: 'week', duration: 60 * 60 * 24 * 7 * 1000 },
    ];

    deps.traderScoreRepo.getTraderScore.resolves(50);

    service = new TraderScoreService(deps);
  });

  it('calls getTraderScore with traderID and period', async () => {
    await service.incrementScore(req);

    const { traderID, period } = req;
    const expectedArgs = { traderID, period };
    sinon.assert.calledWithExactly(deps.traderScoreRepo.getTraderScore, expectedArgs);
  });

  it('updates trader score for period with compounding arithmetic', async () => {
    await service.incrementScore(req);

    const { traderID, period } = req;
    const expectedArgs = { traderID, period, score: 62.5 };
    sinon.assert.calledWithExactly(deps.traderScoreRepo.updateTraderScore, expectedArgs);
  });

  it('calls getTraderScore with traderID and no period', async () => {
    delete req.period;
    await service.incrementScore(req);

    const { traderID } = req;
    const expectedArgs = { traderID };
    sinon.assert.calledWithExactly(deps.traderScoreRepo.getTraderScore, expectedArgs);
  });

  it('updates global trader score when no period with compounding arithmetic', async () => {
    delete req.period;
    await service.incrementScore(req);

    const { traderID } = req;
    const expectedArgs = { traderID, score: 62.5 };
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
