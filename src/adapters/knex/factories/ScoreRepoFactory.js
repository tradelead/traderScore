const ScoreRepo = require('../ScoreRepo');

module.exports = class ScoreRepoFactory {
  constructor({ redis }) {
    this.redis = redis;
  }

  create({
    knexConn,
    knex,
    unitOfWork,
  }) {
    return new ScoreRepo({
      knexConn,
      knex,
      redis: this.redis,
      unitOfWork,
    });
  }
};
