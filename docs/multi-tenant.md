# 🏗️ Multi-Tenant Guide

Complete guide for multi-tenant architecture implementation and management.

## 📋 Overview

The Universal AI Customer Service Platform is built with multi-tenancy at its core, providing secure isolation between organizations while maintaining operational efficiency.

## 🏛️ Multi-Tenant Architecture

### Tenancy Models

#### 1. Database-Level Isolation (Recommended)
```
┌─────────────────────────────────────────────────────────────┐
│                    Application Layer                        │
├─────────────────────────────────────────────────────────────┤
│                   Tenant Router                             │
├─────────────┬─────────────┬─────────────┬─────────────────┤
│ Tenant A    │ Tenant B    │ Tenant C    │ Tenant D        │
│ Database    │ Database    │ Database    │ Database        │
└─────────────┴─────────────┴─────────────┴─────────────────┘
```

#### 2. Schema-Level Isolation
```
┌─────────────────────────────────────────────────────────────┐
│                    Shared Database                          │
├─────────────┬─────────────┬─────────────┬─────────────────┤
│ tenant_a    │ tenant_b    │ tenant_c    │ tenant_d        │
│ schema      │ schema      │ schema      │ schema          │
└─────────────┴─────────────┴─────────────┴─────────────────┘
```

#### 3. Row-Level Security (RLS)
```
┌─────────────────────────────────────────────────────────────┐
│                    Shared Database                          │
│                    Shared Schema                            │
├─────────────────────────────────────────────────────────────┤
│ tenant_id | data | created_at | ...                        │
│ tenant_a  | ...  | ...        | ...                        │
│ tenant_b  | ...  | ...        | ...                        │
│ tenant_c  | ...  | ...        | ...                        │
└─────────────────────────────────────────────────────────────┘
```

## 🔧 Implementation

### Tenant Context Management

#### Tenant Middleware
```typescript
import { Request, Response, NextFunction } from 'express';

export interface TenantContext {
  tenantId: string;
  organizationId: string;
  plan: 'free' | 'professional' | 'enterprise';
  features: string[];
  quotas: {
    maxUsers: number;
    maxMessages: number;
    maxStorage: number;
  };
}

export const tenantMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Extract tenant ID from various sources
    const tenantId = extractTenantId(req);
    
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: 'Tenant ID is required',
      });
    }
    
    // Load tenant context
    const tenantContext = await loadTenantContext(tenantId);
    
    if (!tenantContext) {
      return res.status(404).json({
        success: false,
        error: 'Tenant not found',
      });
    }
    
    // Attach to request
    req.tenant = tenantContext;
    
    // Set database context
    await setDatabaseContext(tenantId);
    
    next();
  } catch (error) {
    logger.error('Tenant middleware error', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
};

function extractTenantId(req: Request): string | null {
  // 1. From subdomain (preferred)
  const subdomain = req.hostname.split('.')[0];
  if (subdomain && subdomain !== 'www' && subdomain !== 'api') {
    return subdomain;
  }
  
  // 2. From header
  const headerTenantId = req.headers['x-tenant-id'] as string;
  if (headerTenantId) {
    return headerTenantId;
  }
  
  // 3. From JWT token
  if (req.user?.tenantId) {
    return req.user.tenantId;
  }
  
  // 4. From query parameter (development only)
  if (process.env.NODE_ENV === 'development' && req.query.tenant) {
    return req.query.tenant as string;
  }
  
  return null;
}
```

### Database Isolation

