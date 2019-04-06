module.exports = class ExchangeIngressRepo {
  constructor({ knexConn }) {
    this.knexConn = knexConn;
    this.tableName = 'exchangeIngress';
  }

  async markComplete({ traderID, exchangeID }) {
    await this.knexConn
      .insert({ traderID, exchangeID })
      .into(this.tableName);
  }

  async isComplete({ traderID, exchangeID }) {
    const items = await this.knexConn
      .select()
      .from(this.tableName)
      .where({ traderID, exchangeID })
      .limit(1);

    return items.length === 1;
  }
};
