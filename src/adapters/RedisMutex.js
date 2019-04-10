const Warlock = require('node-redis-warlock');

module.exports = ({
  redis,
  ttl,
  maxAttempts,
  wait,
}) => {
  const warlock = Warlock(redis);

  return key => new Promise((resolve, reject) => {
    warlock.optimistic(
      key,
      ttl || 10000,
      maxAttempts || 10,
      wait || 100,
      (err, unlock) => {
        if (err) {
          reject(err);
        } else {
          resolve({ release: unlock });
        }
      },
    );
  });
};
