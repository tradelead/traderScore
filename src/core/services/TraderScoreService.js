function compoundScore(current, add) {
  return current * ((add / 100) + 1);
}

module.exports = class TraderScoreService {
  constructor({
    traderScorePeriodConfig,
    traderScoreRepo,
    traderScoreMutexFactory,
    tradeRepo,
    tradeFetchLimit,
  }) {
    this.traderScorePeriodConfig = traderScorePeriodConfig;
    this.traderScoreRepo = traderScoreRepo;
    this.traderScoreMutexFactory = traderScoreMutexFactory;
    this.tradeRepo = tradeRepo;
    this.tradeFetchLimit = tradeFetchLimit;
  }

  async incrementScore({
    traderID,
    period,
    score,
    time,
  }) {
    const mutex = await this.traderScoreMutexFactory.obtain({ traderID, period });

    try {
      const curScores = await this.traderScoreRepo.getTradersScoreHistories([{
        traderID,
        period,
        endTime: time,
        limit: 1,
        sort: 'desc',
      }]);

      let curScore = 1;
      if (curScores && curScores[0] && Array.isArray(curScores[0])) {
        curScore = curScores[0][0].score;
      }

      const newScore = compoundScore(curScore, score);

      const futureScores = await this.traderScoreRepo.getTradersScoreHistories([{
        traderID,
        period,
        startTime: time,
        sort: 'asc',
      }]);

      const updatedScores = [{
        traderID,
        period,
        time,
        score: newScore,
      }];

      if (Array.isArray(futureScores) && Array.isArray(futureScores[0])) {
        futureScores[0].forEach((futureScore, i) => {
          const lastScore = (i === 0 ? curScore : futureScores[0][i - 1].score);

          const multiplier = futureScore.score / lastScore;
          const recalculatedScore = multiplier * updatedScores[i].score;
          updatedScores.push({
            traderID,
            period,
            time: futureScore.time,
            score: recalculatedScore,
          });
        });
      }

      await this.traderScoreRepo.bulkUpdateTraderScore(updatedScores);
    } catch (e) {
      throw e;
    } finally {
      mutex.release();
    }
  }

  async incrementScores({ traderID, score, time }) {
    const promises = [];

    promises.push(this.incrementScore({ traderID, score, time }));

    const periodPromises = this.traderScorePeriodConfig.map(periodConfig => this.incrementScore({
      traderID,
      score,
      time,
      period: periodConfig.id,
    }));

    promises.push(...periodPromises);

    await Promise.all(promises);
  }

  async calculateScore({ traderID, period }) {
    let score = 1;
    let offset = 0;
    let periodConfig;

    if (period) {
      [periodConfig] = this.traderScorePeriodConfig.filter(cfg => cfg.id === period);

      if (!periodConfig) {
        throw new Error('Period doesn\'t exist');
      }
    } else {
      periodConfig = { duration: 0 };
    }

    const mutex = await this.traderScoreMutexFactory.obtain({ traderID, period });

    try {
      const startTime = Date.now() - periodConfig.duration;
      const endTime = Date.now();

      const calcBulkUpdateScores = (trade) => {
        score = compoundScore(score, trade.score);
        return {
          traderID,
          period,
          score,
          time: trade.exit.time,
        };
      };

      for (; ;) {
        const trades = await this.tradeRepo.getTrades({
          traderID,
          period,
          offset,
          startTime,
          endTime,
        });

        if (!trades || !Array.isArray(trades) || trades.length === 0) {
          break;
        }

        const traderScores = trades.map(calcBulkUpdateScores);

        await this.traderScoreRepo.bulkUpdateTraderScore(traderScores);

        offset += this.tradeFetchLimit;
      }

      return score;
    } catch (e) {
      throw e;
    } finally {
      mutex.release();
    }
  }

  async calculateScores({ traderID }) {
    const promises = this.traderScorePeriodConfig.map(async (periodConfig) => {
      const period = periodConfig.id;
      await this.calculateScore({ traderID, period });
    });

    promises.push(this.calculateScore({ traderID }));

    await Promise.all(promises);
  }
};
