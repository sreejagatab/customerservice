import bcrypt from 'bcrypt';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import { v4 as uuidv4 } from 'uuid';
import { 
  User, 
  Organization, 
  ErrorCode, 
  LoginRequest, 
  RegisterRequest,
  ResetPasswordRequest,
  ConfirmResetPasswordRequest
} from '@universal-ai-cs/shared';
import { JwtService, TokenPair } from './jwt.service';
import { UserService } from './user.service';
import { EmailService } from './email.service';
import { RedisService } from './redis.service';

export interface LoginResult {
  user: User;
  organization: Organization;
  tokens: TokenPair;
  requiresMfa?: boolean;
  mfaToken?: string;
}

export interface MfaSetupResult {
  secret: string;
  qrCodeUrl: string;
  backupCodes: string[];
}

export class AuthService {
  constructor(
    private jwtService: JwtService,
    private userService: UserService,
    private emailService: EmailService,
    private redisService: RedisService
  ) {}

  /**
   * Authenticate user with email and password
   */
  async login(
    loginData: LoginRequest,
    metadata?: {
      userAgent?: string;
      ipAddress?: string;
    }
  ): Promise<LoginResult> {
    const { email, password, mfaCode } = loginData;

    // Find user by email
    const user = await this.userService.findByEmail(email);
    if (!user) {
      throw new Error(ErrorCode.INVALID_CREDENTIALS);
    }

    // Check if user is active
    if (user.status !== 'active') {
      throw new Error(ErrorCode.FORBIDDEN);
    }

    // Check if account is locked
    if (user.locked_until && new Date() < user.locked_until) {
      throw new Error(ErrorCode.FORBIDDEN);
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      await this.handleFailedLogin(user.id);
      throw new Error(ErrorCode.INVALID_CREDENTIALS);
    }

    // Reset failed login attempts on successful password verification
    await this.resetFailedLoginAttempts(user.id);

    // Check MFA if enabled
    if (user.mfaEnabled) {
      if (!mfaCode) {
        // Generate temporary MFA token
        const mfaToken = await this.generateMfaToken(user.id);
        return {
          user,
          organization: await this.userService.getOrganization(user.organizationId),
          tokens: null as any,
          requiresMfa: true,
          mfaToken,
        };
      }

      // Verify MFA code
      const isMfaValid = await this.verifyMfaCode(user.id, mfaCode);
      if (!isMfaValid) {
        throw new Error(ErrorCode.INVALID_CREDENTIALS);
      }
    }

    // Generate tokens
    const tokens = await this.jwtService.generateTokenPair(user, metadata);

    // Update last login
    await this.userService.updateLastLogin(user.id);

    // Get organization
    const organization = await this.userService.getOrganization(user.organizationId);

    return {
      user,
      organization,
      tokens,
    };
  }

  /**
   * Complete MFA login
   */
  async completeMfaLogin(
    mfaToken: string,
    mfaCode: string,
    metadata?: {
      userAgent?: string;
      ipAddress?: string;
    }
  ): Promise<LoginResult> {
    // Verify MFA token
    const userId = await this.verifyMfaToken(mfaToken);
    if (!userId) {
      throw new Error(ErrorCode.INVALID_TOKEN);
    }

    // Get user
    const user = await this.userService.findById(userId);
    if (!user) {
      throw new Error(ErrorCode.NOT_FOUND);
    }

    // Verify MFA code
    const isMfaValid = await this.verifyMfaCode(user.id, mfaCode);
    if (!isMfaValid) {
      throw new Error(ErrorCode.INVALID_CREDENTIALS);
    }

    // Generate tokens
    const tokens = await this.jwtService.generateTokenPair(user, metadata);

    // Update last login
    await this.userService.updateLastLogin(user.id);

    // Get organization
    const organization = await this.userService.getOrganization(user.organizationId);

    // Clean up MFA token
    await this.revokeMfaToken(mfaToken);

    return {
      user,
      organization,
      tokens,
    };
  }

