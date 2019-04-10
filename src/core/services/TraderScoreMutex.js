module.exports = class {
  constructor({ mutex }) {
    this.mutex = mutex;
  }

  async obtain({ traderID, period }) {
    if (!traderID) {
      throw new Error('TraderID is required to obtain mutex');
    }

    const p = period || 'global';

    return this.mutex(`score-${traderID}-${p}`);
  }
};
