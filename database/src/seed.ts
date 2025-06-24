#!/usr/bin/env ts-node

import * as fs from 'fs';
import * as path from 'path';
import { db } from './connection';

interface Seed {
  id: number;
  name: string;
  filename: string;
  sql: string;
}

class SeedRunner {
  private seedsDir: string;

  constructor() {
    this.seedsDir = path.join(__dirname, '../seeds');
  }

  async init(): Promise<void> {
    // Create seeds tracking table if it doesn't exist
    await db.query(`
      CREATE TABLE IF NOT EXISTS seed_history (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
  }

  async getExecutedSeeds(): Promise<string[]> {
    const result = await db.query(
      'SELECT name FROM seed_history ORDER BY executed_at'
    );
    return result.rows.map(row => row.name);
  }

  async getPendingSeeds(): Promise<Seed[]> {
    const executedSeeds = await this.getExecutedSeeds();
    const allSeeds = this.getAllSeeds();
    
    return allSeeds.filter(seed => 
      !executedSeeds.includes(seed.name)
    );
  }

  getAllSeeds(): Seed[] {
    if (!fs.existsSync(this.seedsDir)) {
      fs.mkdirSync(this.seedsDir, { recursive: true });
      return [];
    }

    const files = fs.readdirSync(this.seedsDir)
      .filter(file => file.endsWith('.sql'))
      .sort();

    return files.map((file, index) => {
      const filePath = path.join(this.seedsDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');
      
      return {
        id: index + 1,
        name: file.replace('.sql', ''),
        filename: file,
        sql,
      };
    });
  }

  async executeSeed(seed: Seed): Promise<void> {
    try {
      console.log(`Executing seed: ${seed.name}`);
      
      await db.transaction(async (client) => {
        await client.query(seed.sql);
        await client.query(
          'INSERT INTO seed_history (name) VALUES ($1) ON CONFLICT (name) DO NOTHING',
          [seed.name]
        );
      });
      
      console.log(`✓ Seed ${seed.name} executed successfully`);
    } catch (error) {
      console.error(`✗ Seed ${seed.name} failed:`, error);
      throw error;
    }
  }

  async runSeeds(): Promise<void> {
    await this.init();
    const pendingSeeds = await this.getPendingSeeds();
    
    if (pendingSeeds.length === 0) {
      console.log('No pending seeds');
      return;
    }
    
    console.log(`Found ${pendingSeeds.length} pending seeds`);
    
    for (const seed of pendingSeeds) {
      await this.executeSeed(seed);
    }
    
    console.log('All seeds completed successfully');
  }

  async getStatus(): Promise<void> {
    await this.init();
    const executedSeeds = await this.getExecutedSeeds();
    const allSeeds = this.getAllSeeds();
    
    console.log('\nSeed Status:');
    console.log('============');
    
    for (const seed of allSeeds) {
      const status = executedSeeds.includes(seed.name) ? '✓' : '✗';
      console.log(`${status} ${seed.name}`);
    }
    
    const pendingCount = allSeeds.length - executedSeeds.length;
    console.log(`\nExecuted: ${executedSeeds.length}`);
    console.log(`Pending: ${pendingCount}`);
  }

  async createSeed(name: string): Promise<void> {
    const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const seedName = `${timestamp}_${name.toLowerCase().replace(/\s+/g, '_')}`;
    const filename = `${seedName}.sql`;
    const filepath = path.join(this.seedsDir, filename);

    const template = `-- Seed: ${seedName}
-- Description: ${name}
-- Created: ${new Date().toISOString().slice(0, 10)}

-- Insert your seed data here
-- Example:
-- INSERT INTO table_name (column1, column2) VALUES ('value1', 'value2');
`;

    if (!fs.existsSync(this.seedsDir)) {
      fs.mkdirSync(this.seedsDir, { recursive: true });
    }

    fs.writeFileSync(filepath, template);
    console.log(`Created seed file: ${filename}`);
  }
}

// CLI interface
async function main() {
  const command = process.argv[2] || 'run';
  const runner = new SeedRunner();
  
  try {
    switch (command) {
      case 'run':
        await runner.runSeeds();
        break;
      case 'status':
        await runner.getStatus();
        break;
      case 'make':
        const seedName = process.argv[3];
        if (!seedName) {
          console.error('Please provide a seed name: npm run seed:make "Seed Name"');
          process.exit(1);
        }
        await runner.createSeed(seedName);
        break;
      default:
        console.log('Usage: npm run seed [run|status|make]');
        console.log('  run    - Execute all pending seeds');
        console.log('  status - Show seed execution status');
        console.log('  make   - Create a new seed file');
        process.exit(1);
    }
  } catch (error) {
    console.error('Seed operation failed:', error);
    process.exit(1);
  } finally {
    await db.close();
  }
}

if (require.main === module) {
  main();
}

export { SeedRunner };
