const debug = require('debug')('traderScore:ScoreRepo');
const msToMySQLFormat = require('./msToMySQLFormat');

function dateFromDay(year, day) {
  return new Date(Date.UTC(year, 0, day));
}

function dateFromWeek(y, w) {
  // return date at beginning of week. (Sunday) like MYSQL WEEK() datetime function
  const firstDateOfYear = new Date(Date.UTC(y, 0, 1));
  const d = (1 + (w * 7)) - firstDateOfYear.getUTCDay();

  return dateFromDay(y, d);
}

module.exports = class ScoreRepo {
  constructor({
    knexConn,
    knex,
    redis,
    unitOfWork,
  }) {
    this.knexConn = knexConn;
    this.knex = knex;
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
      if (rank != null) {
        acc[traderIDs[index]] = rank + 1;
      } else {
        acc[traderIDs[index]] = null;
      }
      return acc;
    }, {});
  }

  async getTradersScoreHistories(reqs) {
    let sqls = reqs.map(({
      traderID,
      startTime,
      endTime,
      duration,
      limit,
      period,
      groupBy,
      sort,
    }) => {
      const filters = {
        traderID,
        period: period || 'global',
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
      } else if (duration > 0) {
        query.andWhere('time', '>=', msToMySQLFormat(Date.now() - duration));
      }

      if (endTime > 0) {
        query.andWhere('time', '<=', msToMySQLFormat(endTime));
      }

      const sortWithDefault = sort || 'desc';
      if (groupBy === 'day') {
        query
          .select(
            'traderID',
            'period',
            this.knexConn.raw('AVG(score) as score'),
            this.knexConn.raw('YEAR(time) as year'),
            this.knexConn.raw('DAYOFYEAR(time) as dayOfYear'),
          )
          .groupByRaw('YEAR(time), DAYOFYEAR(time), traderID, period')
          .clearOrder()
          .orderByRaw(`YEAR(time), DAYOFYEAR(time) ${sortWithDefault}`);
      } else if (groupBy === 'week') {
        query
          .select(
            'traderID',
            'period',
            this.knexConn.raw('AVG(score) as score'),
            this.knexConn.raw('YEAR(time) as year'),
            this.knexConn.raw('WEEK(time) as weekOfYear'),
          )
          .groupByRaw('YEAR(time), WEEK(time), traderID, period')
          .clearOrder()
          .orderByRaw(`YEAR(time), WEEK(time) ${sortWithDefault}`);
      }

      return query.toString();
    });

    sqls = sqls.map(sql => `(${sql})`);
    const unionAllSQL = sqls.join(' union all ');

    const [rows] = await this.knexConn.raw(unionAllSQL);
    const traderRows = rows.reduce((acc, row) => {
      acc[row.traderID] = acc[row.traderID] || [];
      acc[row.traderID].push(row);
      return acc;
    }, {});

    const resp = [];
    reqs.forEach((req) => {
      const items = traderRows[req.traderID] || [];

      const itemsWithTime = items.map((item) => {
        let time;
        if (item.dayOfYear) {
          time = dateFromDay(item.year, item.dayOfYear).getTime();
        } else if (item.weekOfYear) {
          time = dateFromWeek(item.year, item.weekOfYear).getTime();
        } else {
          time = new Date(item.time).getTime();
        }

        const newItem = Object.assign(
          {},
          item,
          { time },
        );

        delete newItem.year;
        delete newItem.dayOfYear;
        delete newItem.weekOfYear;

        return newItem;
      });

      resp.push(itemsWithTime);
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
      await this.updateRedisScore({ traderID, period, score });

      this.rollbackListener(async () => {
        try {
          // knexConn was terminated by transaction, use knex connection pool.
          this.knexConn = this.knex;
          const latest = await this.latestMySQLScore({ traderID, period });

          // rollback redis score
          await this.updateRedisScore({
            traderID,
            period,
            score: latest,
          });
        } catch (e) {
          console.error('error rolling back redis', e);
        }
      });
    }
  }

  async removeTraderScores({ traderID, period, endTime }) {
    if (!traderID) {
      throw new Error('Trader ID is required.');
    }

    if (endTime == null) {
      throw new Error('End Time is required.');
    }

    await this.knexConn(this.tableName)
      .where({ traderID, period: period || 'global' })
      .andWhere('time', '<', msToMySQLFormat(endTime))
      .del();
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

  async latestMySQLScore({ traderID, period }) {
    const [latest] = await this.knexConn
      .select('score')
      .from(this.tableName)
      .where({
        traderID,
        period: period || 'global',
      })
      .orderBy('time', 'desc')
      .limit(1);

    if (latest) {
      return latest.score;
    }

    return 0;
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

  static getRedisList(period) {
    const p = period || 'global';
    return `scores-${p}`;
  }

  initRedisCommands() {
    // define lua command
    // 1. gets current score
    // 2. update score
    // 3. subtract old score from new score and return
    const luaScript = `
      local precisionMultiplier = math.pow(10, 8)
      local pastScore = redis.call("zscore", KEYS[1], ARGV[2])
      redis.call("zadd", KEYS[1], ARGV[1], ARGV[2])
      if pastScore == false then
        return ARGV[1] * precisionMultiplier
      else
        return (ARGV[1] * precisionMultiplier) - (pastScore * precisionMultiplier)
      end
    `;

    this.redis.defineCommand('zaddgetdiff', {
      numberOfKeys: 1,
      lua: luaScript,
    });
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

      debug(`add uow listeners ${this.unitOfWork.idShort()}`);
      this.unitOfWork.once('complete', completeListener);
      this.unitOfWork.once('rollback', rollbackListener);
    }
  }
};
