/**
 * User Management Service
 * Handles user creation, authentication, profile management, and security
 */

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '@/config';
import { logger } from '@/utils/logger';
import { redis } from '@/services/redis';
import { rbacService } from '@/services/rbac-service';

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatar?: string;
  phone?: string;
  timezone: string;
  language: string;
  isActive: boolean;
  isEmailVerified: boolean;
  isPhoneVerified: boolean;
  lastLoginAt?: Date;
  lastLoginIp?: string;
  passwordChangedAt: Date;
  twoFactorEnabled: boolean;
  twoFactorSecret?: string;
  loginAttempts: number;
  lockedUntil?: Date;
  organizationId: string;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserRequest {
  email: string;
  firstName: string;
  lastName: string;
  password: string;
  phone?: string;
  timezone?: string;
  language?: string;
  organizationId: string;
  roles?: string[];
  metadata?: Record<string, any>;
}

export interface UpdateUserRequest {
  firstName?: string;
  lastName?: string;
  phone?: string;
  timezone?: string;
  language?: string;
  avatar?: string;
  metadata?: Record<string, any>;
}

export interface LoginRequest {
  email: string;
  password: string;
  organizationId: string;
  twoFactorCode?: string;
  rememberMe?: boolean;
}

export interface LoginResult {
  success: boolean;
  user?: User;
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  error?: string;
  requiresTwoFactor?: boolean;
}

export interface PasswordResetRequest {
  email: string;
  organizationId: string;
}

export interface PasswordChangeRequest {
  currentPassword: string;
  newPassword: string;
}

export class UserService {
  private static instance: UserService;

  private constructor() {}

  public static getInstance(): UserService {
    if (!UserService.instance) {
      UserService.instance = new UserService();
    }
    return UserService.instance;
  }

