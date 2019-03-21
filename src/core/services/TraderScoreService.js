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

  async incrementScore({ traderID, score, period }) {
    const mutex = await this.traderScoreMutexFactory.obtain({ traderID, period });

    try {
      const curScore = await this.traderScoreRepo.getTraderScore({ traderID, period });
      const newScore = compoundScore(curScore, score);
      await this.traderScoreRepo.updateTraderScore({ traderID, period, score: newScore });
    } catch (e) {
      throw e;
    } finally {
      mutex.release();
    }
  }

  async incrementScores({ trades }) {
    const promises = [];

    if (!trades || !Array.isArray(trades) || trades.length === 0) {
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
      const compoundTrade = (trade) => {
        score = compoundScore(score, trade.score);
      };

      const startTime = Date.now() - periodConfig.duration;
      const endTime = Date.now();
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

        trades.forEach(compoundTrade);

        offset += this.tradeFetchLimit;
      }

      await this.traderScoreRepo.updateTraderScore({ traderID, period, score });
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

    await Promise.all(promises);
  }
};