  /**
   * Register new user and organization
   */
  async register(registerData: RegisterRequest): Promise<LoginResult> {
    const { email, password, firstName, lastName, organizationName, plan } = registerData;

    // Check if user already exists
    const existingUser = await this.userService.findByEmail(email);
    if (existingUser) {
      throw new Error(ErrorCode.ALREADY_EXISTS);
    }

    // Hash password
    const passwordHash = await this.hashPassword(password);

    // Create organization and user
    const { user, organization } = await this.userService.createUserWithOrganization({
      email,
      passwordHash,
      firstName,
      lastName,
      organizationName,
      plan: plan || 'starter',
    });

    // Generate email verification token
    const verificationToken = await this.generateEmailVerificationToken(user.id);

    // Send verification email
    await this.emailService.sendVerificationEmail(user.email, verificationToken);

    // Generate tokens
    const tokens = await this.jwtService.generateTokenPair(user);

    return {
      user,
      organization,
      tokens,
    };
  }

  /**
   * Refresh access token
   */
  async refreshToken(refreshToken: string): Promise<{ accessToken: string; expiresIn: number }> {
    // Verify refresh token and get user
    const refreshTokenData = await this.jwtService.verifyRefreshToken(refreshToken);
    const user = await this.userService.findById(refreshTokenData.userId);
    
    if (!user) {
      throw new Error(ErrorCode.NOT_FOUND);
    }

    if (user.status !== 'active') {
      throw new Error(ErrorCode.FORBIDDEN);
    }

    // Generate new access token
    return this.jwtService.refreshAccessToken(refreshToken, user);
  }

  /**
   * Logout user (revoke tokens)
   */
  async logout(jti: string): Promise<void> {
    await this.jwtService.revokeToken(jti);
  }

  /**
   * Logout from all devices
   */
  async logoutAll(userId: string): Promise<void> {
    await this.jwtService.revokeAllUserTokens(userId);
  }

  /**
   * Setup MFA for user
   */
  async setupMfa(userId: string): Promise<MfaSetupResult> {
    const user = await this.userService.findById(userId);
    if (!user) {
      throw new Error(ErrorCode.NOT_FOUND);
    }

    // Generate secret
    const secret = speakeasy.generateSecret({
      name: `Universal AI CS (${user.email})`,
      issuer: 'Universal AI Customer Service',
      length: 32,
    });

    // Generate QR code
    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url!);

    // Generate backup codes
    const backupCodes = this.generateBackupCodes();

    // Store secret temporarily (user needs to verify before enabling)
    await this.storeTempMfaSecret(userId, secret.base32, backupCodes);