  /**
   * Create a new user
   */
  public async createUser(request: CreateUserRequest, createdBy: string): Promise<User | null> {
    try {
      // Validate email uniqueness
      const existingUser = await this.getUserByEmail(request.email, request.organizationId);
      if (existingUser) {
        throw new Error('User with this email already exists');
      }

      // Validate password strength
      this.validatePassword(request.password);

      // Hash password
      const hashedPassword = await bcrypt.hash(request.password, config.password.saltRounds);

      const user: User = {
        id: this.generateUserId(),
        email: request.email.toLowerCase(),
        firstName: request.firstName,
        lastName: request.lastName,
        phone: request.phone,
        timezone: request.timezone || 'UTC',
        language: request.language || 'en',
        isActive: true,
        isEmailVerified: false,
        isPhoneVerified: false,
        passwordChangedAt: new Date(),
        twoFactorEnabled: false,
        loginAttempts: 0,
        organizationId: request.organizationId,
        metadata: request.metadata || {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // TODO: Save to database with hashed password
      
      // Assign default roles if specified
      if (request.roles && request.roles.length > 0) {
        for (const roleId of request.roles) {
          await rbacService.assignRole(user.id, roleId, user.organizationId, createdBy);
        }
      }

      // Send email verification
      await this.sendEmailVerification(user);

      logger.info('User created', {
        userId: user.id,
        email: user.email,
        organizationId: user.organizationId,
        createdBy,
      });

      return user;
    } catch (error) {
      logger.error('Error creating user', {
        email: request.email,
        organizationId: request.organizationId,
        createdBy,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Authenticate user login
   */
  public async login(request: LoginRequest): Promise<LoginResult> {
    try {
      const user = await this.getUserByEmail(request.email, request.organizationId);
      
      if (!user) {
        return {
          success: false,
          error: 'Invalid credentials',
        };
      }

      // Check if account is locked
      if (user.lockedUntil && user.lockedUntil > new Date()) {
        return {
          success: false,
          error: 'Account is temporarily locked due to too many failed login attempts',
        };
      }

      // Check if account is active
      if (!user.isActive) {
        return {
          success: false,
          error: 'Account is deactivated',
        };
      }

      // TODO: Verify password against stored hash
      const isPasswordValid = true; // await bcrypt.compare(request.password, storedPasswordHash);
      
      if (!isPasswordValid) {
        await this.handleFailedLogin(user.id);
        return {
          success: false,
          error: 'Invalid credentials',
        };
      }

      // Check two-factor authentication
      if (user.twoFactorEnabled) {
        if (!request.twoFactorCode) {
          return {
            success: false,
            requiresTwoFactor: true,
            error: 'Two-factor authentication code required',
          };
        }

        const isValidTwoFactor = await this.verifyTwoFactorCode(user.id, request.twoFactorCode);
        if (!isValidTwoFactor) {
          return {
            success: false,
            error: 'Invalid two-factor authentication code',
          };
        }
      }

      // Generate tokens
      const accessToken = this.generateAccessToken(user);
      const refreshToken = this.generateRefreshToken(user);

      // Update last login
      await this.updateLastLogin(user.id, request);

      // Reset login attempts
      await this.resetLoginAttempts(user.id);

      logger.info('User logged in successfully', {
        userId: user.id,
        email: user.email,
        organizationId: user.organizationId,
      });

      return {
        success: true,
        user,
        accessToken,
        refreshToken,
        expiresIn: this.getTokenExpirationTime(),
      };
    } catch (error) {
      logger.error('Error during login', {
        email: request.email,
        organizationId: request.organizationId,
        error: error instanceof Error ? error.message : String(error),
      });
      
      return {
        success: false,
        error: 'Login failed',
      };
    }
  }

  /**
   * Refresh access token
   */
  public async refreshToken(refreshToken: string): Promise<{ accessToken?: string; error?: string }> {
    try {
      const decoded = jwt.verify(refreshToken, config.jwt.refreshSecret) as any;
      const user = await this.getUserById(decoded.userId);
      
      if (!user || !user.isActive) {
        return { error: 'Invalid refresh token' };
      }

      const newAccessToken = this.generateAccessToken(user);
      
      return { accessToken: newAccessToken };
    } catch (error) {
      logger.error('Error refreshing token', {
        error: error instanceof Error ? error.message : String(error),
      });
      return { error: 'Invalid refresh token' };
    }
  }

  /**
   * Update user profile
   */
  public async updateUser(userId: string, updates: UpdateUserRequest, updatedBy: string): Promise<User | null> {
    try {
      const user = await this.getUserById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      const updatedUser: User = {
        ...user,
        ...updates,
        updatedAt: new Date(),
      };

      // TODO: Save to database
      
      logger.info('User updated', {
        userId,
        updates: Object.keys(updates),
        updatedBy,
      });

      return updatedUser;
    } catch (error) {
      logger.error('Error updating user', {
        userId,
        updates,
        updatedBy,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Change user password
   */
  public async changePassword(userId: string, request: PasswordChangeRequest): Promise<boolean> {
    try {
      const user = await this.getUserById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // TODO: Verify current password
      // const isCurrentPasswordValid = await bcrypt.compare(request.currentPassword, storedPasswordHash);
      const isCurrentPasswordValid = true;
      
      if (!isCurrentPasswordValid) {
        throw new Error('Current password is incorrect');
      }

      // Validate new password
      this.validatePassword(request.newPassword);

      // Hash new password
      const hashedPassword = await bcrypt.hash(request.newPassword, config.password.saltRounds);

      // TODO: Update password in database
      
      // Update password changed timestamp
      await this.updateUser(userId, { metadata: { ...user.metadata, passwordChangedAt: new Date() } }, userId);

      logger.info('Password changed', { userId });
      
      return true;
    } catch (error) {
      logger.error('Error changing password', {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Request password reset
   */
  public async requestPasswordReset(request: PasswordResetRequest): Promise<boolean> {
    try {
      const user = await this.getUserByEmail(request.email, request.organizationId);
      if (!user) {
        // Don't reveal if email exists
        return true;
      }

      // Generate reset token
      const resetToken = this.generatePasswordResetToken(user);
      
      // Store reset token with expiration
      await redis.set(`password_reset:${user.id}`, resetToken, { ttl: 3600 }); // 1 hour

      // Send password reset email
      await this.sendPasswordResetEmail(user, resetToken);

      logger.info('Password reset requested', {
        userId: user.id,
        email: user.email,
      });

      return true;
    } catch (error) {
      logger.error('Error requesting password reset', {
        email: request.email,
        organizationId: request.organizationId,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Get user by ID
   */
  public async getUserById(userId: string): Promise<User | null> {
    try {
      // Check cache first
      const cacheKey = `user:${userId}`;
      const cached = await redis.get<User>(cacheKey);
      if (cached) {
        return cached;
      }

      // TODO: Load from database
      
      return null;
    } catch (error) {
      logger.error('Error getting user by ID', {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Get user by email
   */
  public async getUserByEmail(email: string, organizationId: string): Promise<User | null> {
    try {
      // TODO: Load from database
      
      return null;
    } catch (error) {
      logger.error('Error getting user by email', {
        email,
        organizationId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Validate password strength
   */
  private validatePassword(password: string): void {
    if (password.length < config.password.minLength) {
      throw new Error(`Password must be at least ${config.password.minLength} characters long`);
    }

    if (config.password.requireUppercase && !/[A-Z]/.test(password)) {
      throw new Error('Password must contain at least one uppercase letter');
    }

    if (config.password.requireLowercase && !/[a-z]/.test(password)) {
      throw new Error('Password must contain at least one lowercase letter');
    }

    if (config.password.requireNumbers && !/\d/.test(password)) {
      throw new Error('Password must contain at least one number');
    }

    if (config.password.requireSymbols && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      throw new Error('Password must contain at least one special character');
    }
  }

  /**
   * Generate access token
   */
  private generateAccessToken(user: User): string {
    return jwt.sign(
      {
        userId: user.id,
        email: user.email,
        organizationId: user.organizationId,
        type: 'access',
      },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );
  }

  /**
   * Generate refresh token
   */
  private generateRefreshToken(user: User): string {
    return jwt.sign(
      {
        userId: user.id,
        type: 'refresh',
      },
      config.jwt.refreshSecret,
      { expiresIn: config.jwt.refreshExpiresIn }
    );
  }

  /**
   * Generate password reset token
   */
  private generatePasswordResetToken(user: User): string {
    return jwt.sign(
      {
        userId: user.id,
        email: user.email,
        type: 'password_reset',
      },
      config.jwt.secret,
      { expiresIn: '1h' }
    );
  }

  /**
   * Get token expiration time in seconds
   */
  private getTokenExpirationTime(): number {
    const expiresIn = config.jwt.expiresIn;
    if (expiresIn.endsWith('h')) {
      return parseInt(expiresIn) * 3600;
    } else if (expiresIn.endsWith('m')) {
      return parseInt(expiresIn) * 60;
    } else if (expiresIn.endsWith('d')) {
      return parseInt(expiresIn) * 86400;
    }
    return 3600; // Default 1 hour
  }

  /**
   * Handle failed login attempt
   */
  private async handleFailedLogin(userId: string): Promise<void> {
    try {
      const user = await this.getUserById(userId);
      if (!user) return;

      const newAttempts = user.loginAttempts + 1;
      
      if (newAttempts >= config.session.maxLoginAttempts) {
        const lockUntil = new Date(Date.now() + config.session.lockoutDuration * 1000);
        await this.updateUser(userId, {
          metadata: {
            ...user.metadata,
            loginAttempts: newAttempts,
            lockedUntil: lockUntil,
          },
        }, 'system');
        
        logger.warn('User account locked due to failed login attempts', {
          userId,
          attempts: newAttempts,
          lockUntil,
        });
      } else {
        await this.updateUser(userId, {
          metadata: {
            ...user.metadata,
            loginAttempts: newAttempts,
          },
        }, 'system');
      }
    } catch (error) {
      logger.error('Error handling failed login', {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Reset login attempts
   */
  private async resetLoginAttempts(userId: string): Promise<void> {
    try {
      const user = await this.getUserById(userId);
      if (!user) return;

      await this.updateUser(userId, {
        metadata: {
          ...user.metadata,
          loginAttempts: 0,
          lockedUntil: undefined,
        },
      }, 'system');
    } catch (error) {
      logger.error('Error resetting login attempts', {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Update last login information
   */
  private async updateLastLogin(userId: string, request: LoginRequest): Promise<void> {
    try {
      const user = await this.getUserById(userId);
      if (!user) return;

      await this.updateUser(userId, {
        metadata: {
          ...user.metadata,
          lastLoginAt: new Date(),
          lastLoginIp: request.metadata?.ip,
        },
      }, 'system');
    } catch (error) {
      logger.error('Error updating last login', {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Verify two-factor authentication code
   */
  private async verifyTwoFactorCode(userId: string, code: string): Promise<boolean> {
    try {
      // TODO: Implement TOTP verification
      return true;
    } catch (error) {
      logger.error('Error verifying two-factor code', {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Send email verification
   */
  private async sendEmailVerification(user: User): Promise<void> {
    try {
      // TODO: Send email verification via notification service
      logger.info('Email verification sent', { userId: user.id, email: user.email });
    } catch (error) {
      logger.error('Error sending email verification', {
        userId: user.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Send password reset email
   */
  private async sendPasswordResetEmail(user: User, resetToken: string): Promise<void> {
    try {
      // TODO: Send password reset email via notification service
      logger.info('Password reset email sent', { userId: user.id, email: user.email });
    } catch (error) {
      logger.error('Error sending password reset email', {
        userId: user.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Generate unique user ID
   */
  private generateUserId(): string {
    return `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Export singleton instance
export const userService = UserService.getInstance();
