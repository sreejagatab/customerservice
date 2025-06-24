import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { RedisService } from './redis.service';
import { User, JwtConfig, ErrorCode } from '@universal-ai-cs/shared';

export interface TokenPayload {
  sub: string; // user ID
  org: string; // organization ID
  role: string;
  permissions: string[];
  iat: number;
  exp: number;
  jti: string; // JWT ID for revocation
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
}

export interface RefreshTokenData {
  userId: string;
  organizationId: string;
  jti: string;
  createdAt: Date;
  expiresAt: Date;
  userAgent?: string;
  ipAddress?: string;
}

export class JwtService {
  private readonly accessTokenSecret: string;
  private readonly refreshTokenSecret: string;
  private readonly accessTokenExpiresIn: string;
  private readonly refreshTokenExpiresIn: string;
  private readonly issuer: string;
  private readonly audience: string;
  private readonly redisService: RedisService;

  constructor(config: JwtConfig, redisService: RedisService) {
    this.accessTokenSecret = config.secret;
    this.refreshTokenSecret = config.refreshSecret;
    this.accessTokenExpiresIn = config.expiresIn;
    this.refreshTokenExpiresIn = config.refreshExpiresIn;
    this.issuer = 'universal-ai-cs';
    this.audience = 'universal-ai-cs-api';
    this.redisService = redisService;
  }

  /**
   * Generate access and refresh token pair
   */
  async generateTokenPair(
    user: User,
    metadata?: {
      userAgent?: string;
      ipAddress?: string;
    }
  ): Promise<TokenPair> {
    const jti = uuidv4();
    const now = Math.floor(Date.now() / 1000);
    
    // Calculate expiration times
    const accessTokenExp = this.calculateExpiration(this.accessTokenExpiresIn);
    const refreshTokenExp = this.calculateExpiration(this.refreshTokenExpiresIn);

    // Create access token payload
    const accessTokenPayload: TokenPayload = {
      sub: user.id,
      org: user.organizationId,
      role: user.role,
      permissions: user.permissions,
      iat: now,
      exp: accessTokenExp,
      jti,
    };

    // Create refresh token payload
    const refreshTokenPayload = {
      sub: user.id,
      org: user.organizationId,
      jti,
      iat: now,
      exp: refreshTokenExp,
      type: 'refresh',
    };

    // Sign tokens
    const accessToken = jwt.sign(accessTokenPayload, this.accessTokenSecret, {
      issuer: this.issuer,
      audience: this.audience,
    });

    const refreshToken = jwt.sign(refreshTokenPayload, this.refreshTokenSecret, {
      issuer: this.issuer,
      audience: this.audience,
    });

    // Store refresh token data in Redis
    const refreshTokenData: RefreshTokenData = {
      userId: user.id,
      organizationId: user.organizationId,
      jti,
      createdAt: new Date(),
      expiresAt: new Date(refreshTokenExp * 1000),
      userAgent: metadata?.userAgent,
      ipAddress: metadata?.ipAddress,
    };

    await this.storeRefreshToken(jti, refreshTokenData);

    return {
      accessToken,
      refreshToken,
      expiresIn: accessTokenExp - now,
      tokenType: 'Bearer',
    };
  }