#### Database-Level Isolation
```typescript
export class TenantDatabaseManager {
  private connectionPools: Map<string, Pool> = new Map();
  
  async getConnection(tenantId: string): Promise<Pool> {
    if (!this.connectionPools.has(tenantId)) {
      const pool = new Pool({
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT || '5432'),
        database: `tenant_${tenantId}`,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      });
      
      this.connectionPools.set(tenantId, pool);
    }
    
    return this.connectionPools.get(tenantId)!;
  }
  
  async createTenantDatabase(tenantId: string): Promise<void> {
    const adminPool = new Pool({
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '5432'),
      database: 'postgres',
      user: process.env.DB_ADMIN_USER,
      password: process.env.DB_ADMIN_PASSWORD,
    });
    
    try {
      // Create database
      await adminPool.query(`CREATE DATABASE tenant_${tenantId}`);
      
      // Run migrations
      await this.runMigrations(tenantId);
      
      // Seed initial data
      await this.seedTenantData(tenantId);
      
      logger.info('Tenant database created', { tenantId });
    } finally {
      await adminPool.end();
    }
  }
  
  private async runMigrations(tenantId: string): Promise<void> {
    const pool = await this.getConnection(tenantId);
    
    // Run all migration files
    const migrationFiles = await fs.readdir('./migrations');
    
    for (const file of migrationFiles.sort()) {
      const migration = await fs.readFile(`./migrations/${file}`, 'utf8');
      await pool.query(migration);
    }
  }
}
```

#### Row-Level Security Implementation
```sql
-- Enable RLS on all tenant tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY tenant_isolation_users ON users
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_conversations ON conversations
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_messages ON messages
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

-- Function to set tenant context
CREATE OR REPLACE FUNCTION set_tenant_context(tenant_uuid uuid)
RETURNS void AS $$
BEGIN
  PERFORM set_config('app.current_tenant', tenant_uuid::text, true);
END;
$$ LANGUAGE plpgsql;
```

```typescript
// Set tenant context for each request
export const setDatabaseContext = async (tenantId: string): Promise<void> => {
  await db.query('SELECT set_tenant_context($1)', [tenantId]);
};
```

### Tenant Onboarding

#### Tenant Provisioning Service
```typescript
export class TenantProvisioningService {
  async createTenant(tenantData: {
    name: string;
    subdomain: string;
    plan: string;
    adminUser: {
      email: string;
      name: string;
      password: string;
    };
  }): Promise<string> {
    const tenantId = uuidv4();
    
    try {
      // 1. Create tenant record
      await this.createTenantRecord(tenantId, tenantData);
      
      // 2. Provision database
      await this.provisionDatabase(tenantId);
      
      // 3. Create admin user
      await this.createAdminUser(tenantId, tenantData.adminUser);
      
      // 4. Setup default configuration
      await this.setupDefaultConfiguration(tenantId, tenantData.plan);
      
      // 5. Send welcome email
      await this.sendWelcomeEmail(tenantData.adminUser.email, tenantData.subdomain);
      
      logger.info('Tenant created successfully', { tenantId, subdomain: tenantData.subdomain });
      
      return tenantId;
    } catch (error) {
      // Rollback on error
      await this.rollbackTenantCreation(tenantId);
      throw error;
    }
  }
  
  private async createTenantRecord(tenantId: string, tenantData: any): Promise<void> {
    await db.query(`
      INSERT INTO tenants (id, name, subdomain, plan, status, created_at)
      VALUES ($1, $2, $3, $4, 'active', NOW())
    `, [tenantId, tenantData.name, tenantData.subdomain, tenantData.plan]);
  }
  
  private async setupDefaultConfiguration(tenantId: string, plan: string): Promise<void> {
    const planConfig = this.getPlanConfiguration(plan);
    
    await db.query(`
      INSERT INTO tenant_configurations (tenant_id, max_users, max_messages, max_storage, features)
      VALUES ($1, $2, $3, $4, $5)
    `, [
      tenantId,
      planConfig.maxUsers,
      planConfig.maxMessages,
      planConfig.maxStorage,
      JSON.stringify(planConfig.features),
    ]);
  }
}
```

### Tenant Configuration Management

