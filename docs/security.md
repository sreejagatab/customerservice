# 🔒 Security Guide

Comprehensive security implementation details for the Universal AI Customer Service Platform.

## 📋 Overview

Security is a fundamental aspect of our platform, implementing defense-in-depth strategies across all layers. This guide covers security measures, best practices, and compliance requirements.

## 🛡️ Security Architecture

### Multi-Layer Security Model
```
┌─────────────────────────────────────────────────────────────┐
│                    Network Security                         │
│              (WAF, DDoS Protection, VPC)                    │
├─────────────────────────────────────────────────────────────┤
│                 Application Security                        │
│           (Authentication, Authorization, OWASP)            │
├─────────────────────────────────────────────────────────────┤
│                    Data Security                            │
│              (Encryption, Tokenization, Masking)           │
├─────────────────────────────────────────────────────────────┤
│                Infrastructure Security                      │
│            (Container Security, Secrets Management)         │
└─────────────────────────────────────────────────────────────┘
```

## 🔐 Authentication & Authorization

### JWT Token Security

#### Token Configuration
```typescript
// JWT Configuration
const jwtConfig = {
  algorithm: 'RS256', // RSA with SHA-256
  expiresIn: '15m',   // Short-lived access tokens
  issuer: 'universal-ai-cs',
  audience: 'api.universal-ai-cs.com',
};

// Refresh Token Configuration
const refreshTokenConfig = {
  expiresIn: '7d',    // Longer-lived refresh tokens
  httpOnly: true,     // Prevent XSS attacks
  secure: true,       // HTTPS only
  sameSite: 'strict', // CSRF protection
};
```

#### Token Validation
```typescript
export const validateToken = (token: string): Promise<JWTPayload> => {
  return new Promise((resolve, reject) => {
    jwt.verify(token, publicKey, jwtConfig, (err, decoded) => {
      if (err) {
        logger.warn('Token validation failed', { error: err.message });
        reject(new UnauthorizedError('Invalid token'));
      } else {
        resolve(decoded as JWTPayload);
      }
    });
  });
};
```

### Multi-Factor Authentication (MFA)

#### TOTP Implementation
```typescript
import speakeasy from 'speakeasy';

export const generateMFASecret = (userEmail: string) => {
  return speakeasy.generateSecret({
    name: `Universal AI CS (${userEmail})`,
    issuer: 'Universal AI Customer Service',
    length: 32,
  });
};

export const verifyMFAToken = (token: string, secret: string): boolean => {
  return speakeasy.totp.verify({
    secret,
    encoding: 'base32',
    token,
    window: 2, // Allow 2 time steps tolerance
  });
};
```

### Role-Based Access Control (RBAC)

#### Permission System
```typescript
export enum Permission {
  // User Management
  USER_READ = 'user:read',
  USER_WRITE = 'user:write',
  USER_DELETE = 'user:delete',
  
  // Organization Management
  ORG_READ = 'organization:read',
  ORG_WRITE = 'organization:write',
  ORG_ADMIN = 'organization:admin',
  
  // Conversation Management
  CONVERSATION_READ = 'conversation:read',
  CONVERSATION_WRITE = 'conversation:write',
  CONVERSATION_ASSIGN = 'conversation:assign',
  
  // System Administration
  SYSTEM_ADMIN = 'system:admin',
  SYSTEM_CONFIG = 'system:config',
}

export const rolePermissions = {
  agent: [
    Permission.CONVERSATION_READ,
    Permission.CONVERSATION_WRITE,
    Permission.USER_READ,
  ],
  supervisor: [
    Permission.CONVERSATION_READ,
    Permission.CONVERSATION_WRITE,
    Permission.CONVERSATION_ASSIGN,
    Permission.USER_READ,
    Permission.USER_WRITE,
  ],
  admin: [
    Permission.USER_READ,
    Permission.USER_WRITE,
    Permission.USER_DELETE,
    Permission.ORG_READ,
    Permission.ORG_WRITE,
    Permission.ORG_ADMIN,
  ],
  superadmin: Object.values(Permission),
};
```

## 🔒 Data Protection

### Encryption at Rest

#### Database Encryption
```sql
-- Enable transparent data encryption
ALTER DATABASE universal_ai_cs SET encryption = 'AES256';

-- Encrypt sensitive columns
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  phone_encrypted BYTEA, -- Encrypted phone number
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### Field-Level Encryption
```typescript
import crypto from 'crypto';

export class FieldEncryption {
  private static readonly algorithm = 'aes-256-gcm';
  private static readonly keyLength = 32;
  
