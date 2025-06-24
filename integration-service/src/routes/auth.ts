/**
 * Authentication routes for OAuth integrations
 */

import { Router, Request, Response } from 'express';
import { google } from 'googleapis';
import axios from 'axios';
import { asyncHandler } from '../middleware/error-handler';
import { authRateLimiter } from '../middleware/rate-limiter';
import { config } from '../config';
import { authLogger } from '../utils/logger';
import { IntegrationError } from '../middleware/error-handler';

const router = Router();

// Apply auth rate limiting to all routes
router.use(authRateLimiter);

// Google OAuth2 routes
router.get('/google/authorize',
  asyncHandler(async (req: Request, res: Response) => {
    const { state, organizationId } = req.query;

    if (!organizationId) {
      return res.status(400).json({
        success: false,
        error: 'Organization ID is required',
      });
    }

    const oauth2Client = new google.auth.OAuth2(
      config.google.clientId,
      config.google.clientSecret,
      config.google.redirectUri
    );

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: config.google.scopes,
      state: JSON.stringify({ organizationId, customState: state }),
      prompt: 'consent', // Force consent to get refresh token
    });

    authLogger.info('Google OAuth authorization initiated', {
      organizationId,
      state,
    });

    res.json({
      success: true,
      data: {
        authUrl,
        provider: 'google',
        scopes: config.google.scopes,
      },
    });
  })
);

router.get('/google/callback',
  asyncHandler(async (req: Request, res: Response) => {
    const { code, state, error } = req.query;

    if (error) {
      authLogger.warn('Google OAuth error:', { error });
      return res.status(400).json({
        success: false,
        error: `OAuth error: ${error}`,
      });
    }

    if (!code) {
      return res.status(400).json({
        success: false,
        error: 'Authorization code is required',
      });
    }

    try {
      const stateData = state ? JSON.parse(state as string) : {};
      const { organizationId } = stateData;

      const oauth2Client = new google.auth.OAuth2(
        config.google.clientId,
        config.google.clientSecret,
        config.google.redirectUri
      );

      // Exchange code for tokens
      const { tokens } = await oauth2Client.getToken(code as string);
      
      if (!tokens.access_token) {
        throw new IntegrationError('Failed to obtain access token');
      }

      // Get user profile
      oauth2Client.setCredentials(tokens);
      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
      const profile = await gmail.users.getProfile({ userId: 'me' });

      authLogger.info('Google OAuth completed successfully', {
        organizationId,
        email: profile.data.emailAddress,
      });

      res.json({
        success: true,
        data: {
          provider: 'google',
          credentials: {
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
          },
          profile: {
            email: profile.data.emailAddress,
            messagesTotal: profile.data.messagesTotal,
            threadsTotal: profile.data.threadsTotal,
          },
          organizationId,
        },
      });
    } catch (error: any) {
      authLogger.error('Google OAuth callback error:', error);
      res.status(400).json({
        success: false,
        error: `OAuth callback failed: ${error.message}`,
      });
    }
  })
);

