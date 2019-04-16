require('dotenv').config({ path: require.resolve('./.env') });
const flushDBs = require('./flushDBs');

beforeAll(async () => {
  await flushDBs();
});

afterAll(async () => {
  await flushDBs();
});
