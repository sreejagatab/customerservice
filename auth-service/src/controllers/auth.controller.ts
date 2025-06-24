import { Request, Response } from 'express';
import { validationResult } from 'express-validator';
import { 
  LoginRequest, 
  RegisterRequest, 
  ResetPasswordRequest,
  ConfirmResetPasswordRequest,
  ApiResponse,
  ErrorCode
} from '@universal-ai-cs/shared';
import { AuthService } from '../services/auth.service';
import { UserService } from '../services/user.service';

export class AuthController {
  constructor(
    private authService: AuthService,
    private userService: UserService
  ) {}

  /**
   * Login user
   */
  login = async (req: Request, res: Response): Promise<void> => {
    try {
      // Validate request
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message: 'Validation failed',
            details: errors.array(),
          },
        });
        return;
      }

      const loginData: LoginRequest = req.body;
      const metadata = {
        userAgent: req.headers['user-agent'],
        ipAddress: req.ip,
      };

      const result = await this.authService.login(loginData, metadata);

      const response: ApiResponse = {
        success: true,
        data: result,
        meta: {
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] as string,
          version: '1.0.0',
        },
      };

      res.status(200).json(response);
    } catch (error) {
      this.handleError(res, error);
    }
  };

  /**
   * Complete MFA login
   */
  completeMfaLogin = async (req: Request, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message: 'Validation failed',
            details: errors.array(),
          },
        });
        return;
      }

      const { mfaToken, mfaCode } = req.body;
      const metadata = {
        userAgent: req.headers['user-agent'],
        ipAddress: req.ip,
      };

      const result = await this.authService.completeMfaLogin(mfaToken, mfaCode, metadata);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  /**
   * Register new user
   */
  register = async (req: Request, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message: 'Validation failed',
            details: errors.array(),
          },
        });
        return;
      }

      const registerData: RegisterRequest = req.body;
      const result = await this.authService.register(registerData);

      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  /**
   * Refresh access token
   */
  refreshToken = async (req: Request, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message: 'Validation failed',
            details: errors.array(),
          },
        });
        return;
      }

      const { refreshToken } = req.body;
      const result = await this.authService.refreshToken(refreshToken);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  /**
   * Logout user
   */
  logout = async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.token) {
        res.status(401).json({
          success: false,
          error: {
            code: ErrorCode.UNAUTHORIZED,
            message: 'Authentication required',
          },
        });
        return;
      }

      await this.authService.logout(req.token.jti);

      res.status(200).json({
        success: true,
        data: { message: 'Logged out successfully' },
      });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  /**
   * Logout from all devices
   */
  logoutAll = async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: {
            code: ErrorCode.UNAUTHORIZED,
            message: 'Authentication required',
          },
        });
        return;
      }

      await this.authService.logoutAll(req.user.id);

      res.status(200).json({
        success: true,
        data: { message: 'Logged out from all devices' },
      });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  /**
   * Get current user profile
   */
  getProfile = async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: {
            code: ErrorCode.UNAUTHORIZED,
            message: 'Authentication required',
          },
        });
        return;
      }

      const user = await this.userService.findById(req.user.id);
      const organization = await this.userService.getOrganization(req.user.organizationId);

      res.status(200).json({
        success: true,
        data: {
          user,
          organization,
          permissions: req.user.permissions,
        },
      });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  /**
   * Setup MFA
   */
  setupMfa = async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: {
            code: ErrorCode.UNAUTHORIZED,
            message: 'Authentication required',
          },
        });
        return;
      }

      const result = await this.authService.setupMfa(req.user.id);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  /**
   * Enable MFA
   */
  enableMfa = async (req: Request, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message: 'Validation failed',
            details: errors.array(),
          },
        });
        return;
      }

      if (!req.user) {
        res.status(401).json({
          success: false,
          error: {
            code: ErrorCode.UNAUTHORIZED,
            message: 'Authentication required',
          },
        });
        return;
      }

      const { verificationCode } = req.body;
      await this.authService.enableMfa(req.user.id, verificationCode);

      res.status(200).json({
        success: true,
        data: { message: 'MFA enabled successfully' },
      });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  /**
   * Disable MFA
   */
  disableMfa = async (req: Request, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message: 'Validation failed',
            details: errors.array(),
          },
        });
        return;
      }

      if (!req.user) {
        res.status(401).json({
          success: false,
          error: {
            code: ErrorCode.UNAUTHORIZED,
            message: 'Authentication required',
          },
        });
        return;
      }

      const { verificationCode } = req.body;
      await this.authService.disableMfa(req.user.id, verificationCode);

      res.status(200).json({
        success: true,
        data: { message: 'MFA disabled successfully' },
      });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  /**
   * Request password reset
   */
  requestPasswordReset = async (req: Request, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message: 'Validation failed',
            details: errors.array(),
          },
        });
        return;
      }

      const { email } = req.body;
      await this.authService.requestPasswordReset(email);

      // Always return success to prevent email enumeration
      res.status(200).json({
        success: true,
        data: { message: 'If the email exists, a reset link has been sent' },
      });
    } catch (error) {
      // Don't expose errors for password reset to prevent enumeration
      res.status(200).json({
        success: true,
        data: { message: 'If the email exists, a reset link has been sent' },
      });
    }
  };

  /**
   * Confirm password reset
   */
  confirmPasswordReset = async (req: Request, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message: 'Validation failed',
            details: errors.array(),
          },
        });
        return;
      }

      const resetData: ConfirmResetPasswordRequest = req.body;
      await this.authService.confirmPasswordReset(resetData);

      res.status(200).json({
        success: true,
        data: { message: 'Password reset successfully' },
      });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  /**
   * Verify email address
   */
  verifyEmail = async (req: Request, res: Response): Promise<void> => {
    try {
      const { token } = req.params;
      await this.authService.verifyEmail(token);

      res.status(200).json({
        success: true,
        data: { message: 'Email verified successfully' },
      });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  /**
   * Change password
   */
  changePassword = async (req: Request, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message: 'Validation failed',
            details: errors.array(),
          },
        });
        return;
      }

      if (!req.user) {
        res.status(401).json({
          success: false,
          error: {
            code: ErrorCode.UNAUTHORIZED,
            message: 'Authentication required',
          },
        });
        return;
      }

      const { currentPassword, newPassword } = req.body;
      await this.authService.changePassword(req.user.id, currentPassword, newPassword);

      res.status(200).json({
        success: true,
        data: { message: 'Password changed successfully' },
      });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  private handleError(res: Response, error: any): void {
    console.error('Auth controller error:', error);

    let statusCode = 500;
    let errorCode = ErrorCode.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';

    if (error instanceof Error) {
      switch (error.message) {
        case ErrorCode.INVALID_CREDENTIALS:
          statusCode = 401;
          errorCode = ErrorCode.INVALID_CREDENTIALS;
          message = 'Invalid credentials';
          break;
        case ErrorCode.UNAUTHORIZED:
          statusCode = 401;
          errorCode = ErrorCode.UNAUTHORIZED;
          message = 'Unauthorized';
          break;
        case ErrorCode.FORBIDDEN:
          statusCode = 403;
          errorCode = ErrorCode.FORBIDDEN;
          message = 'Forbidden';
          break;
        case ErrorCode.NOT_FOUND:
          statusCode = 404;
          errorCode = ErrorCode.NOT_FOUND;
          message = 'Resource not found';
          break;
        case ErrorCode.ALREADY_EXISTS:
          statusCode = 409;
          errorCode = ErrorCode.ALREADY_EXISTS;
          message = 'Resource already exists';
          break;
        case ErrorCode.TOKEN_EXPIRED:
          statusCode = 401;
          errorCode = ErrorCode.TOKEN_EXPIRED;
          message = 'Token has expired';
          break;
        case ErrorCode.INVALID_TOKEN:
          statusCode = 401;
          errorCode = ErrorCode.INVALID_TOKEN;
          message = 'Invalid token';
          break;
        case ErrorCode.VALIDATION_ERROR:
          statusCode = 400;
          errorCode = ErrorCode.VALIDATION_ERROR;
          message = 'Validation error';
          break;
      }
    }

    res.status(statusCode).json({
      success: false,
      error: {
        code: errorCode,
        message,
      },
    });
  }
}