    return {
      secret: secret.base32,
      qrCodeUrl,
      backupCodes,
    };
  }

  /**
   * Enable MFA after verification
   */
  async enableMfa(userId: string, verificationCode: string): Promise<void> {
    const tempData = await this.getTempMfaSecret(userId);
    if (!tempData) {
      throw new Error(ErrorCode.NOT_FOUND);
    }

    // Verify the code
    const isValid = speakeasy.totp.verify({
      secret: tempData.secret,
      encoding: 'base32',
      token: verificationCode,
      window: 2,
    });

    if (!isValid) {
      throw new Error(ErrorCode.INVALID_INPUT);
    }

    // Enable MFA for user
    await this.userService.enableMfa(userId, tempData.secret, tempData.backupCodes);

    // Clean up temporary data
    await this.removeTempMfaSecret(userId);
  }

  /**
   * Disable MFA
   */
  async disableMfa(userId: string, verificationCode: string): Promise<void> {
    const user = await this.userService.findById(userId);
    if (!user || !user.mfaEnabled) {
      throw new Error(ErrorCode.NOT_FOUND);
    }

    // Verify the code
    const isValid = await this.verifyMfaCode(userId, verificationCode);
    if (!isValid) {
      throw new Error(ErrorCode.INVALID_INPUT);
    }

    // Disable MFA
    await this.userService.disableMfa(userId);
  }

  /**
   * Request password reset
   */
  async requestPasswordReset(email: string): Promise<void> {
    const user = await this.userService.findByEmail(email);
    if (!user) {
      // Don't reveal if email exists
      return;
    }

    // Generate reset token
    const resetToken = await this.generatePasswordResetToken(user.id);

    // Send reset email
    await this.emailService.sendPasswordResetEmail(user.email, resetToken);
  }

  /**
   * Confirm password reset
   */
  async confirmPasswordReset(data: ConfirmResetPasswordRequest): Promise<void> {
    const { token, newPassword } = data;

    // Verify reset token
    const userId = await this.verifyPasswordResetToken(token);
    if (!userId) {
      throw new Error(ErrorCode.INVALID_TOKEN);
    }

    // Hash new password
    const passwordHash = await this.hashPassword(newPassword);

    // Update password
    await this.userService.updatePassword(userId, passwordHash);

    // Revoke all tokens for security
    await this.jwtService.revokeAllUserTokens(userId);

    // Clean up reset token
    await this.revokePasswordResetToken(token);
  }

  /**
   * Verify email address
   */
  async verifyEmail(token: string): Promise<void> {
    const userId = await this.verifyEmailVerificationToken(token);
    if (!userId) {
      throw new Error(ErrorCode.INVALID_TOKEN);
    }

    await this.userService.verifyEmail(userId);
    await this.revokeEmailVerificationToken(token);
  }

  /**
   * Change password (authenticated user)
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string
  ): Promise<void> {
    const user = await this.userService.findById(userId);
    if (!user) {
      throw new Error(ErrorCode.NOT_FOUND);
    }

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isCurrentPasswordValid) {
      throw new Error(ErrorCode.INVALID_CREDENTIALS);
    }

    // Hash new password
    const passwordHash = await this.hashPassword(newPassword);

    // Update password
    await this.userService.updatePassword(userId, passwordHash);

    // Revoke all other tokens for security
    await this.jwtService.revokeAllUserTokens(userId);
  }

  private async hashPassword(password: string): Promise<string> {
    const saltRounds = 12;
    return bcrypt.hash(password, saltRounds);
  }

  private async handleFailedLogin(userId: string): Promise<void> {
    await this.userService.incrementFailedLoginAttempts(userId);
  }

  private async resetFailedLoginAttempts(userId: string): Promise<void> {
    await this.userService.resetFailedLoginAttempts(userId);
  }

  private async verifyMfaCode(userId: string, code: string): Promise<boolean> {
    const user = await this.userService.findById(userId);
    if (!user || !user.mfaSecret) {
      return false;
    }

    // Try TOTP verification
    const totpValid = speakeasy.totp.verify({
      secret: user.mfaSecret,
      encoding: 'base32',
      token: code,
      window: 2,
    });

    if (totpValid) {
      return true;
    }

    // Try backup code verification
    return this.userService.verifyBackupCode(userId, code);
  }

  private generateBackupCodes(): string[] {
    const codes: string[] = [];
    for (let i = 0; i < 10; i++) {
      codes.push(Math.random().toString(36).substring(2, 10).toUpperCase());
    }
    return codes;
  }

  private async generateMfaToken(userId: string): Promise<string> {
    const token = uuidv4();
    await this.redisService.setex(`mfa_token:${token}`, 300, userId); // 5 minutes
    return token;
  }

  private async verifyMfaToken(token: string): Promise<string | null> {
    return this.redisService.get(`mfa_token:${token}`);
  }

  private async revokeMfaToken(token: string): Promise<void> {
    await this.redisService.del(`mfa_token:${token}`);
  }

  private async storeTempMfaSecret(
    userId: string,
    secret: string,
    backupCodes: string[]
  ): Promise<void> {
    const data = { secret, backupCodes };
    await this.redisService.setex(`temp_mfa:${userId}`, 1800, JSON.stringify(data)); // 30 minutes
  }

  private async getTempMfaSecret(userId: string): Promise<{ secret: string; backupCodes: string[] } | null> {
    const data = await this.redisService.get(`temp_mfa:${userId}`);
    return data ? JSON.parse(data) : null;
  }

  private async removeTempMfaSecret(userId: string): Promise<void> {
    await this.redisService.del(`temp_mfa:${userId}`);
  }

  private async generatePasswordResetToken(userId: string): Promise<string> {
    const token = uuidv4();
    await this.redisService.setex(`reset_token:${token}`, 3600, userId); // 1 hour
    return token;
  }

  private async verifyPasswordResetToken(token: string): Promise<string | null> {
    return this.redisService.get(`reset_token:${token}`);
  }

  private async revokePasswordResetToken(token: string): Promise<void> {
    await this.redisService.del(`reset_token:${token}`);
  }

  private async generateEmailVerificationToken(userId: string): Promise<string> {
    const token = uuidv4();
    await this.redisService.setex(`verify_email:${token}`, 86400, userId); // 24 hours
    return token;
  }

  private async verifyEmailVerificationToken(token: string): Promise<string | null> {
    return this.redisService.get(`verify_email:${token}`);
  }

  private async revokeEmailVerificationToken(token: string): Promise<void> {
    await this.redisService.del(`verify_email:${token}`);
  }
}
