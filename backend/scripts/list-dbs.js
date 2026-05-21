
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';

async function listDbs() {
    let connection;
    try {
        connection = await mysql.createConnection({
            host: DB_HOST, user: DB_USER, password: DB_PASSWORD
        });
        const [rows] = await connection.query("SHOW DATABASES LIKE 'sku%';");
        console.log('Found Databases:');
        rows.forEach(row => {
            // Get the first value of the object regardless of key name
            console.log(`- ${Object.values(row)[0]}`);
        });
    } catch (e) {
        console.error(e);
    } finally {
        if (connection) await connection.end();
    }
}
listDbs();
