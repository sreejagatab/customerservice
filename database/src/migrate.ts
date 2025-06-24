#!/usr/bin/env ts-node

import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') });

interface Migration {
  id: number;
  name: string;
  filename: string;
  sql: string;
  checksum: string;
}

class MigrationRunner {
  private pool: Pool;
  private migrationsDir: string;

  constructor() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    });
    this.migrationsDir = path.join(__dirname, '../migrations');
  }

  async init(): Promise<void> {
    // Create migrations table if it doesn't exist
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        version VARCHAR(255) NOT NULL UNIQUE,
        name VARCHAR(255) NOT NULL,
        checksum VARCHAR(255) NOT NULL,
        executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
  }

  async getExecutedMigrations(): Promise<string[]> {
    const result = await this.pool.query(
      'SELECT version FROM schema_migrations ORDER BY version'
    );
    return result.rows.map(row => row.version);
  }

  async getPendingMigrations(): Promise<Migration[]> {
    const executedMigrations = await this.getExecutedMigrations();
    const allMigrations = this.getAllMigrations();
    
    return allMigrations.filter(migration => 
      !executedMigrations.includes(migration.name)
    );
  }

  getAllMigrations(): Migration[] {
    if (!fs.existsSync(this.migrationsDir)) {
      fs.mkdirSync(this.migrationsDir, { recursive: true });
      return [];
    }

    const files = fs.readdirSync(this.migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort();

    return files.map((file, index) => {
      const filePath = path.join(this.migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');
      const checksum = this.generateChecksum(sql);
      
      return {
        id: index + 1,
        name: file.replace('.sql', ''),
        filename: file,
        sql,
        checksum,
      };
    });
  }

  private generateChecksum(content: string): string {
    const crypto = require('crypto');
    return crypto.createHash('md5').update(content).digest('hex');
  }

  async executeMigration(migration: Migration): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      console.log(`Executing migration: ${migration.name}`);
      await client.query(migration.sql);
      
      await client.query(
        'INSERT INTO schema_migrations (version, name, checksum) VALUES ($1, $2, $3)',
        [migration.name, migration.name, migration.checksum]
      );
      
      await client.query('COMMIT');
      console.log(`✓ Migration ${migration.name} executed successfully`);
    } catch (error) {
      await client.query('ROLLBACK');
      console.error(`✗ Migration ${migration.name} failed:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  async rollbackMigration(version: string): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Check if rollback file exists
      const rollbackFile = path.join(this.migrationsDir, `${version}_rollback.sql`);
      if (!fs.existsSync(rollbackFile)) {
        throw new Error(`Rollback file not found: ${rollbackFile}`);
      }
      
      const rollbackSql = fs.readFileSync(rollbackFile, 'utf8');
      
      console.log(`Rolling back migration: ${version}`);
      await client.query(rollbackSql);
      
      await client.query(
        'DELETE FROM schema_migrations WHERE version = $1',
        [version]
      );
      
      await client.query('COMMIT');
      console.log(`✓ Migration ${version} rolled back successfully`);
    } catch (error) {
      await client.query('ROLLBACK');
      console.error(`✗ Rollback ${version} failed:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  async migrateUp(): Promise<void> {
    await this.init();
    const pendingMigrations = await this.getPendingMigrations();
    
    if (pendingMigrations.length === 0) {
      console.log('No pending migrations');
      return;
    }
    
    console.log(`Found ${pendingMigrations.length} pending migrations`);
    
    for (const migration of pendingMigrations) {
      await this.executeMigration(migration);
    }
    
    console.log('All migrations completed successfully');
  }

  async migrateDown(): Promise<void> {
    const executedMigrations = await this.getExecutedMigrations();
    
    if (executedMigrations.length === 0) {
      console.log('No migrations to rollback');
      return;
    }
    
    const lastMigration = executedMigrations[executedMigrations.length - 1];
    await this.rollbackMigration(lastMigration);
  }

  async getStatus(): Promise<void> {
    await this.init();
    const executedMigrations = await this.getExecutedMigrations();
    const allMigrations = this.getAllMigrations();
    
    console.log('\nMigration Status:');
    console.log('================');
    
    for (const migration of allMigrations) {
      const status = executedMigrations.includes(migration.name) ? '✓' : '✗';
      console.log(`${status} ${migration.name}`);
    }
    
    const pendingCount = allMigrations.length - executedMigrations.length;
    console.log(`\nExecuted: ${executedMigrations.length}`);
    console.log(`Pending: ${pendingCount}`);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

// CLI interface
async function main() {
  const command = process.argv[2] || 'up';
  const runner = new MigrationRunner();
  
  try {
    switch (command) {
      case 'up':
      case 'latest':
        await runner.migrateUp();
        break;
      case 'down':
      case 'rollback':
        await runner.migrateDown();
        break;
      case 'status':
        await runner.getStatus();
        break;
      default:
        console.log('Usage: npm run migrate [up|down|status]');
        console.log('  up/latest  - Run all pending migrations');
        console.log('  down/rollback - Rollback the last migration');
        console.log('  status     - Show migration status');
        process.exit(1);
    }
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await runner.close();
  }
}

if (require.main === module) {
  main();
}

export { MigrationRunner };
