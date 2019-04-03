const BigNumber = require('bignumber.js');
const msToMySQLFormat = require('./msToMySQLFormat');

module.exports = class PortfolioRepo {
  constructor({ knexConn }) {
    this.knexConn = knexConn;
    this.tableName = 'portfolio';
    this.assetsTableName = 'portfolioAssets';
  }

  async incr({
    traderID,
    exchangeID,
    asset,
    quantity,
    time,
  }) {
    const [assetObj] = await this.knexConn
      .select('ID')
      .from(this.assetsTableName)
      .where({
        traderID,
        exchangeID,
        asset,
      });

    let traderExchangeAssetID;

    if (assetObj) {
      traderExchangeAssetID = assetObj.ID;
    }

    if (!traderExchangeAssetID) {
      [traderExchangeAssetID] = await this.knexConn.insert({
        traderID,
        exchangeID,
        asset,
      }, ['ID']).into(this.assetsTableName);
    }

    const [lastItem] = await this.knexConn
      .select('quantity')
      .from(this.tableName)
      .where({ traderExchangeAssetID })
      .andWhere('time', '<=', msToMySQLFormat(time))
      .orderBy('time', 'desc')
      .limit(1);

    const lastQty = (lastItem && lastItem.quantity ? lastItem.quantity : 0);
    const qtyNum = new BigNumber(quantity);
    const newQty = qtyNum.plus(lastQty).toNumber();

    const portfolioObj = {
      traderExchangeAssetID,
      quantity: newQty,
      time: msToMySQLFormat(time),
    };
    const [newID] = await this.knexConn.insert(portfolioObj, ['ID']).into(this.tableName);

    const futureItems = await this.knexConn
      .select('ID', 'quantity')
      .from(this.tableName)
      .where({ traderExchangeAssetID })
      .andWhere('time', '>=', msToMySQLFormat(time))
      .andWhereNot({ ID: newID })
      .orderBy('time', 'desc');

    const updateProms = futureItems.map((item) => {
      const oldQty = new BigNumber(item.quantity);
      const qty = oldQty.plus(quantity).toNumber();

      return this.knexConn
        .into(this.tableName)
        .where('ID', item.ID)
        .update('quantity', qty);
    });

    await Promise.all(updateProms);
  }

  async decr({
    traderID,
    exchangeID,
    asset,
    quantity,
    time,
  }) {
    const [assetObj] = await this.knexConn
      .select('ID')
      .from(this.assetsTableName)
      .where({
        traderID,
        exchangeID,
        asset,
      });

    if (!assetObj) {
      throw new Error('cannot decr: trader doesn\'t own asset');
    }

    const traderExchangeAssetID = assetObj.ID;

    const [lastItem] = await this.knexConn
      .select('quantity')
      .from(this.tableName)
      .where({ traderExchangeAssetID })
      .andWhere('time', '<=', msToMySQLFormat(time))
      .orderBy('time', 'desc')
      .limit(1);

    const lastQty = (lastItem && lastItem.quantity ? lastItem.quantity : 0);
    const lastQtyNum = new BigNumber(lastQty);
    const newQty = lastQtyNum.minus(quantity).toNumber();
    if (newQty < 0) {
      throw new Error('cannot decr: insufficient asset quantity');
    }

    const portfolioObj = {
      traderExchangeAssetID,
      quantity: newQty,
      time: msToMySQLFormat(time),
    };

    const [newID] = await this.knexConn.insert(portfolioObj, ['ID']).into(this.tableName);

    const futureItems = await this.knexConn
      .select('ID', 'quantity')
      .from(this.tableName)
      .where({ traderExchangeAssetID })
      .andWhere('time', '>=', msToMySQLFormat(time))
      .andWhereNot({ ID: newID })
      .orderBy('time', 'desc');

    const updateProms = futureItems.map((item) => {
      const oldQty = new BigNumber(item.quantity);
      const qty = oldQty.minus(quantity).toNumber();

      return this.knexConn
        .into(this.tableName)
        .where('ID', item.ID)
        .update('quantity', qty);
    });

    await Promise.all(updateProms);
  }

  async snapshot({
    traderID,
    time,
  }) {
    const assets = await this.knexConn
      .select('ID', 'traderID', 'exchangeID', 'asset')
      .from(this.assetsTableName)
      .where({ traderID });

    if (assets.length === 0) {
      return [];
    }

    let assetQuantitiesSQLs = await assets.map(asset => this.knexConn
      .select('traderExchangeAssetID', 'quantity')
      .from(this.tableName)
      .where({ traderExchangeAssetID: asset.ID })
      .andWhere('time', '<=', msToMySQLFormat(time))
      .orderBy('time', 'desc')
      .limit(1)
      .toString());

    assetQuantitiesSQLs = assetQuantitiesSQLs.map(assetSQL => `(${assetSQL})`);
    const assetQuantitiesSQL = assetQuantitiesSQLs.join(' union all ');

    let [assetQuantities] = await this.knexConn.raw(assetQuantitiesSQL);

    assetQuantities = assetQuantities.reduce((acc, assetQuantity) => {
      const ID = assetQuantity.traderExchangeAssetID;
      acc[ID] = assetQuantity.quantity;
      return acc;
    }, {});

    return assets.map((asset) => {
      const quantity = assetQuantities[asset.ID];
      return Object.assign({}, asset, { quantity });
    });
  }
};
