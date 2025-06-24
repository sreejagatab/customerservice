const { Pool } = require('pg');

async function testConnection() {
  const pool = new Pool({
    connectionString: 'postgresql://postgres:postgres@localhost:5433/test_db',
    max: 1,
    connectionTimeoutMillis: 5000,
  });

  try {
    console.log('Attempting to connect to database...');
    const client = await pool.connect();
    console.log('Connected successfully!');
    
    const result = await client.query('SELECT current_database(), current_user, version()');
    console.log('Query result:', result.rows[0]);
    
    client.release();
    console.log('Connection released');
  } catch (error) {
    console.error('Connection failed:', error.message);
    console.error('Error details:', error);
  } finally {
    await pool.end();
    console.log('Pool closed');
  }
}

testConnection();