  static encrypt(text: string, key: Buffer): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher(this.algorithm, key);
    cipher.setAAD(Buffer.from('universal-ai-cs'));
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }
  
  static decrypt(encryptedText: string, key: Buffer): string {
    const [ivHex, authTagHex, encrypted] = encryptedText.split(':');
    
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    
    const decipher = crypto.createDecipher(this.algorithm, key);
    decipher.setAAD(Buffer.from('universal-ai-cs'));
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }
}
```

### Encryption in Transit

#### TLS Configuration
```typescript
import https from 'https';
import fs from 'fs';

const tlsOptions = {
  key: fs.readFileSync('path/to/private-key.pem'),
  cert: fs.readFileSync('path/to/certificate.pem'),
  ca: fs.readFileSync('path/to/ca-certificate.pem'),
  
  // Security settings
  secureProtocol: 'TLSv1_2_method',
  ciphers: [
    'ECDHE-RSA-AES128-GCM-SHA256',
    'ECDHE-RSA-AES256-GCM-SHA384',
    'ECDHE-RSA-AES128-SHA256',
    'ECDHE-RSA-AES256-SHA384'
  ].join(':'),
  honorCipherOrder: true,
};

const server = https.createServer(tlsOptions, app);
```

## 🛡️ Input Validation & Sanitization

### Request Validation
```typescript
import Joi from 'joi';
import DOMPurify from 'isomorphic-dompurify';

export const userValidationSchema = Joi.object({
  email: Joi.string().email().required().max(255),
  name: Joi.string().required().min(2).max(100),
  password: Joi.string().min(8).pattern(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/
  ).required(),
  phone: Joi.string().pattern(/^\+[1-9]\d{1,14}$/).optional(),
});

export const sanitizeInput = (input: string): string => {
  // Remove HTML tags and scripts
  const cleaned = DOMPurify.sanitize(input, { 
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: []
  });
  
  // Additional sanitization
  return cleaned
    .replace(/[<>]/g, '') // Remove angle brackets
    .trim()
    .substring(0, 1000); // Limit length
};
```

### SQL Injection Prevention
```typescript
import { Pool } from 'pg';

export class DatabaseService {
  private pool: Pool;
  
  // Always use parameterized queries
  async getUserByEmail(email: string): Promise<User | null> {
    const query = 'SELECT * FROM users WHERE email = $1';
    const result = await this.pool.query(query, [email]);
    
    return result.rows[0] || null;
  }
  
  // Never concatenate user input
  async searchUsers(searchTerm: string): Promise<User[]> {
    const query = `
      SELECT * FROM users 
      WHERE name ILIKE $1 OR email ILIKE $1
      LIMIT 100
    `;
    const result = await this.pool.query(query, [`%${searchTerm}%`]);
    
    return result.rows;
  }
}
```

## 🔍 Security Monitoring

### Intrusion Detection
```typescript
export class IntrusionDetectionService {
  private suspiciousPatterns = [
    /union\s+select/i,
    /<script[^>]*>.*?<\/script>/gi,
    /javascript:/i,
    /on\w+\s*=/i,
  ];
  
  detectSuspiciousActivity(request: Request): SecurityAlert[] {
    const alerts: SecurityAlert[] = [];
    const userInput = JSON.stringify(request.body) + request.url;
    
    // Check for SQL injection patterns
    if (this.containsSQLInjection(userInput)) {
      alerts.push({
        type: 'SQL_INJECTION_ATTEMPT',
        severity: 'HIGH',
        source: request.ip,
        details: 'Potential SQL injection detected',
      });
    }
    
    // Check for XSS patterns
    if (this.containsXSS(userInput)) {
      alerts.push({
        type: 'XSS_ATTEMPT',
        severity: 'MEDIUM',
        source: request.ip,
        details: 'Potential XSS attack detected',
      });
    }
    
    return alerts;
  }
  
  private containsSQLInjection(input: string): boolean {
    const sqlPatterns = [
      /union\s+select/i,
      /drop\s+table/i,
      /delete\s+from/i,
      /insert\s+into/i,
    ];
    
    return sqlPatterns.some(pattern => pattern.test(input));
  }
}
```

### Rate Limiting
```typescript
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';

export const createRateLimiter = (options: {
  windowMs: number;
  max: number;
  message: string;
}) => {
  return rateLimit({
    store: new RedisStore({
      client: redisClient,
      prefix: 'rl:',
    }),
    windowMs: options.windowMs,
    max: options.max,
    message: {
      error: options.message,
      code: 'RATE_LIMIT_EXCEEDED',
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      logger.warn('Rate limit exceeded', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        endpoint: req.path,
      });
      
      res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: options.message,
        },
      });
    },
  });
};

// Different rate limits for different endpoints
export const authRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: 'Too many authentication attempts',
});

export const apiRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // 1000 requests per window
  message: 'Too many API requests',
});
```

## 🔐 Secrets Management

### Environment Variables
```typescript
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production']),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  ENCRYPTION_KEY: z.string().length(64),
  OPENAI_API_KEY: z.string().startsWith('sk-'),
  TWILIO_AUTH_TOKEN: z.string().min(32),
});

