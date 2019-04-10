const Redis = require('ioredis');
const RedisMutex = require('./RedisMutex');

const redis = new Redis(process.env.REDIS_URL);

let mutex;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

beforeEach(() => {
  mutex = RedisMutex({ redis });
});

afterAll(async () => {
  redis.disconnect();
});

it('works', async () => {
  const arr = [];

  const lockA = await mutex('test');

  const promB = (async () => {
    const lockB = await mutex('test');
    for (let i = 0; i < 5; i++) {
      arr.push(`b-${i}`);
    }
    lockB.release();
  })();

  await sleep(200);

  const promA = (async () => {
    for (let i = 0; i < 5; i++) {
      arr.push(`a-${i}`);
    }
    lockA.release();
  })();

  await promA;
  await promB;

  expect(arr).toEqual(['a-0', 'a-1', 'a-2', 'a-3', 'a-4', 'b-0', 'b-1', 'b-2', 'b-3', 'b-4']);
});
