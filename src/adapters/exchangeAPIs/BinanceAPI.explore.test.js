const binance = require('node-binance-api')().options({
  APIKEY: '<key>',
  APISECRET: '<secret>',
  useServerTime: true, // If you get timestamp errors, synchronize to server time at startup
});

test('get orders', async () => {
  await (new Promise((resolve) => {
    binance.allOrders('BTCUSDT', (error, orders, symbol) => {
      if (error) {
        console.error(error);
      }
      console.log(`${symbol} orders:`, orders);
      resolve();
    });
  }));
});

test('get single order', async () => {
  await (new Promise((resolve) => {
    binance.orderStatus('BTCUSDT', '123', (error, orderStatus, symbol) => {
      console.log(`${symbol}order status:`, orderStatus);
      resolve();
    });
  }));
});