export const env = envSchema.parse(process.env);
```

### Secrets Rotation
```typescript
export class SecretsManager {
  async rotateJWTSecret(): Promise<void> {
    const newSecret = crypto.randomBytes(64).toString('hex');
    
    // Update in secrets store
    await this.updateSecret('JWT_SECRET', newSecret);
    
    // Graceful transition period
    await this.scheduleSecretRotation('JWT_SECRET', newSecret, '24h');
    
    logger.info('JWT secret rotated successfully');
  }
  
  async rotateEncryptionKey(): Promise<void> {
    const newKey = crypto.randomBytes(32);
    
    // Re-encrypt all sensitive data with new key
    await this.reencryptSensitiveData(newKey);
    
    // Update key in secrets store
    await this.updateSecret('ENCRYPTION_KEY', newKey.toString('hex'));
    
    logger.info('Encryption key rotated successfully');
  }
}
```

## 🔒 Compliance Implementation

### GDPR Compliance
```typescript
export class GDPRService {
  async handleDataSubjectRequest(
    type: 'access' | 'rectification' | 'erasure' | 'portability',
    userId: string
  ): Promise<void> {
    switch (type) {
      case 'access':
        return this.exportUserData(userId);
      case 'rectification':
        return this.updateUserData(userId);
      case 'erasure':
        return this.deleteUserData(userId);
      case 'portability':
        return this.exportPortableData(userId);
    }
  }
  
  async deleteUserData(userId: string): Promise<void> {
    // Anonymize instead of delete for audit trail
    await this.anonymizeUserData(userId);
    
    // Delete personal identifiers
    await this.deletePII(userId);
    
    // Log the deletion
    await this.logDataDeletion(userId);
  }
}
```

### HIPAA Compliance
```typescript
export class HIPAAService {
  async logPHIAccess(
    userId: string,
    accessedBy: string,
    purpose: string
  ): Promise<void> {
    await this.auditLog.create({
      type: 'PHI_ACCESS',
      userId,
      accessedBy,
      purpose,
      timestamp: new Date(),
      ipAddress: this.getClientIP(),
    });
  }
  
  async encryptPHI(data: any): Promise<string> {
    return FieldEncryption.encrypt(
      JSON.stringify(data),
      this.getHIPAAEncryptionKey()
    );
  }
}
```

## 🚨 Incident Response

### Security Incident Detection
```typescript
export class SecurityIncidentService {
  async detectIncident(alert: SecurityAlert): Promise<void> {
    const incident = await this.createIncident(alert);
    
    // Automatic response based on severity
    switch (alert.severity) {
      case 'CRITICAL':
        await this.triggerEmergencyResponse(incident);
        break;
      case 'HIGH':
        await this.escalateToSecurityTeam(incident);
        break;
      case 'MEDIUM':
        await this.logAndMonitor(incident);
        break;
    }
  }
  
  async triggerEmergencyResponse(incident: SecurityIncident): Promise<void> {
    // Block suspicious IP
    await this.blockIP(incident.sourceIP);
    
    // Notify security team
    await this.notifySecurityTeam(incident);
    
    // Initiate containment procedures
    await this.initiateContainment(incident);
  }
}
```

## 📊 Security Metrics

### Security Dashboard
```typescript
export class SecurityMetricsService {
  async getSecurityMetrics(): Promise<SecurityMetrics> {
    return {
      authenticationFailures: await this.getAuthFailures(),
      suspiciousActivities: await this.getSuspiciousActivities(),
      vulnerabilities: await this.getVulnerabilities(),
      complianceScore: await this.getComplianceScore(),
      incidentCount: await this.getIncidentCount(),
    };
  }
  
  async generateSecurityReport(): Promise<SecurityReport> {
    return {
      period: 'monthly',
      metrics: await this.getSecurityMetrics(),
      trends: await this.getSecurityTrends(),
      recommendations: await this.getSecurityRecommendations(),
    };
  }
}
```

## 🔧 Security Best Practices

### Development Security
- Use static code analysis tools
- Implement security testing in CI/CD
- Regular dependency vulnerability scanning
- Secure coding training for developers

### Operational Security
- Regular security audits and penetration testing
- Incident response plan testing
- Security awareness training
- Continuous monitoring and alerting

### Infrastructure Security
- Network segmentation
- Container security scanning
- Secrets management
- Regular security updates

## 📚 Additional Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [NIST Cybersecurity Framework](https://www.nist.gov/cyberframework)
- [CIS Controls](https://www.cisecurity.org/controls/)
- [GDPR Compliance Guide](https://gdpr.eu/)
- [HIPAA Security Rule](https://www.hhs.gov/hipaa/for-professionals/security/)

For security concerns, contact our security team at security@universalai-cs.com
