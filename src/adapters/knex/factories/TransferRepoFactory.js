const TransferRepo = require('../TransferRepo');

module.exports = class TransferRepoFactory {
  create({ knexConn }) {
    return new TransferRepo({ knexConn });
  }
};