  /**
   * Verify and decode access token
   */
  async verifyAccessToken(token: string): Promise<TokenPayload> {
    try {
      const decoded = jwt.verify(token, this.accessTokenSecret, {
        issuer: this.issuer,
        audience: this.audience,
      }) as TokenPayload;

      // Check if token is blacklisted
      const isBlacklisted = await this.isTokenBlacklisted(decoded.jti);
      if (isBlacklisted) {
        throw new Error('Token has been revoked');
      }

      return decoded;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new Error(ErrorCode.TOKEN_EXPIRED);
      } else if (error instanceof jwt.JsonWebTokenError) {
        throw new Error(ErrorCode.INVALID_TOKEN);
      }
      throw error;
    }
  }

  /**
   * Verify and decode refresh token
   */
  async verifyRefreshToken(token: string): Promise<RefreshTokenData> {
    try {
      const decoded = jwt.verify(token, this.refreshTokenSecret, {
        issuer: this.issuer,
        audience: this.audience,
      }) as any;

      if (decoded.type !== 'refresh') {
        throw new Error('Invalid token type');
      }

      // Get refresh token data from Redis
      const refreshTokenData = await this.getRefreshToken(decoded.jti);
      if (!refreshTokenData) {
        throw new Error('Refresh token not found or expired');
      }

      return refreshTokenData;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new Error(ErrorCode.TOKEN_EXPIRED);
      } else if (error instanceof jwt.JsonWebTokenError) {
        throw new Error(ErrorCode.INVALID_TOKEN);
      }
      throw error;
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(
    refreshToken: string,
    user: User
  ): Promise<{ accessToken: string; expiresIn: number }> {
    const refreshTokenData = await this.verifyRefreshToken(refreshToken);
    
    if (refreshTokenData.userId !== user.id) {
      throw new Error('Token user mismatch');
    }

    const now = Math.floor(Date.now() / 1000);
    const accessTokenExp = this.calculateExpiration(this.accessTokenExpiresIn);

    const accessTokenPayload: TokenPayload = {
      sub: user.id,
      org: user.organizationId,
      role: user.role,
      permissions: user.permissions,
      iat: now,
      exp: accessTokenExp,
      jti: refreshTokenData.jti,
    };

    const accessToken = jwt.sign(accessTokenPayload, this.accessTokenSecret, {
      issuer: this.issuer,
      audience: this.audience,
    });

    return {
      accessToken,
      expiresIn: accessTokenExp - now,
    };
  }

  /**
   * Revoke a specific token
   */
  async revokeToken(jti: string): Promise<void> {
    await this.blacklistToken(jti);
    await this.removeRefreshToken(jti);
  }

  /**
   * Revoke all tokens for a user
   */
  async revokeAllUserTokens(userId: string): Promise<void> {
    const pattern = `refresh_token:*:${userId}`;
    const keys = await this.redisService.keys(pattern);
    
    for (const key of keys) {
      const jti = key.split(':')[1];
      await this.revokeToken(jti);
    }
  }

  /**
   * Get all active sessions for a user
   */
  async getUserSessions(userId: string): Promise<RefreshTokenData[]> {
    const pattern = `refresh_token:*:${userId}`;
    const keys = await this.redisService.keys(pattern);
    
    const sessions: RefreshTokenData[] = [];
    for (const key of keys) {
      const data = await this.redisService.get(key);
      if (data) {
        sessions.push(JSON.parse(data));
      }
    }
    
    return sessions.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /**
   * Clean up expired tokens
   */
  async cleanupExpiredTokens(): Promise<number> {
    const pattern = 'refresh_token:*';
    const keys = await this.redisService.keys(pattern);
    let cleanedCount = 0;

    for (const key of keys) {
      const data = await this.redisService.get(key);
      if (data) {
        const tokenData: RefreshTokenData = JSON.parse(data);
        if (new Date() > tokenData.expiresAt) {
          await this.redisService.del(key);
          cleanedCount++;
        }
      }
    }

    return cleanedCount;
  }

  private calculateExpiration(expiresIn: string): number {
    const now = Math.floor(Date.now() / 1000);
    const match = expiresIn.match(/^(\d+)([smhd])$/);
    
    if (!match) {
      throw new Error('Invalid expiration format');
    }

    const value = parseInt(match[1]);
    const unit = match[2];

    let seconds: number;
    switch (unit) {
      case 's':
        seconds = value;
        break;
      case 'm':
        seconds = value * 60;
        break;
      case 'h':
        seconds = value * 60 * 60;
        break;
      case 'd':
        seconds = value * 60 * 60 * 24;
        break;
      default:
        throw new Error('Invalid time unit');
    }

    return now + seconds;
  }

  private async storeRefreshToken(jti: string, data: RefreshTokenData): Promise<void> {
    const key = `refresh_token:${jti}:${data.userId}`;
    const ttl = Math.floor((data.expiresAt.getTime() - Date.now()) / 1000);
    await this.redisService.setex(key, ttl, JSON.stringify(data));
  }

  private async getRefreshToken(jti: string): Promise<RefreshTokenData | null> {
    const pattern = `refresh_token:${jti}:*`;
    const keys = await this.redisService.keys(pattern);
    
    if (keys.length === 0) {
      return null;
    }

    const data = await this.redisService.get(keys[0]);
    return data ? JSON.parse(data) : null;
  }

  private async removeRefreshToken(jti: string): Promise<void> {
    const pattern = `refresh_token:${jti}:*`;
    const keys = await this.redisService.keys(pattern);
    
    for (const key of keys) {
      await this.redisService.del(key);
    }
  }

  private async blacklistToken(jti: string): Promise<void> {
    const key = `blacklist:${jti}`;
    // Set TTL to match the longest possible token expiration
    const ttl = this.calculateExpiration(this.refreshTokenExpiresIn) - Math.floor(Date.now() / 1000);
    await this.redisService.setex(key, ttl, '1');
  }

  private async isTokenBlacklisted(jti: string): Promise<boolean> {
    const key = `blacklist:${jti}`;
    const result = await this.redisService.get(key);
    return result !== null;
  }
}
