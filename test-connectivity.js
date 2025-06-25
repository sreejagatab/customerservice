const { Client } = require('pg');
const redis = require('redis');
const amqp = require('amqplib');

async function testConnectivity() {
    console.log('🔍 Testing infrastructure connectivity...\n');
    
    // Test PostgreSQL
    try {
        const pgClient = new Client({
            host: 'localhost',
            port: 5433,
            database: 'universal_ai_cs',
            user: 'postgres',
            password: 'password'
        });
        
        await pgClient.connect();
        const result = await pgClient.query('SELECT version()');
        console.log('✅ PostgreSQL: Connected successfully');
        console.log(`   Version: ${result.rows[0].version.split(' ')[0]} ${result.rows[0].version.split(' ')[1]}`);
        await pgClient.end();
    } catch (error) {
        console.log('❌ PostgreSQL: Connection failed');
        console.log(`   Error: ${error.message}`);
    }
    
    // Test Redis
    try {
        const redisClient = redis.createClient({
            host: 'localhost',
            port: 6380
        });
        
        await redisClient.connect();
        await redisClient.set('test', 'hello');
        const value = await redisClient.get('test');
        console.log('✅ Redis: Connected successfully');
        console.log(`   Test value: ${value}`);
        await redisClient.del('test');
        await redisClient.quit();
    } catch (error) {
        console.log('❌ Redis: Connection failed');
        console.log(`   Error: ${error.message}`);
    }
    
    // Test RabbitMQ
    try {
        const connection = await amqp.connect('amqp://guest:guest@localhost:5673');
        const channel = await connection.createChannel();
        console.log('✅ RabbitMQ: Connected successfully');
        console.log('   Management UI: http://localhost:15673 (guest/guest)');
        await connection.close();
    } catch (error) {
        console.log('❌ RabbitMQ: Connection failed');
        console.log(`   Error: ${error.message}`);
    }
    
    console.log('\n🎉 Infrastructure connectivity test completed!');
}

testConnectivity().catch(console.error);