// Microsoft OAuth2 routes
router.get('/microsoft/authorize',
  asyncHandler(async (req: Request, res: Response) => {
    const { state, organizationId } = req.query;

    if (!organizationId) {
      return res.status(400).json({
        success: false,
        error: 'Organization ID is required',
      });
    }

    const authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?` +
      `client_id=${config.microsoft.clientId}&` +
      `response_type=code&` +
      `redirect_uri=${encodeURIComponent(config.microsoft.redirectUri)}&` +
      `scope=${encodeURIComponent(config.microsoft.scopes.join(' '))}&` +
      `state=${encodeURIComponent(JSON.stringify({ organizationId, customState: state }))}&` +
      `response_mode=query&` +
      `prompt=consent`;

    authLogger.info('Microsoft OAuth authorization initiated', {
      organizationId,
      state,
    });

    res.json({
      success: true,
      data: {
        authUrl,
        provider: 'microsoft',
        scopes: config.microsoft.scopes,
      },
    });
  })
);

router.get('/microsoft/callback',
  asyncHandler(async (req: Request, res: Response) => {
    const { code, state, error, error_description } = req.query;

    if (error) {
      authLogger.warn('Microsoft OAuth error:', { error, error_description });
      return res.status(400).json({
        success: false,
        error: `OAuth error: ${error} - ${error_description}`,
      });
    }

    if (!code) {
      return res.status(400).json({
        success: false,
        error: 'Authorization code is required',
      });
    }

    try {
      const stateData = state ? JSON.parse(state as string) : {};
      const { organizationId } = stateData;

      // Exchange code for tokens
      const tokenResponse = await axios.post('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
        client_id: config.microsoft.clientId,
        client_secret: config.microsoft.clientSecret,
        code,
        redirect_uri: config.microsoft.redirectUri,
        grant_type: 'authorization_code',
        scope: config.microsoft.scopes.join(' '),
      }, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      const tokens = tokenResponse.data;

      // Get user profile
      const profileResponse = await axios.get('https://graph.microsoft.com/v1.0/me', {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
        },
      });

      const profile = profileResponse.data;

      authLogger.info('Microsoft OAuth completed successfully', {
        organizationId,
        email: profile.mail || profile.userPrincipalName,
      });

      res.json({
        success: true,
        data: {
          provider: 'microsoft',
          credentials: {
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            expiresAt: new Date(Date.now() + (tokens.expires_in * 1000)),
          },
          profile: {
            email: profile.mail || profile.userPrincipalName,
            displayName: profile.displayName,
            id: profile.id,
          },
          organizationId,
        },
      });
    } catch (error: any) {
      authLogger.error('Microsoft OAuth callback error:', error);
      res.status(400).json({
        success: false,
        error: `OAuth callback failed: ${error.message}`,
      });
    }
  })
);

// Token refresh endpoints
router.post('/google/refresh',
  asyncHandler(async (req: Request, res: Response) => {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        error: 'Refresh token is required',
      });
    }

    try {
      const oauth2Client = new google.auth.OAuth2(
        config.google.clientId,
        config.google.clientSecret,
        config.google.redirectUri
      );

      oauth2Client.setCredentials({ refresh_token: refreshToken });
      const { credentials } = await oauth2Client.refreshAccessToken();

      res.json({
        success: true,
        data: {
          accessToken: credentials.access_token,
          refreshToken: credentials.refresh_token || refreshToken,
          expiresAt: credentials.expiry_date ? new Date(credentials.expiry_date) : undefined,
        },
      });
    } catch (error: any) {
      authLogger.error('Google token refresh error:', error);
      res.status(400).json({
        success: false,
        error: `Token refresh failed: ${error.message}`,
      });
    }
  })
);

router.post('/microsoft/refresh',
  asyncHandler(async (req: Request, res: Response) => {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        error: 'Refresh token is required',
      });
    }

    try {
      const response = await axios.post('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
        client_id: config.microsoft.clientId,
        client_secret: config.microsoft.clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
        scope: config.microsoft.scopes.join(' '),
      }, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      const tokens = response.data;

      res.json({
        success: true,
        data: {
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token || refreshToken,
          expiresAt: new Date(Date.now() + (tokens.expires_in * 1000)),
        },
      });
    } catch (error: any) {
      authLogger.error('Microsoft token refresh error:', error);
      res.status(400).json({
        success: false,
        error: `Token refresh failed: ${error.message}`,
      });
    }
  })
);

// Revoke token endpoints
router.post('/google/revoke',
  asyncHandler(async (req: Request, res: Response) => {
    const { accessToken } = req.body;

    if (!accessToken) {
      return res.status(400).json({
        success: false,
        error: 'Access token is required',
      });
    }

    try {
      await axios.post(`https://oauth2.googleapis.com/revoke?token=${accessToken}`);
      
      res.json({
        success: true,
        message: 'Token revoked successfully',
      });
    } catch (error: any) {
      authLogger.error('Google token revoke error:', error);
      res.status(400).json({
        success: false,
        error: `Token revoke failed: ${error.message}`,
      });
    }
  })
);

export default router;
