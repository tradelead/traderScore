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
      const otherScores = await this.traderScoreRepo.getTradersScoreHistories({
        traderID,
        period,
        startTime: time,
        limit: 1,
      });

      if (Array.isArray(otherScores) && otherScores.length > 0) {
        throw new Error('Must be most recent score to increment');
      }

      const [curScore] = await this.traderScoreRepo.getTradersScoreHistories({
        traderID,
        period,
        endTime: time,
        limit: 1,
      });

      const newScore = compoundScore(curScore.score, score);

      await this.traderScoreRepo.updateTraderScore({
        traderID,
        period,
        time,
        score: newScore,
      });
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
