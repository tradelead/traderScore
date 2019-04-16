const VError = require('verror');
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
    const traderExchangeAssetID = await this.createAssetIfNotExists({
      traderID,
      exchangeID,
      asset,
    });

    await this.insertItem({ traderExchangeAssetID, time }, (item) => {
      const lastQty = (item && item.quantity ? item.quantity : 0);
      const qtyNum = new BigNumber(quantity);

      return qtyNum.plus(lastQty).toNumber();
    });
  }

  async decr({
    traderID,
    exchangeID,
    asset,
    quantity,
    time,
  }) {
    const assetObj = await this.getAsset({ traderID, exchangeID, asset });

    if (!assetObj) {
      const info = {
        traderID,
        exchangeID,
        asset,
        quantity,
        time,
      };
      throw new VError({ info }, 'cannot decr: trader doesn\'t own asset');
    }

    const traderExchangeAssetID = assetObj.ID;

    await this.insertItem({ traderExchangeAssetID, time }, (item) => {
      const lastQty = (item && item.quantity ? item.quantity : 0);
      const lastQtyNum = new BigNumber(lastQty);
      const newQty = lastQtyNum.minus(quantity).toNumber();
      if (newQty < 0) {
        throw new Error('cannot decr: insufficient asset quantity');
      }

      return newQty;
    });
  }

  async snapshot({
    traderID,
    time,
  }) {
    const assets = await this.getAssets({ traderID });

    if (assets.length === 0) {
      return [];
    }

    const assetQuantities = await this.getAssetQuantities({ assets, time });

    return assets.map((asset) => {
      const quantity = assetQuantities[asset.ID];
      return Object.assign({}, asset, { quantity });
    });
  }

  async getAssets({ traderID }) {
    return this.knexConn
      .select('ID', 'traderID', 'exchangeID', 'asset')
      .from(this.assetsTableName)
      .where({ traderID });
  }

  async getAssetQuantities({ assets, time }) {
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

    return assetQuantities;
  }

  async getAsset({ traderID, exchangeID, asset }) {
    const [assetObj] = await this.knexConn
      .select()
      .from(this.assetsTableName)
      .where({
        traderID,
        exchangeID,
        asset,
      });

    return assetObj;
  }

  async createAssetIfNotExists({ traderID, exchangeID, asset }) {
    const assetObj = await this.getAsset({ traderID, exchangeID, asset });

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

    return traderExchangeAssetID;
  }

  async insertItem({ traderExchangeAssetID, time }, quantityModifier) {
    const [lastItem] = await this.knexConn
      .select('ID', 'quantity')
      .from(this.tableName)
      .where({ traderExchangeAssetID })
      .andWhere('time', '<=', msToMySQLFormat(time))
      .orderBy('time', 'desc')
      .limit(1);

    const newQty = quantityModifier(lastItem);

    const [newID] = await this.knexConn.insert({
      traderExchangeAssetID,
      quantity: newQty,
      time: msToMySQLFormat(time),
    }, ['ID']).into(this.tableName);

    const futureItems = await this.knexConn
      .select('ID', 'quantity')
      .from(this.tableName)
      .where({ traderExchangeAssetID })
      .andWhere('time', '>=', msToMySQLFormat(time))
      .andWhereNot({ ID: newID })
      .orderBy('time', 'desc');

    const updateProms = futureItems.map((item) => {
      const qty = quantityModifier(item);

      return this.knexConn
        .into(this.tableName)
        .where('ID', item.ID)
        .update('quantity', qty);
    });

    await Promise.all(updateProms);
  }
};
