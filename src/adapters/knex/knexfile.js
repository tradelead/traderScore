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
    min: parseInt(process.env.DATABASE_POOL_MIN),
    max: parseInt(process.env.DATABASE_POOL_MAX),
  },
  migrations: {
    directory: './migrations',
    tableName: 'knex_migrations',
  },
  seeds: {
    directory: './seeds',
  },
};

module.exports = {
  development: config,
  test: Object.assign({}, config, { idleTimeoutMillis: 500 }),
  production: config,
};
