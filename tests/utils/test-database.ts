import { Pool, PoolClient } from 'pg';
import { execSync } from 'child_process';

export class TestDatabase {
  private pool: Pool | null = null;
  private client: PoolClient | null = null;

  async setup(): Promise<void> {
    const databaseUrl = process.env.TEST_DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('TEST_DATABASE_URL environment variable is required');
    }

    this.pool = new Pool({
      connectionString: databaseUrl,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });

    // Test connection
    this.client = await this.pool.connect();
    await this.client.query('SELECT 1');
    
    console.log('✅ Test database connected');
  }

  async cleanup(): Promise<void> {
    if (this.client) {
      this.client.release();
      this.client = null;
    }

    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }

    console.log('✅ Test database disconnected');
  }

  async reset(): Promise<void> {
    if (!this.pool) {
      throw new Error('Database not initialized');
    }

    // Truncate all tables except migrations
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      
      // Get all table names except system tables and migrations
      const result = await client.query(`
        SELECT tablename 
        FROM pg_tables 
        WHERE schemaname = 'public' 
        AND tablename NOT IN ('schema_migrations', 'seed_history')
      `);

      // Truncate all tables
      for (const row of result.rows) {
        await client.query(`TRUNCATE TABLE "${row.tablename}" RESTART IDENTITY CASCADE`);
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async query(text: string, params?: any[]): Promise<any> {
    if (!this.pool) {
      throw new Error('Database not initialized');
    }

    return this.pool.query(text, params);
  }

  async transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    if (!this.pool) {
      throw new Error('Database not initialized');
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async createTestUser(userData: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    role?: string;
    organizationId?: string;
  }): Promise<any> {
    const {
      email,
      password,
      firstName,
      lastName,
      role = 'agent',
      organizationId,
    } = userData;

    // Hash password (simplified for tests)
    const bcrypt = require('bcrypt');
    const passwordHash = await bcrypt.hash(password, 10);

    let orgId = organizationId;
    if (!orgId) {
      // Create test organization
      const orgResult = await this.query(`
        INSERT INTO organizations (name, slug, plan, status)
        VALUES ($1, $2, $3, $4)
        RETURNING id
      `, ['Test Organization', 'test-org', 'professional', 'active']);
      orgId = orgResult.rows[0].id;
    }

    // Create user
    const userResult = await this.query(`
      INSERT INTO users (
        organization_id, email, password_hash, first_name, last_name, 
        role, status, email_verified
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [orgId, email, passwordHash, firstName, lastName, role, 'active', true]);

    return {
      user: userResult.rows[0],
      organizationId: orgId,
    };
  }

  async createTestConversation(data: {
    organizationId: string;
    integrationId?: string;
    customerEmail: string;
    subject?: string;
    status?: string;
  }): Promise<any> {
    const {
      organizationId,
      integrationId,
      customerEmail,
      subject = 'Test Conversation',
      status = 'open',
    } = data;

    let intId = integrationId;
    if (!intId) {
      // Create test integration
      const intResult = await this.query(`
        INSERT INTO integrations (organization_id, name, type, provider, status)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id
      `, [organizationId, 'Test Integration', 'email', 'test', 'active']);
      intId = intResult.rows[0].id;
    }

    const result = await this.query(`
      INSERT INTO conversations (
        organization_id, integration_id, customer_email, subject, status
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [organizationId, intId, customerEmail, subject, status]);

    return result.rows[0];
  }

  async createTestMessage(data: {
    conversationId: string;
    direction: 'inbound' | 'outbound';
    content: any;
    sender: any;
    status?: string;
  }): Promise<any> {
    const {
      conversationId,
      direction,
      content,
      sender,
      status = 'received',
    } = data;

    const result = await this.query(`
      INSERT INTO messages (
        conversation_id, direction, content, sender, status
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [conversationId, direction, JSON.stringify(content), JSON.stringify(sender), status]);

    return result.rows[0];
  }

  getPool(): Pool {
    if (!this.pool) {
      throw new Error('Database not initialized');
    }
    return this.pool;
  }
}
