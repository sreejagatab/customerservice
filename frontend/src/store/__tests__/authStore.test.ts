import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAuthStore } from '../authStore';
import { authService } from '@/services/authService';
import { tokenStorage } from '@/utils/tokenStorage';

// Mock dependencies
vi.mock('@/services/authService');
vi.mock('@/utils/tokenStorage');

const mockAuthService = vi.mocked(authService);
const mockTokenStorage = vi.mocked(tokenStorage);

describe('authStore', () => {
  beforeEach(() => {
    // Reset store state
    useAuthStore.setState({
      user: null,
      organization: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
    });
    
    // Clear all mocks
    vi.clearAllMocks();
  });

  describe('login', () => {
    it('should login successfully', async () => {
      const mockResponse = {
        user: { id: '1', email: 'test@example.com', firstName: 'Test', lastName: 'User' },
        organization: { id: '1', name: 'Test Org' },
        tokens: {
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
          expiresIn: 3600,
        },
      };

      mockAuthService.login.mockResolvedValue(mockResponse);

      const { login } = useAuthStore.getState();
      await login('test@example.com', 'password');

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(true);
      expect(state.user).toEqual(mockResponse.user);
      expect(state.organization).toEqual(mockResponse.organization);
      expect(state.error).toBe(null);
      expect(mockTokenStorage.setTokens).toHaveBeenCalledWith(mockResponse.tokens);
    });

    it('should handle MFA requirement', async () => {
      mockAuthService.login.mockResolvedValue({ requiresMfa: true });

      const { login } = useAuthStore.getState();
      
      await expect(login('test@example.com', 'password')).rejects.toThrow('MFA_REQUIRED');
      
      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.isLoading).toBe(false);
    });

    it('should handle login failure', async () => {
      mockAuthService.login.mockRejectedValue(new Error('Invalid credentials'));

      const { login } = useAuthStore.getState();
      
      await expect(login('test@example.com', 'wrong-password')).rejects.toThrow('Invalid credentials');
      
      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.error).toBe('Invalid credentials');
      expect(state.user).toBe(null);
    });
  });

  describe('logout', () => {
    it('should logout successfully', async () => {
      // Set initial authenticated state
      useAuthStore.setState({
        user: { id: '1', email: 'test@example.com' },
        organization: { id: '1', name: 'Test Org' },
        isAuthenticated: true,
      });

      mockAuthService.logout.mockResolvedValue();

      const { logout } = useAuthStore.getState();
      await logout();

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.user).toBe(null);
      expect(state.organization).toBe(null);
      expect(mockTokenStorage.clearTokens).toHaveBeenCalled();
    });

    it('should clear state even if API call fails', async () => {
      useAuthStore.setState({
        user: { id: '1', email: 'test@example.com' },
        isAuthenticated: true,
      });

      mockAuthService.logout.mockRejectedValue(new Error('Network error'));

      const { logout } = useAuthStore.getState();
      await logout();

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.user).toBe(null);
      expect(mockTokenStorage.clearTokens).toHaveBeenCalled();
    });
  });

  describe('register', () => {
    it('should register successfully', async () => {
      const mockResponse = {
        user: { id: '1', email: 'new@example.com', firstName: 'New', lastName: 'User' },
        organization: { id: '1', name: 'New Org' },
        tokens: {
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
          expiresIn: 3600,
        },
      };

      mockAuthService.register.mockResolvedValue(mockResponse);

      const { register } = useAuthStore.getState();
      await register({
        email: 'new@example.com',
        password: 'password',
        firstName: 'New',
        lastName: 'User',
        organizationName: 'New Org',
      });

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(true);
      expect(state.user).toEqual(mockResponse.user);
      expect(state.organization).toEqual(mockResponse.organization);
      expect(mockTokenStorage.setTokens).toHaveBeenCalledWith(mockResponse.tokens);
    });

    it('should handle registration failure', async () => {
      mockAuthService.register.mockRejectedValue(new Error('Email already exists'));

      const { register } = useAuthStore.getState();
      
      await expect(register({
        email: 'existing@example.com',
        password: 'password',
        firstName: 'Test',
        lastName: 'User',
        organizationName: 'Test Org',
      })).rejects.toThrow('Email already exists');
      
      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.error).toBe('Email already exists');
    });
  });

  describe('refreshToken', () => {
    it('should refresh token successfully', async () => {
      mockTokenStorage.getRefreshToken.mockReturnValue('refresh-token');
      mockAuthService.refreshToken.mockResolvedValue({
        accessToken: 'new-access-token',
        expiresIn: 3600,
      });

      const { refreshToken } = useAuthStore.getState();
      await refreshToken();

      expect(mockTokenStorage.setTokens).toHaveBeenCalledWith({
        accessToken: 'new-access-token',
        refreshToken: 'refresh-token',
        expiresIn: 3600,
      });
    });

    it('should handle refresh failure', async () => {
      mockTokenStorage.getRefreshToken.mockReturnValue('invalid-token');
      mockAuthService.refreshToken.mockRejectedValue(new Error('Invalid refresh token'));

      const { refreshToken } = useAuthStore.getState();
      
      await expect(refreshToken()).rejects.toThrow('Invalid refresh token');
      
      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(mockTokenStorage.clearTokens).toHaveBeenCalled();
    });
  });

  describe('initialize', () => {
    it('should initialize with valid tokens', async () => {
      mockTokenStorage.getAccessToken.mockReturnValue('access-token');
      mockTokenStorage.getRefreshToken.mockReturnValue('refresh-token');
      mockTokenStorage.isTokenExpired.mockReturnValue(false);
      mockAuthService.getProfile.mockResolvedValue({
        user: { id: '1', email: 'test@example.com' },
        organization: { id: '1', name: 'Test Org' },
      });

      const { initialize } = useAuthStore.getState();
      await initialize();

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(true);
      expect(state.isLoading).toBe(false);
    });

    it('should handle missing tokens', async () => {
      mockTokenStorage.getAccessToken.mockReturnValue(null);
      mockTokenStorage.getRefreshToken.mockReturnValue(null);

      const { initialize } = useAuthStore.getState();
      await initialize();

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.isLoading).toBe(false);
    });
  });

  describe('updateProfile', () => {
    it('should update profile successfully', async () => {
      const updatedUser = { id: '1', email: 'updated@example.com', firstName: 'Updated' };
      mockAuthService.updateProfile.mockResolvedValue(updatedUser);

      const { updateProfile } = useAuthStore.getState();
      await updateProfile({ firstName: 'Updated' });

      const state = useAuthStore.getState();
      expect(state.user).toEqual(updatedUser);
      expect(state.error).toBe(null);
    });
  });

  describe('utility functions', () => {
    it('should clear error', () => {
      useAuthStore.setState({ error: 'Some error' });
      
      const { clearError } = useAuthStore.getState();
      clearError();
      
      expect(useAuthStore.getState().error).toBe(null);
    });

    it('should set loading state', () => {
      const { setLoading } = useAuthStore.getState();
      setLoading(true);
      
      expect(useAuthStore.getState().isLoading).toBe(true);
    });
  });
});
