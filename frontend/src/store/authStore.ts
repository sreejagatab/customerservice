import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { User, Organization } from '@universal-ai-cs/shared';
import { authService } from '@/services/authService';
import { tokenStorage } from '@/utils/tokenStorage';

export interface AuthState {
  // State
  user: User | null;
  organization: Organization | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions
  login: (email: string, password: string, mfaCode?: string) => Promise<void>;
  logout: () => Promise<void>;
  register: (data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    organizationName: string;
    plan?: string;
  }) => Promise<void>;
  refreshToken: () => Promise<void>;
  updateProfile: (data: Partial<User>) => Promise<void>;
  clearError: () => void;
  initialize: () => Promise<void>;
  setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      // Initial state
      user: null,
      organization: null,
      isAuthenticated: false,
      isLoading: true,
      error: null,

      // Actions
      login: async (email: string, password: string, mfaCode?: string) => {
        try {
          set({ isLoading: true, error: null });

          const response = await authService.login({
            email,
            password,
            mfaCode,
          });

          if (response.requiresMfa) {
            // MFA required - don't set authenticated state yet
            set({
              isLoading: false,
              error: null,
            });
            throw new Error('MFA_REQUIRED');
          }

          // Store tokens
          tokenStorage.setTokens({
            accessToken: response.tokens.accessToken,
            refreshToken: response.tokens.refreshToken,
            expiresIn: response.tokens.expiresIn,
          });

          set({
            user: response.user,
            organization: response.organization,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Login failed';
          set({
            isLoading: false,
            error: errorMessage,
            isAuthenticated: false,
            user: null,
            organization: null,
          });
          throw error;
        }
      },

      logout: async () => {
        try {
          set({ isLoading: true });

          // Call logout API to invalidate tokens on server
          await authService.logout();
        } catch (error) {
          console.error('Logout error:', error);
        } finally {
          // Clear local state regardless of API call result
          tokenStorage.clearTokens();
          set({
            user: null,
            organization: null,
            isAuthenticated: false,
            isLoading: false,
            error: null,
          });
        }
      },

      register: async (data) => {
        try {
          set({ isLoading: true, error: null });

          const response = await authService.register(data);

          // Store tokens
          tokenStorage.setTokens({
            accessToken: response.tokens.accessToken,
            refreshToken: response.tokens.refreshToken,
            expiresIn: response.tokens.expiresIn,
          });

          set({
            user: response.user,
            organization: response.organization,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Registration failed';
          set({
            isLoading: false,
            error: errorMessage,
          });
          throw error;
        }
      },

      refreshToken: async () => {
        try {
          const refreshToken = tokenStorage.getRefreshToken();
          if (!refreshToken) {
            throw new Error('No refresh token available');
          }

          const response = await authService.refreshToken(refreshToken);

          // Update tokens
          tokenStorage.setTokens({
            accessToken: response.accessToken,
            refreshToken: refreshToken, // Keep existing refresh token
            expiresIn: response.expiresIn,
          });

          // Token refresh successful - user is still authenticated
          set({ error: null });
        } catch (error) {
          console.error('Token refresh failed:', error);
          
          // Clear tokens and logout user
          tokenStorage.clearTokens();
          set({
            user: null,
            organization: null,
            isAuthenticated: false,
            error: 'Session expired. Please login again.',
          });
          
          throw error;
        }
      },

      updateProfile: async (data) => {
        try {
          set({ isLoading: true, error: null });

          const updatedUser = await authService.updateProfile(data);

          set({
            user: updatedUser,
            isLoading: false,
            error: null,
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Profile update failed';
          set({
            isLoading: false,
            error: errorMessage,
          });
          throw error;
        }
      },

      clearError: () => {
        set({ error: null });
      },

      setLoading: (loading: boolean) => {
        set({ isLoading: loading });
      },

      initialize: async () => {
        try {
          set({ isLoading: true });

          const accessToken = tokenStorage.getAccessToken();
          const refreshToken = tokenStorage.getRefreshToken();

          if (!accessToken || !refreshToken) {
            set({
              isAuthenticated: false,
              isLoading: false,
              user: null,
              organization: null,
            });
            return;
          }

          // Check if token is expired
          if (tokenStorage.isTokenExpired()) {
            try {
              await get().refreshToken();
            } catch (error) {
              // Refresh failed, user needs to login again
              set({
                isAuthenticated: false,
                isLoading: false,
                user: null,
                organization: null,
              });
              return;
            }
          }

          // Get user profile to verify token is still valid
          try {
            const profile = await authService.getProfile();
            set({
              user: profile.user,
              organization: profile.organization,
              isAuthenticated: true,
              isLoading: false,
              error: null,
            });
          } catch (error) {
            // Profile fetch failed, clear auth state
            tokenStorage.clearTokens();
            set({
              isAuthenticated: false,
              isLoading: false,
              user: null,
              organization: null,
              error: null,
            });
          }
        } catch (error) {
          console.error('Auth initialization error:', error);
          set({
            isAuthenticated: false,
            isLoading: false,
            user: null,
            organization: null,
            error: null,
          });
        }
      },
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        // Only persist user and organization data
        // Tokens are handled separately by tokenStorage
        user: state.user,
        organization: state.organization,
        isAuthenticated: state.isAuthenticated,
      }),
      onRehydrateStorage: () => (state) => {
        // After rehydration, verify the auth state
        if (state) {
          const hasTokens = tokenStorage.getAccessToken() && tokenStorage.getRefreshToken();
          if (!hasTokens && state.isAuthenticated) {
            // Tokens missing but state says authenticated - clear state
            state.isAuthenticated = false;
            state.user = null;
            state.organization = null;
          }
        }
      },
    }
  )
);
