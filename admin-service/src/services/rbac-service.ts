/**
 * Role-Based Access Control (RBAC) Service
 * Manages permissions, roles, and access control for the admin system
 */

import { config } from '@/config';
import { logger } from '@/utils/logger';
import { redis } from '@/services/redis';

export interface Permission {
  id: string;
  name: string;
  resource: string;
  action: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Role {
  id: string;
  name: string;
  description: string;
  organizationId?: string; // null for system roles
  permissions: string[]; // Permission IDs
  isSystemRole: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserRole {
  userId: string;
  roleId: string;
  organizationId: string;
  assignedBy: string;
  assignedAt: Date;
  expiresAt?: Date;
}

export interface AccessContext {
  userId: string;
  organizationId: string;
  resource: string;
  action: string;
  resourceId?: string;
  metadata?: Record<string, any>;
}

export interface AccessResult {
  allowed: boolean;
  reason?: string;
  requiredPermissions?: string[];
  userPermissions?: string[];
}

export class RBACService {
  private static instance: RBACService;
  private permissionsCache: Map<string, Permission> = new Map();
  private rolesCache: Map<string, Role> = new Map();
  private userRolesCache: Map<string, UserRole[]> = new Map();

  private constructor() {
    this.initializeSystemPermissions();
    this.initializeSystemRoles();
  }

  public static getInstance(): RBACService {
    if (!RBACService.instance) {
      RBACService.instance = new RBACService();
    }
    return RBACService.instance;
  }

  /**
   * Check if user has access to perform an action
   */
  public async checkAccess(context: AccessContext): Promise<AccessResult> {
    try {
      // Get user roles
      const userRoles = await this.getUserRoles(context.userId, context.organizationId);
      
      if (userRoles.length === 0) {
        return {
          allowed: false,
          reason: 'User has no roles assigned',
          requiredPermissions: [`${context.resource}:${context.action}`],
          userPermissions: [],
        };
      }

      // Get all permissions for user roles
      const userPermissions = await this.getUserPermissions(userRoles);
      
      // Check if user has required permission
      const requiredPermission = `${context.resource}:${context.action}`;
      const hasPermission = userPermissions.some(permission => 
        this.matchesPermission(permission, context.resource, context.action)
      );

      if (hasPermission) {
        // Additional context-specific checks
        const contextCheck = await this.checkContextualAccess(context, userRoles);
        if (!contextCheck.allowed) {
          return contextCheck;
        }

        return {
          allowed: true,
          userPermissions: userPermissions.map(p => `${p.resource}:${p.action}`),
        };
      }

      return {
        allowed: false,
        reason: 'Insufficient permissions',
        requiredPermissions: [requiredPermission],
        userPermissions: userPermissions.map(p => `${p.resource}:${p.action}`),
      };
    } catch (error) {
      logger.error('Error checking access', {
        context,
        error: error instanceof Error ? error.message : String(error),
      });
      
      return {
        allowed: false,
        reason: 'Error checking permissions',
      };
    }
  }

  /**
   * Get user roles
   */
  public async getUserRoles(userId: string, organizationId: string): Promise<UserRole[]> {
    try {
      const cacheKey = `user_roles:${userId}:${organizationId}`;
      
      // Check cache first
      let userRoles = this.userRolesCache.get(cacheKey);
      if (userRoles) {
        return userRoles.filter(role => !role.expiresAt || role.expiresAt > new Date());
      }

      // TODO: Load from database
      // For now, return empty array
      userRoles = [];
      
      // Cache for 5 minutes
      this.userRolesCache.set(cacheKey, userRoles);
      setTimeout(() => this.userRolesCache.delete(cacheKey), 5 * 60 * 1000);

      return userRoles;
    } catch (error) {
      logger.error('Error getting user roles', {
        userId,
        organizationId,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Assign role to user
   */
  public async assignRole(
    userId: string,
    roleId: string,
    organizationId: string,
    assignedBy: string,
    expiresAt?: Date
  ): Promise<boolean> {
    try {
      // Validate role exists
      const role = await this.getRole(roleId);
      if (!role) {
        throw new Error('Role not found');
      }

      // Check if role is for the correct organization
      if (role.organizationId && role.organizationId !== organizationId) {
        throw new Error('Role does not belong to organization');
      }

      // TODO: Save to database
      const userRole: UserRole = {
        userId,
        roleId,
        organizationId,
        assignedBy,
        assignedAt: new Date(),
        expiresAt,
      };

      // Clear cache
      const cacheKey = `user_roles:${userId}:${organizationId}`;
      this.userRolesCache.delete(cacheKey);

      logger.info('Role assigned to user', {
        userId,
        roleId,
        organizationId,
        assignedBy,
        expiresAt,
      });

      return true;
    } catch (error) {
      logger.error('Error assigning role', {
        userId,
        roleId,
        organizationId,
        assignedBy,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Remove role from user
   */
  public async removeRole(
    userId: string,
    roleId: string,
    organizationId: string,
    removedBy: string
  ): Promise<boolean> {
    try {
      // TODO: Remove from database
      
      // Clear cache
      const cacheKey = `user_roles:${userId}:${organizationId}`;
      this.userRolesCache.delete(cacheKey);

      logger.info('Role removed from user', {
        userId,
        roleId,
        organizationId,
        removedBy,
      });

      return true;
    } catch (error) {
      logger.error('Error removing role', {
        userId,
        roleId,
        organizationId,
        removedBy,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Create custom role
   */
  public async createRole(
    name: string,
    description: string,
    permissions: string[],
    organizationId?: string,
    createdBy?: string
  ): Promise<Role | null> {
    try {
      // Validate permissions exist
      for (const permissionId of permissions) {
        const permission = await this.getPermission(permissionId);
        if (!permission) {
          throw new Error(`Permission not found: ${permissionId}`);
        }
      }

      const role: Role = {
        id: this.generateId(),
        name,
        description,
        organizationId,
        permissions,
        isSystemRole: false,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // TODO: Save to database
      
      // Cache the role
      this.rolesCache.set(role.id, role);

      logger.info('Role created', {
        roleId: role.id,
        name,
        organizationId,
        createdBy,
        permissionCount: permissions.length,
      });

      return role;
    } catch (error) {
      logger.error('Error creating role', {
        name,
        organizationId,
        createdBy,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Update role
   */
  public async updateRole(
    roleId: string,
    updates: Partial<Pick<Role, 'name' | 'description' | 'permissions' | 'isActive'>>,
    updatedBy: string
  ): Promise<Role | null> {
    try {
      const role = await this.getRole(roleId);
      if (!role) {
        throw new Error('Role not found');
      }

      if (role.isSystemRole) {
        throw new Error('Cannot update system role');
      }

      // Validate permissions if being updated
      if (updates.permissions) {
        for (const permissionId of updates.permissions) {
          const permission = await this.getPermission(permissionId);
          if (!permission) {
            throw new Error(`Permission not found: ${permissionId}`);
          }
        }
      }

      const updatedRole: Role = {
        ...role,
        ...updates,
        updatedAt: new Date(),
      };

      // TODO: Save to database
      
      // Update cache
      this.rolesCache.set(roleId, updatedRole);

      logger.info('Role updated', {
        roleId,
        updates,
        updatedBy,
      });

      return updatedRole;
    } catch (error) {
      logger.error('Error updating role', {
        roleId,
        updates,
        updatedBy,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Get role by ID
   */
  public async getRole(roleId: string): Promise<Role | null> {
    try {
      // Check cache first
      let role = this.rolesCache.get(roleId);
      if (role) {
        return role;
      }

      // TODO: Load from database
      
      return null;
    } catch (error) {
      logger.error('Error getting role', {
        roleId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Get permission by ID
   */
  public async getPermission(permissionId: string): Promise<Permission | null> {
    try {
      // Check cache first
      let permission = this.permissionsCache.get(permissionId);
      if (permission) {
        return permission;
      }

      // TODO: Load from database
      
      return null;
    } catch (error) {
      logger.error('Error getting permission', {
        permissionId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Get user permissions from roles
   */
  private async getUserPermissions(userRoles: UserRole[]): Promise<Permission[]> {
    const permissions: Permission[] = [];
    const permissionIds = new Set<string>();

    for (const userRole of userRoles) {
      const role = await this.getRole(userRole.roleId);
      if (role && role.isActive) {
        for (const permissionId of role.permissions) {
          if (!permissionIds.has(permissionId)) {
            const permission = await this.getPermission(permissionId);
            if (permission) {
              permissions.push(permission);
              permissionIds.add(permissionId);
            }
          }
        }
      }
    }

    return permissions;
  }

  /**
   * Check if permission matches resource and action
   */
  private matchesPermission(permission: Permission, resource: string, action: string): boolean {
    // Exact match
    if (permission.resource === resource && permission.action === action) {
      return true;
    }

    // Wildcard matches
    if (permission.resource === '*' && permission.action === action) {
      return true;
    }

    if (permission.resource === resource && permission.action === '*') {
      return true;
    }

    if (permission.resource === '*' && permission.action === '*') {
      return true;
    }

    // Hierarchical resource matching (e.g., "users:*" matches "users:profile")
    if (permission.resource.endsWith(':*') && resource.startsWith(permission.resource.slice(0, -1))) {
      return permission.action === action || permission.action === '*';
    }

    return false;
  }

  /**
   * Check contextual access (e.g., user can only access their own data)
   */
  private async checkContextualAccess(context: AccessContext, userRoles: UserRole[]): Promise<AccessResult> {
    // Resource ownership checks
    if (context.resource === 'user' && context.resourceId) {
      // Users can access their own data
      if (context.resourceId === context.userId) {
        return { allowed: true };
      }

      // Check if user has admin role
      const hasAdminRole = userRoles.some(role => 
        this.rolesCache.get(role.roleId)?.name === 'admin'
      );

      if (!hasAdminRole) {
        return {
          allowed: false,
          reason: 'Can only access own user data',
        };
      }
    }

    // Organization-specific checks
    if (context.metadata?.targetOrganizationId) {
      if (context.metadata.targetOrganizationId !== context.organizationId) {
        return {
          allowed: false,
          reason: 'Cannot access data from different organization',
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Initialize system permissions
   */
  private initializeSystemPermissions(): void {
    const systemPermissions: Omit<Permission, 'createdAt' | 'updatedAt'>[] = [
      // User management
      { id: 'users:create', name: 'Create Users', resource: 'users', action: 'create', description: 'Create new users' },
      { id: 'users:read', name: 'Read Users', resource: 'users', action: 'read', description: 'View user information' },
      { id: 'users:update', name: 'Update Users', resource: 'users', action: 'update', description: 'Update user information' },
      { id: 'users:delete', name: 'Delete Users', resource: 'users', action: 'delete', description: 'Delete users' },
      
      // Organization management
      { id: 'organizations:create', name: 'Create Organizations', resource: 'organizations', action: 'create', description: 'Create new organizations' },
      { id: 'organizations:read', name: 'Read Organizations', resource: 'organizations', action: 'read', description: 'View organization information' },
      { id: 'organizations:update', name: 'Update Organizations', resource: 'organizations', action: 'update', description: 'Update organization settings' },
      { id: 'organizations:delete', name: 'Delete Organizations', resource: 'organizations', action: 'delete', description: 'Delete organizations' },
      
      // Role management
      { id: 'roles:create', name: 'Create Roles', resource: 'roles', action: 'create', description: 'Create custom roles' },
      { id: 'roles:read', name: 'Read Roles', resource: 'roles', action: 'read', description: 'View roles and permissions' },
      { id: 'roles:update', name: 'Update Roles', resource: 'roles', action: 'update', description: 'Update role permissions' },
      { id: 'roles:delete', name: 'Delete Roles', resource: 'roles', action: 'delete', description: 'Delete custom roles' },
      { id: 'roles:assign', name: 'Assign Roles', resource: 'roles', action: 'assign', description: 'Assign roles to users' },
      
      // Configuration management
      { id: 'config:read', name: 'Read Configuration', resource: 'config', action: 'read', description: 'View system configuration' },
      { id: 'config:update', name: 'Update Configuration', resource: 'config', action: 'update', description: 'Update system configuration' },
      
      // Audit logs
      { id: 'audit:read', name: 'Read Audit Logs', resource: 'audit', action: 'read', description: 'View audit logs' },
      
      // System administration
      { id: 'system:monitor', name: 'Monitor System', resource: 'system', action: 'monitor', description: 'Monitor system health and performance' },
      { id: 'system:backup', name: 'System Backup', resource: 'system', action: 'backup', description: 'Create and manage system backups' },
      { id: 'system:maintenance', name: 'System Maintenance', resource: 'system', action: 'maintenance', description: 'Perform system maintenance tasks' },
      
      // Wildcard permissions
      { id: 'admin:*', name: 'Full Admin Access', resource: '*', action: '*', description: 'Full administrative access to all resources' },
    ];

    for (const permission of systemPermissions) {
      this.permissionsCache.set(permission.id, {
        ...permission,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    logger.info('System permissions initialized', { count: systemPermissions.length });
  }

  /**
   * Initialize system roles
   */
  private initializeSystemRoles(): void {
    const systemRoles: Omit<Role, 'createdAt' | 'updatedAt'>[] = [
      {
        id: 'super-admin',
        name: 'Super Admin',
        description: 'Full system access across all organizations',
        organizationId: undefined,
        permissions: ['admin:*'],
        isSystemRole: true,
        isActive: true,
      },
      {
        id: 'org-admin',
        name: 'Organization Admin',
        description: 'Full access within organization',
        organizationId: undefined, // Will be set per organization
        permissions: [
          'users:create', 'users:read', 'users:update', 'users:delete',
          'organizations:read', 'organizations:update',
          'roles:create', 'roles:read', 'roles:update', 'roles:delete', 'roles:assign',
          'config:read', 'config:update',
          'audit:read',
        ],
        isSystemRole: true,
        isActive: true,
      },
      {
        id: 'user-manager',
        name: 'User Manager',
        description: 'Manage users within organization',
        organizationId: undefined,
        permissions: [
          'users:create', 'users:read', 'users:update',
          'roles:read', 'roles:assign',
        ],
        isSystemRole: true,
        isActive: true,
      },
      {
        id: 'viewer',
        name: 'Viewer',
        description: 'Read-only access to organization data',
        organizationId: undefined,
        permissions: [
          'users:read',
          'organizations:read',
          'roles:read',
          'config:read',
          'audit:read',
        ],
        isSystemRole: true,
        isActive: true,
      },
    ];

    for (const role of systemRoles) {
      this.rolesCache.set(role.id, {
        ...role,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    logger.info('System roles initialized', { count: systemRoles.length });
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `rbac_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Clear all caches
   */
  public clearCache(): void {
    this.permissionsCache.clear();
    this.rolesCache.clear();
    this.userRolesCache.clear();
    logger.info('RBAC cache cleared');
  }
}

// Export singleton instance
export const rbacService = RBACService.getInstance();
