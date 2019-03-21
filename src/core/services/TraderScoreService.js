function compoundScore(current, add) {
  return current * ((add / 100) + 1);
}

module.exports = class TraderScoreService {
  constructor({
    traderScorePeriodConfig,
    traderScoreRepo,
    traderScoreMutexFactory,
    tradeRepo,
  }) {
    this.traderScorePeriodConfig = traderScorePeriodConfig;
    this.traderScoreRepo = traderScoreRepo;
    this.traderScoreMutexFactory = traderScoreMutexFactory;
    this.tradeRepo = tradeRepo;
  }

  async incrementScore({ traderID, score, period }) {
    const getReq = { traderID };

    if (typeof period !== 'undefined') {
      getReq.period = period;
    }

    const mutex = await this.traderScoreMutexFactory.obtain({ traderID, period });

    try {
      const curScore = await this.traderScoreRepo.getTraderScore(getReq);
      const newScore = compoundScore(curScore, score);

      const updateReq = { traderID, score: newScore };

      if (typeof period !== 'undefined') {
        updateReq.period = period;
      }

      await this.traderScoreRepo.updateTraderScore(updateReq);
    } catch (e) {
      throw e;
    } finally {
      mutex.release();
    }
  }

  async incrementScores({ trades }) {
    const promises = [];

    if (!trades) {
      throw new Error('Trades invalid');
    }

    trades.forEach((trade) => {
      const { traderID, score } = trade;

      promises.push(this.incrementScore({ traderID, score }));

      const periodPromises = this.traderScorePeriodConfig.map(periodConfig => this.incrementScore({
        traderID,
        score,
        period: periodConfig.id,
      }));

      promises.push(...periodPromises);
    });

    await Promise.all(promises);
  }
};
