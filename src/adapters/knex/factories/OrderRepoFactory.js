const OrderRepo = require('../OrderRepo');

module.exports = class OrderRepoFactory {
  create({ knexConn }) {
    return new OrderRepo({ knexConn });
  }
};
