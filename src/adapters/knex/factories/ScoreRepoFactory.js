const ScoreRepo = require('../ScoreRepo');

module.exports = class ScoreRepoFactory {
  create({
    knexConn,
    knex,
    redis,
    unitOfWork,
  }) {
    return new ScoreRepo({
      knexConn,
      knex,
      redis,
      unitOfWork,
    });
  }
};
