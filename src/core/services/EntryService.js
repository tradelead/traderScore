const BigNumber = require('bignumber.js');

module.exports = class EntryService {
  constructor({
    orderService,
    transferService,
    exchangeService,
    getEntriesLimitPerFetch,
  }) {
    this.orderService = orderService;
    this.transferService = transferService;
    this.exchangeService = exchangeService;
    this.getEntriesLimitPerFetch = getEntriesLimitPerFetch;
  }

  async getEntries({
    traderID,
    exchangeID,
    asset,
    qty,
    exitTime,
  }) {
    let entriesQty = 0;
    let firstRun = true;
    let ordersLeft = 0;
    let depositsLeft = 0;
    let entriesAcc = [];
    const entriesQueue = [];

    const itemsLeft = () => ordersLeft + depositsLeft > 0;

    do {
      const ordersLeftOld = ordersLeft;
      const depositsLeftOld = depositsLeft;
      let item;

      if (entriesQueue.length > 0) {
        item = entriesQueue.pop();

        const entriesQtyNum = new BigNumber(entriesQty);
        entriesQty = entriesQtyNum.plus(item.quantityUnused).toNumber();
        entriesAcc.push(item);

        if (item.type === 'order') {
          ordersLeft -= 1;
        } else if (item.type === 'deposit') {
          depositsLeft -= 1;
        }
      }

      let type;
      const startTime = (item && item.time > 0 ? item.time + 1 : 0);
      const endTime = exitTime;
      const limit = this.getEntriesLimitPerFetch;
      const addToQueue = (additionalItems) => {
        if (additionalItems && additionalItems.length > 0) {
          const typedAdditionalItems = additionalItems.map(a => Object.assign({}, a, { type }));
          entriesQueue.push(...typedAdditionalItems);
          const descSort = (a, b) => b.time - a.time;
          entriesQueue.sort(descSort);
        }
      };

      if ((ordersLeft === 0 && ordersLeftOld !== 0) || firstRun) {
        type = 'order';
        const additionalItems = await this.orderService.getFilledOrders({
          traderID,
          exchangeID,
          asset,
          limit,
          startTime,
          endTime,
          sort: 'desc',
          unused: true,
        });
        ordersLeft = (additionalItems ? additionalItems.length : 0);
        addToQueue(additionalItems);
      }

      if ((depositsLeft === 0 && depositsLeftOld !== 0) || firstRun) {
        type = 'deposit';
        const additionalItems = await this.transferService.findDeposits({
          traderID,
          exchangeID,
          asset,
          limit,
          startTime,
          endTime,
          sort: 'desc',
          unused: true,
        });
        depositsLeft = (additionalItems ? additionalItems.length : 0);
        addToQueue(additionalItems);
      }

      firstRun = false;
    } while (entriesQty < qty && itemsLeft());

    if (entriesQty < qty) {
      console.log('Insufficient entries', {
        traderID,
        exchangeID,
        asset,
        qty,
        exitTime,
      });

      throw new Error('Insufficient entries');
    }

    entriesAcc = entriesAcc.map(item => Object.assign({}, item, {
      sourceID: item.sourceID,
      sourceType: item.type,
      quantity: item.quantityUnused,
      time: item.time,
      source: item,
    }));

    const entriesQtyNum = new BigNumber(entriesQty);
    const outboundQtyNum = entriesQtyNum.minus(qty);
    const lastEntryQtyNum = new BigNumber(entriesAcc[entriesAcc.length - 1].quantity);

    entriesAcc[entriesAcc.length - 1].quantity = lastEntryQtyNum.minus(outboundQtyNum).toNumber();

    return entriesAcc;
  }

  async getEntryQuoteAsset(entry, exchangeID, asset) {
    if (await this.exchangeService.isRootAsset({ exchangeID, symbol: asset })) {
      return asset;
    }

    if (entry.sourceType === 'order' && entry.source.side === 'buy') {
      return entry.source.quoteAsset;
    }

    if (
      (entry.sourceType === 'order' && entry.source.side === 'sell')
      || entry.sourceType === 'deposit'
    ) {
      return this.exchangeService.findMarketQuoteAsset({
        exchangeID,
        asset,
        preferredQuoteAsset: 'BTC',
      });
    }

    throw new Error('Unexpected entry type');
  }
};
