/**
 * Unit Tests for RBAC Service
 */

import { RBACService, AccessContext } from '../../../src/services/rbac-service';

// Mock Redis
jest.mock('../../../src/services/redis', () => ({
  redis: {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    keys: jest.fn(),
    pipeline: jest.fn(() => ({
      exec: jest.fn(),
    })),
  },
}));

describe('RBACService', () => {
  let rbacService: RBACService;

  beforeEach(() => {
    rbacService = RBACService.getInstance();
    jest.clearAllMocks();
  });

  describe('checkAccess', () => {
    it('should allow access when user has required permission', async () => {
      // Mock user roles
      jest.spyOn(rbacService, 'getUserRoles').mockResolvedValue([
        {
          userId: 'user-123',
          roleId: 'org-admin',
          organizationId: 'org-456',
          assignedBy: 'system',
          assignedAt: new Date(),
        },
      ]);

      // Mock role with permissions
      jest.spyOn(rbacService, 'getRole').mockResolvedValue({
        id: 'org-admin',
        name: 'Organization Admin',
        description: 'Full access within organization',
        permissions: ['users:read', 'users:create', 'users:update'],
        isSystemRole: true,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Mock permission
      jest.spyOn(rbacService, 'getPermission').mockResolvedValue({
        id: 'users:read',
        name: 'Read Users',
        resource: 'users',
        action: 'read',
        description: 'View user information',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const context: AccessContext = {
        userId: 'user-123',
        organizationId: 'org-456',
        resource: 'users',
        action: 'read',
      };

      const result = await rbacService.checkAccess(context);

      expect(result.allowed).toBe(true);
      expect(result.userPermissions).toContain('users:read');
    });

    it('should deny access when user has no roles', async () => {
      jest.spyOn(rbacService, 'getUserRoles').mockResolvedValue([]);

      const context: AccessContext = {
        userId: 'user-123',
        organizationId: 'org-456',
        resource: 'users',
        action: 'read',
      };

      const result = await rbacService.checkAccess(context);

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('User has no roles assigned');
      expect(result.requiredPermissions).toContain('users:read');
    });

    it('should deny access when user lacks required permission', async () => {
      // Mock user roles
      jest.spyOn(rbacService, 'getUserRoles').mockResolvedValue([
        {
          userId: 'user-123',
          roleId: 'viewer',
          organizationId: 'org-456',
          assignedBy: 'admin',
          assignedAt: new Date(),
        },
      ]);

      // Mock role with limited permissions
      jest.spyOn(rbacService, 'getRole').mockResolvedValue({
        id: 'viewer',
        name: 'Viewer',
        description: 'Read-only access',
        permissions: ['users:read'],
        isSystemRole: true,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Mock permission
      jest.spyOn(rbacService, 'getPermission').mockResolvedValue({
        id: 'users:read',
        name: 'Read Users',
        resource: 'users',
        action: 'read',
        description: 'View user information',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const context: AccessContext = {
        userId: 'user-123',
        organizationId: 'org-456',
        resource: 'users',
        action: 'delete',
      };

      const result = await rbacService.checkAccess(context);

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Insufficient permissions');
      expect(result.requiredPermissions).toContain('users:delete');
    });

    it('should handle wildcard permissions correctly', async () => {
      // Mock user roles
      jest.spyOn(rbacService, 'getUserRoles').mockResolvedValue([
        {
          userId: 'user-123',
          roleId: 'super-admin',
          organizationId: 'org-456',
          assignedBy: 'system',
          assignedAt: new Date(),
        },
      ]);

      // Mock role with wildcard permissions
      jest.spyOn(rbacService, 'getRole').mockResolvedValue({
        id: 'super-admin',
        name: 'Super Admin',
        description: 'Full system access',
        permissions: ['admin:*'],
        isSystemRole: true,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Mock wildcard permission
      jest.spyOn(rbacService, 'getPermission').mockResolvedValue({
        id: 'admin:*',
        name: 'Full Admin Access',
        resource: '*',
        action: '*',
        description: 'Full administrative access',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const context: AccessContext = {
        userId: 'user-123',
        organizationId: 'org-456',
        resource: 'users',
        action: 'delete',
      };

      const result = await rbacService.checkAccess(context);

      expect(result.allowed).toBe(true);
      expect(result.userPermissions).toContain('*:*');
    });

    it('should enforce contextual access for user data', async () => {
      // Mock user roles
      jest.spyOn(rbacService, 'getUserRoles').mockResolvedValue([
        {
          userId: 'user-123',
          roleId: 'user',
          organizationId: 'org-456',
          assignedBy: 'admin',
          assignedAt: new Date(),
        },
      ]);

      // Mock role with user permissions
      jest.spyOn(rbacService, 'getRole').mockResolvedValue({
        id: 'user',
        name: 'User',
        description: 'Basic user access',
        permissions: ['user:read'],
        isSystemRole: true,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Mock permission
      jest.spyOn(rbacService, 'getPermission').mockResolvedValue({
        id: 'user:read',
        name: 'Read User',
        resource: 'user',
        action: 'read',
        description: 'View user information',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Test accessing own data (should be allowed)
      const ownDataContext: AccessContext = {
        userId: 'user-123',
        organizationId: 'org-456',
        resource: 'user',
        action: 'read',
        resourceId: 'user-123',
      };

      const ownDataResult = await rbacService.checkAccess(ownDataContext);
      expect(ownDataResult.allowed).toBe(true);

      // Test accessing other user's data (should be denied)
      const otherDataContext: AccessContext = {
        userId: 'user-123',
        organizationId: 'org-456',
        resource: 'user',
        action: 'read',
        resourceId: 'user-456',
      };

      const otherDataResult = await rbacService.checkAccess(otherDataContext);
      expect(otherDataResult.allowed).toBe(false);
      expect(otherDataResult.reason).toBe('Can only access own user data');
    });
  });

  describe('assignRole', () => {
    it('should assign role to user successfully', async () => {
      // Mock role exists
      jest.spyOn(rbacService, 'getRole').mockResolvedValue({
        id: 'user-manager',
        name: 'User Manager',
        description: 'Manage users',
        permissions: ['users:read', 'users:create'],
        isSystemRole: true,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await rbacService.assignRole(
        'user-123',
        'user-manager',
        'org-456',
        'admin-789'
      );

      expect(result).toBe(true);
    });

    it('should fail to assign non-existent role', async () => {
      // Mock role doesn't exist
      jest.spyOn(rbacService, 'getRole').mockResolvedValue(null);

      const result = await rbacService.assignRole(
        'user-123',
        'non-existent-role',
        'org-456',
        'admin-789'
      );

      expect(result).toBe(false);
    });

    it('should fail to assign role from different organization', async () => {
      // Mock role from different organization
      jest.spyOn(rbacService, 'getRole').mockResolvedValue({
        id: 'other-org-role',
        name: 'Other Org Role',
        description: 'Role from different org',
        organizationId: 'other-org',
        permissions: ['users:read'],
        isSystemRole: false,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await rbacService.assignRole(
        'user-123',
        'other-org-role',
        'org-456',
        'admin-789'
      );

      expect(result).toBe(false);
    });
  });

  describe('createRole', () => {
    it('should create custom role successfully', async () => {
      // Mock permissions exist
      jest.spyOn(rbacService, 'getPermission')
        .mockResolvedValueOnce({
          id: 'users:read',
          name: 'Read Users',
          resource: 'users',
          action: 'read',
          description: 'View user information',
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .mockResolvedValueOnce({
          id: 'users:update',
          name: 'Update Users',
          resource: 'users',
          action: 'update',
          description: 'Update user information',
          createdAt: new Date(),
          updatedAt: new Date(),
        });

      const role = await rbacService.createRole(
        'Custom Manager',
        'Custom role for managing specific resources',
        ['users:read', 'users:update'],
        'org-456',
        'admin-789'
      );

      expect(role).toBeTruthy();
      expect(role?.name).toBe('Custom Manager');
      expect(role?.permissions).toEqual(['users:read', 'users:update']);
      expect(role?.organizationId).toBe('org-456');
      expect(role?.isSystemRole).toBe(false);
    });

    it('should fail to create role with invalid permissions', async () => {
      // Mock permission doesn't exist
      jest.spyOn(rbacService, 'getPermission').mockResolvedValue(null);

      const role = await rbacService.createRole(
        'Invalid Role',
        'Role with invalid permissions',
        ['invalid:permission'],
        'org-456',
        'admin-789'
      );

      expect(role).toBeNull();
    });
  });

  describe('updateRole', () => {
    it('should update custom role successfully', async () => {
      // Mock existing role
      jest.spyOn(rbacService, 'getRole').mockResolvedValue({
        id: 'custom-role',
        name: 'Custom Role',
        description: 'Original description',
        organizationId: 'org-456',
        permissions: ['users:read'],
        isSystemRole: false,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Mock permission exists
      jest.spyOn(rbacService, 'getPermission').mockResolvedValue({
        id: 'users:update',
        name: 'Update Users',
        resource: 'users',
        action: 'update',
        description: 'Update user information',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const updatedRole = await rbacService.updateRole(
        'custom-role',
        {
          description: 'Updated description',
          permissions: ['users:read', 'users:update'],
        },
        'admin-789'
      );

      expect(updatedRole).toBeTruthy();
      expect(updatedRole?.description).toBe('Updated description');
      expect(updatedRole?.permissions).toEqual(['users:read', 'users:update']);
    });

    it('should fail to update system role', async () => {
      // Mock system role
      jest.spyOn(rbacService, 'getRole').mockResolvedValue({
        id: 'super-admin',
        name: 'Super Admin',
        description: 'System role',
        permissions: ['admin:*'],
        isSystemRole: true,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const updatedRole = await rbacService.updateRole(
        'super-admin',
        { description: 'Hacked description' },
        'hacker'
      );

      expect(updatedRole).toBeNull();
    });

    it('should fail to update non-existent role', async () => {
      // Mock role doesn't exist
      jest.spyOn(rbacService, 'getRole').mockResolvedValue(null);

      const updatedRole = await rbacService.updateRole(
        'non-existent',
        { description: 'New description' },
        'admin-789'
      );

      expect(updatedRole).toBeNull();
    });
  });

  describe('removeRole', () => {
    it('should remove role from user successfully', async () => {
      const result = await rbacService.removeRole(
        'user-123',
        'user-manager',
        'org-456',
        'admin-789'
      );

      expect(result).toBe(true);
    });
  });

  describe('clearCache', () => {
    it('should clear all caches', () => {
      expect(() => rbacService.clearCache()).not.toThrow();
    });
  });
});
