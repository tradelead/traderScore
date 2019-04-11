const ScoreService = require('../../../core/services/ScoreService');

module.exports = class ScoreServiceFactory {
  constructor({
    traderScorePeriodConfig,
    traderScoreRepoFactory,
    traderScoreMutex,
    tradeRepoFactory,
    tradeFetchLimit,
  }) {
    this.traderScorePeriodConfig = traderScorePeriodConfig;
    this.traderScoreRepoFactory = traderScoreRepoFactory;
    this.traderScoreMutex = traderScoreMutex;
    this.tradeRepoFactory = tradeRepoFactory;
    this.tradeFetchLimit = tradeFetchLimit;
  }

  create(req) {
    const newReq = Object.assign({}, req);
    newReq.traderScorePeriodConfig = this.traderScorePeriodConfig;
    newReq.traderScoreMutex = this.traderScoreMutex;
    newReq.tradeFetchLimit = this.tradeFetchLimit;
    newReq.traderScoreRepo = this.traderScoreRepoFactory.create(req);
    newReq.tradeRepo = this.tradeRepoFactory.create(req);
    return new ScoreService(newReq);
  }
};
