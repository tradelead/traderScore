const msToMySQLFormat = require('./msToMySQLFormat');

module.exports = class ScoreRepo {
  constructor({
    knexConn,
    redis,
    unitOfWork,
  }) {
    this.knexConn = knexConn;
    this.redis = redis;
    this.unitOfWork = unitOfWork;
    this.tableName = 'scores';
  }

  async getTopTraders({ period, limit }) {
    const traderIDs = await this.redis
      .zrevrangebyscore(ScoreRepo.getRedisList(period), '+inf', '-inf', 'LIMIT', '0', limit);

    return traderIDs.map(traderID => ({ traderID }));
  }

  async getTraderRanks(traderIDs) {
    const pipeline = this.redis.pipeline();

    traderIDs.forEach((traderID) => {
      pipeline.zrevrank(ScoreRepo.getRedisList(), traderID);
    });

    const res = await pipeline.exec();
    return res.reduce((acc, [_, rank], index) => {
      acc[traderIDs[index]] = rank + 1;
      return acc;
    }, {});
  }

  async getTradersScoreHistories(reqs) {
    let sqls = reqs.map(({
      traderID,
      startTime,
      endTime,
      limit,
      period,
      sort,
    }) => {
      const filters = {
        traderID,
        period,
      };
      // remove undefined
      Object.keys(filters).forEach(key => filters[key] === undefined && delete filters[key]);

      const query = this.knexConn
        .select()
        .from(this.tableName)
        .where(filters)
        .orderBy('time', sort || 'desc')
        .limit(limit || 10);

      if (startTime > 0) {
        query.andWhere('time', '>=', msToMySQLFormat(startTime));
      }

      if (endTime > 0) {
        query.andWhere('time', '<=', msToMySQLFormat(endTime));
      }

      return query.toString();
    });

    sqls = sqls.map(sql => `(${sql})`);
    const unionAllSQL = sqls.join(' union all ');

    const [rows] = await this.knexConn.raw(unionAllSQL);

    const resp = [];
    reqs.forEach((req) => {
      resp.push(rows.splice(0, req.limit || 10));
    });

    return resp;
  }

  async bulkUpdateTraderScore(updates) {
    const promises = updates.map(update => this.updateTraderScore(update));
    await Promise.all(promises);
  }

  async updateTraderScore({
    traderID,
    score,
    period,
    time,
  }) {
    // add/update score
    const ID = await this.addOrUpdateMySQLScore({
      traderID,
      score,
      period,
      time,
    });

    if (await this.isLatestMySQLScore({ ID, traderID, period })) {
      const curScore = await this.getRedisScore({ traderID, period });
      await this.updateRedisScore({ traderID, period, score });

      this.rollbackListener(() => {
        // rollback redis score
        this.updateRedisScore({
          traderID,
          period,
          score: curScore,
        });
      });
    }
  }

  async addOrUpdateMySQLScore({
    traderID,
    period,
    score,
    time,
  }) {
    const [scoreDb] = await this.knexConn
      .select('ID')
      .from(this.tableName)
      .where({
        traderID,
        period: period || 'global',
        time: msToMySQLFormat(time),
      });

    if (scoreDb && scoreDb.ID > 0) {
      await this.knexConn
        .into(this.tableName)
        .where({ ID: scoreDb.ID })
        .update({ score });

      return scoreDb.ID;
    }

    const [ID] = await this.knexConn
      .insert({
        traderID,
        period: period || 'global',
        score,
        time: msToMySQLFormat(time),
      }, ['ID'])
      .into(this.tableName);

    return ID;
  }

  async isLatestMySQLScore({ ID, traderID, period }) {
    const [latest] = await this.knexConn
      .select('ID')
      .from(this.tableName)
      .where({
        traderID,
        period: period || 'global',
      })
      .orderBy('time', 'desc')
      .limit(1);

    return latest.ID === ID;
  }

  async updateRedisScore({ traderID, period, score }) {
    return this.redis.zadd(ScoreRepo.getRedisList(period), score || 0, traderID);
  }

  async getRedisScore({ traderID, period }) {
    return this.redis.zscore(ScoreRepo.getRedisList(period), traderID);
  }

  static getRedisList(period) {
    const p = period || 'global';
    return `scores-${p}`;
  }

  rollbackListener(listener) {
    if (this.unitOfWork) {
      let rollbackListener;

      const completeListener = () => {
        this.unitOfWork.removeListener('rollback', rollbackListener);
      };

      rollbackListener = () => {
        listener();
        this.unitOfWork.removeListener('complete', completeListener);
      };

      this.unitOfWork.once('complete', completeListener);
      this.unitOfWork.once('rollback', rollbackListener);
    }
  }
};
