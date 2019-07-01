const config = {
  client: 'mysql',
  connection: {
    port: process.env.DATABASE_PORT,
    host: process.env.DATABASE_HOST,
    database: process.env.DATABASE_NAME,
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    timezone: 'utc',
  },
  pool: {
    min: parseInt(process.env.DATABASE_POOL_MIN, 10),
    max: parseInt(process.env.DATABASE_POOL_MAX, 10),
  },
  migrations: {
    directory: './migrations',
    tableName: 'knex_migrations',
  },
  seeds: {
    directory: './seeds',
  },
};

const testConn = {
  port: process.env.TEST_DATABASE_PORT,
  host: process.env.TEST_DATABASE_HOST,
  database: process.env.TEST_DATABASE_NAME,
  user: process.env.TEST_DATABASE_USER,
  password: process.env.TEST_DATABASE_PASSWORD,
  timezone: 'utc',
};

module.exports = {
  development: config,
  test: Object.assign({}, config, { idleTimeoutMillis: 500, connection: testConn }),
  production: config,
};
