const msToMySQLFormat = require('./msToMySQLFormat');

module.exports = class {
  constructor({ knexConn }) {
    this.knexConn = knexConn;
    this.tableName = 'scoreUpdateSchedule';
  }

  async schedule({ traderID, period, time }) {
    const obj = { traderID, period, time: msToMySQLFormat(time) };

    return this.knexConn
      .insert(obj, ['ID'])
      .into(this.tableName);
  }

  async fetchDue() {
    let items = await this.knexConn
      .select()
      .from(this.tableName)
      .where('time', '<=', msToMySQLFormat(Date.now()))
      .limit(10000);

    items = items.map(item => Object.assign(item, { time: new Date(item.time).getTime() }));

    return items;
  }

  async complete(items) {
    const IDs = items.map(item => item.ID);
    await this.knexConn
      .from(this.tableName)
      .whereIn('ID', IDs)
      .del();
  }
};