#### Feature Flags
```typescript
export class TenantFeatureManager {
  async isFeatureEnabled(tenantId: string, feature: string): Promise<boolean> {
    const tenant = await this.getTenantContext(tenantId);
    return tenant.features.includes(feature);
  }
  
  async enableFeature(tenantId: string, feature: string): Promise<void> {
    await db.query(`
      UPDATE tenant_configurations 
      SET features = features || $2
      WHERE tenant_id = $1
    `, [tenantId, JSON.stringify([feature])]);
  }
  
  async disableFeature(tenantId: string, feature: string): Promise<void> {
    await db.query(`
      UPDATE tenant_configurations 
      SET features = features - $2
      WHERE tenant_id = $1
    `, [tenantId, feature]);
  }
}

// Feature flag middleware
export const requireFeature = (feature: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const featureManager = new TenantFeatureManager();
    const isEnabled = await featureManager.isFeatureEnabled(req.tenant.tenantId, feature);
    
    if (!isEnabled) {
      return res.status(403).json({
        success: false,
        error: `Feature '${feature}' is not available for your plan`,
      });
    }
    
    next();
  };
};
```

### Quota Management

#### Quota Enforcement
```typescript
export class QuotaManager {
  async checkQuota(tenantId: string, resource: string, amount: number = 1): Promise<boolean> {
    const usage = await this.getCurrentUsage(tenantId, resource);
    const limit = await this.getQuotaLimit(tenantId, resource);
    
    return (usage + amount) <= limit;
  }
  
  async enforceQuota(tenantId: string, resource: string, amount: number = 1): Promise<void> {
    const canProceed = await this.checkQuota(tenantId, resource, amount);
    
    if (!canProceed) {
      throw new QuotaExceededError(`Quota exceeded for ${resource}`);
    }
    
    await this.incrementUsage(tenantId, resource, amount);
  }
  
  private async getCurrentUsage(tenantId: string, resource: string): Promise<number> {
    const result = await db.query(`
      SELECT usage FROM tenant_usage 
      WHERE tenant_id = $1 AND resource = $2 AND period = date_trunc('month', NOW())
    `, [tenantId, resource]);
    
    return result.rows[0]?.usage || 0;
  }
  
  private async incrementUsage(tenantId: string, resource: string, amount: number): Promise<void> {
    await db.query(`
      INSERT INTO tenant_usage (tenant_id, resource, period, usage)
      VALUES ($1, $2, date_trunc('month', NOW()), $3)
      ON CONFLICT (tenant_id, resource, period)
      DO UPDATE SET usage = tenant_usage.usage + $3
    `, [tenantId, resource, amount]);
  }
}

// Quota middleware
export const enforceQuota = (resource: string, amount: number = 1) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const quotaManager = new QuotaManager();
      await quotaManager.enforceQuota(req.tenant.tenantId, resource, amount);
      next();
    } catch (error) {
      if (error instanceof QuotaExceededError) {
        return res.status(429).json({
          success: false,
          error: error.message,
          code: 'QUOTA_EXCEEDED',
        });
      }
      throw error;
    }
  };
};
```

## 🎨 White-Label Customization

### Branding Management
```typescript
export interface TenantBranding {
  tenantId: string;
  logo: string;
  primaryColor: string;
  secondaryColor: string;
  customDomain?: string;
  customCSS?: string;
  emailTemplates: {
    welcome: string;
    passwordReset: string;
    notification: string;
  };
}

export class BrandingService {
  async getTenantBranding(tenantId: string): Promise<TenantBranding> {
    const result = await db.query(`
      SELECT * FROM tenant_branding WHERE tenant_id = $1
    `, [tenantId]);
    
    return result.rows[0] || this.getDefaultBranding();
  }
  
  async updateBranding(tenantId: string, branding: Partial<TenantBranding>): Promise<void> {
    await db.query(`
      INSERT INTO tenant_branding (tenant_id, logo, primary_color, secondary_color, custom_domain, custom_css, email_templates)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (tenant_id)
      DO UPDATE SET
        logo = COALESCE($2, tenant_branding.logo),
        primary_color = COALESCE($3, tenant_branding.primary_color),
        secondary_color = COALESCE($4, tenant_branding.secondary_color),
        custom_domain = COALESCE($5, tenant_branding.custom_domain),
        custom_css = COALESCE($6, tenant_branding.custom_css),
        email_templates = COALESCE($7, tenant_branding.email_templates)
    `, [
      tenantId,
      branding.logo,
      branding.primaryColor,
      branding.secondaryColor,
      branding.customDomain,
      branding.customCSS,
      JSON.stringify(branding.emailTemplates),
    ]);
  }
}
```

