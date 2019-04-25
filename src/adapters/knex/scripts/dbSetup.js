const util = require('util');
const mysql = require('mysql');

const requiredEnvVars = [
  'DATABASE_HOST',
  'DATABASE_PORT',
  'DATABASE_MASTER_USER',
  'DATABASE_MASTER_PASS',
  'DATABASE_NAME',
  'DATABASE_USER',
  'DATABASE_PASSWORD',
];

requiredEnvVars.forEach((envVar) => {
  if (!process.env[envVar]) {
    throw new Error(`'${envVar}' environment variable is required.`);
  }
});

const mysqlConfig = {
  host: process.env.DATABASE_HOST,
  port: parseInt(process.env.DATABASE_PORT, 10),
  user: process.env.DATABASE_MASTER_USER,
  password: process.env.DATABASE_MASTER_PASS,
};
const connection = mysql.createConnection(mysqlConfig);
const connect = util.promisify(connection.connect).bind(connection);
const query = util.promisify(connection.query).bind(connection);


(async () => {
  try {
    await connect();
    await query(`CREATE DATABASE IF NOT EXISTS ${process.env.DATABASE_NAME}`);

    const results = await query(`SELECT EXISTS(SELECT 1 FROM mysql.user WHERE user = '${process.env.DATABASE_USER}') as userExists`);

    if (!results[0] || !results[0].userExists) {
      await query(`CREATE USER '${process.env.DATABASE_USER}'@'%'`);
      await query(`
      GRANT ALL PRIVILEGES ON ${process.env.DATABASE_NAME}.* To '${process.env.DATABASE_USER}'@'%' 
      IDENTIFIED BY '${process.env.DATABASE_PASSWORD}'
      `);
    }

    console.log('DB AND USER CREATED IF NOT EXISTS');
  } catch (e) {
    console.error(e);
  } finally {
    connection.end();
  }
})();
