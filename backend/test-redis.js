import { createClient } from 'redis';

const testConnection = async () => {
    const url = 'redis://localhost:6379';
    console.log(`Testing connection to ${url}...`);

    const client = createClient({
        url: url
    });

    client.on('error', (err) => console.error('Redis Client Error', err));

    try {
        await client.connect();
        console.log('Successfully connected to Redis!');
        await client.set('test_key', 'Hello Redis');
        const value = await client.get('test_key');
        console.log(`Retrieved value: ${value}`);
        await client.disconnect();
    } catch (error) {
        console.error('Failed to connect:', error);
    }
};

testConnection();