### Custom Domain Support
```typescript
export class CustomDomainService {
  async setupCustomDomain(tenantId: string, domain: string): Promise<void> {
    // 1. Validate domain ownership
    await this.validateDomainOwnership(domain);
    
    // 2. Generate SSL certificate
    await this.generateSSLCertificate(domain);
    
    // 3. Update DNS configuration
    await this.updateDNSConfiguration(domain, tenantId);
    
    // 4. Update tenant configuration
    await this.updateTenantDomain(tenantId, domain);
    
    logger.info('Custom domain setup completed', { tenantId, domain });
  }
  
  private async validateDomainOwnership(domain: string): Promise<void> {
    const verificationToken = uuidv4();
    
    // Store verification token
    await db.query(`
      INSERT INTO domain_verifications (domain, token, expires_at)
      VALUES ($1, $2, NOW() + INTERVAL '24 hours')
    `, [domain, verificationToken]);
    
    // Check for TXT record
    const txtRecords = await dns.resolveTxt(domain);
    const isVerified = txtRecords.some(record => 
      record.includes(`universal-ai-cs-verification=${verificationToken}`)
    );
    
    if (!isVerified) {
      throw new Error('Domain ownership verification failed');
    }
  }
}
```

## 📊 Tenant Analytics

### Usage Analytics
```typescript
export class TenantAnalyticsService {
  async getTenantUsageReport(tenantId: string, period: 'day' | 'week' | 'month'): Promise<UsageReport> {
    const timeframe = this.getTimeframe(period);
    
    const [users, conversations, messages, storage] = await Promise.all([
      this.getUserCount(tenantId, timeframe),
      this.getConversationCount(tenantId, timeframe),
      this.getMessageCount(tenantId, timeframe),
      this.getStorageUsage(tenantId),
    ]);
    
    return {
      period,
      timeframe,
      usage: {
        users,
        conversations,
        messages,
        storage,
      },
      quotas: await this.getQuotas(tenantId),
      trends: await this.getUsageTrends(tenantId, period),
    };
  }
  
  async generateBillingReport(tenantId: string, month: string): Promise<BillingReport> {
    const usage = await this.getMonthlyUsage(tenantId, month);
    const plan = await this.getTenantPlan(tenantId);
    
    return {
      tenantId,
      month,
      plan,
      usage,
      costs: this.calculateCosts(usage, plan),
      overages: this.calculateOverages(usage, plan),
    };
  }
}
```

## 🔒 Security Considerations

### Tenant Isolation Security
- Database-level isolation prevents data leakage
- Row-level security as additional protection
- Encrypted tenant-specific data
- Audit logging for all tenant operations

### Access Control
- Tenant-scoped authentication
- Role-based permissions within tenants
- API key isolation per tenant
- Cross-tenant access prevention

## 📚 Best Practices

### Performance Optimization
- Connection pooling per tenant
- Caching tenant configuration
- Lazy loading of tenant data
- Database query optimization

### Monitoring
- Tenant-specific metrics
- Usage tracking and alerting
- Performance monitoring per tenant
- Cost allocation and reporting

### Maintenance
- Automated tenant provisioning
- Bulk operations across tenants
- Tenant lifecycle management
- Data retention policies

## 📖 Additional Resources

- [Database Design Patterns](./database-patterns.md)
- [Security Guide](./security.md)
- [Performance Optimization](./performance.md)
- [Monitoring Guide](./monitoring.md)

For multi-tenancy support, contact our architecture team at architecture@universalai-cs.com
