/**
 * API Versioning Service
 * Handles API version management, routing, and backward compatibility
 */

import { Request, Response, NextFunction } from 'express';
import { Logger } from '@universal-ai-cs/shared';
import { ServiceRegistry } from './service-registry';

export interface ApiVersion {
  version: string;
  status: 'active' | 'deprecated' | 'sunset';
  releaseDate: Date;
  deprecationDate?: Date;
  sunsetDate?: Date;
  supportedUntil?: Date;
  breaking: boolean;
  changelog: string[];
  migration?: {
    guide: string;
    tools: string[];
    examples: Record<string, any>;
  };
}

export interface VersionRoute {
  path: string;
  method: string;
  versions: {
    [version: string]: {
      service: string;
      endpoint: string;
      transformer?: string; // Function to transform request/response
      deprecated?: boolean;
      sunset?: boolean;
    };
  };
}

export interface VersioningConfig {
  defaultVersion: string;
  supportedVersions: string[];
  versionHeader: string;
  versionParam: string;
  versionPrefix: string;
  deprecationWarnings: boolean;
  sunsetWarnings: boolean;
}

export class ApiVersioningService {
  private logger: Logger;
  private serviceRegistry: ServiceRegistry;
  private config: VersioningConfig;
  private versions: Map<string, ApiVersion> = new Map();
  private routes: Map<string, VersionRoute> = new Map();
  private transformers: Map<string, Function> = new Map();

  constructor(serviceRegistry: ServiceRegistry, config: Partial<VersioningConfig> = {}) {
    this.logger = new Logger('ApiVersioningService');
    this.serviceRegistry = serviceRegistry;
    this.config = {
      defaultVersion: 'v1',
      supportedVersions: ['v1'],
      versionHeader: 'API-Version',
      versionParam: 'version',
      versionPrefix: '/api',
      deprecationWarnings: true,
      sunsetWarnings: true,
      ...config,
    };

    this.initializeVersions();
    this.initializeRoutes();
    this.initializeTransformers();
  }

  /**
   * Version resolution middleware
   */
  public versionMiddleware() {
    return (req: Request, res: Response, next: NextFunction): void => {
      try {
        const version = this.extractVersion(req);
        const resolvedVersion = this.resolveVersion(version);

        if (!resolvedVersion) {
          res.status(400).json({
            success: false,
            error: {
              code: 'UNSUPPORTED_API_VERSION',
              message: `API version '${version}' is not supported`,
              supportedVersions: this.config.supportedVersions,
            },
          });
          return;
        }

        // Attach version info to request
        (req as any).apiVersion = resolvedVersion;
        (req as any).versionInfo = this.versions.get(resolvedVersion);

        // Add version headers to response
        res.setHeader('API-Version', resolvedVersion);
        res.setHeader('Supported-Versions', this.config.supportedVersions.join(', '));

        // Add deprecation warnings
        this.addVersionWarnings(req, res, resolvedVersion);

        next();
      } catch (error) {
        this.logger.error('Error in version middleware', {
          error: error instanceof Error ? error.message : String(error),
          url: req.url,
        });

        res.status(500).json({
          success: false,
          error: {
            code: 'VERSION_RESOLUTION_ERROR',
            message: 'Error resolving API version',
          },
        });
      }
    };
  }

  /**
   * Route versioning middleware
   */
  public routeVersioningMiddleware() {
    return (req: Request, res: Response, next: NextFunction): void => {
      try {
        const version = (req as any).apiVersion || this.config.defaultVersion;
        const routeKey = `${req.method}:${req.path}`;
        const versionRoute = this.routes.get(routeKey);

        if (!versionRoute) {
          next();
          return;
        }

        const versionConfig = versionRoute.versions[version];
        if (!versionConfig) {
          // Try to find a compatible version
          const compatibleVersion = this.findCompatibleVersion(versionRoute, version);
          if (!compatibleVersion) {
            res.status(404).json({
              success: false,
              error: {
                code: 'ENDPOINT_NOT_AVAILABLE',
                message: `Endpoint not available in version ${version}`,
                availableVersions: Object.keys(versionRoute.versions),
              },
            });
            return;
          }
        }

        // Attach route version info
        (req as any).routeVersion = versionConfig;

        next();
      } catch (error) {
        this.logger.error('Error in route versioning middleware', {
          error: error instanceof Error ? error.message : String(error),
          url: req.url,
        });
        next(error);
      }
    };
  }

  /**
   * Request/Response transformation middleware
   */
  public transformationMiddleware() {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const routeVersion = (req as any).routeVersion;
        const version = (req as any).apiVersion;

        if (!routeVersion || !routeVersion.transformer) {
          next();
          return;
        }

        const transformer = this.transformers.get(routeVersion.transformer);
        if (!transformer) {
          next();
          return;
        }

        // Transform request
        if (transformer.transformRequest) {
          req.body = await transformer.transformRequest(req.body, version);
        }

        // Intercept response to transform it
        const originalSend = res.send;
        res.send = function(data: any) {
          if (transformer.transformResponse) {
            try {
              const transformedData = transformer.transformResponse(data, version);
              return originalSend.call(this, transformedData);
            } catch (error) {
              // Log transformation error but send original data
              console.error('Response transformation error:', error);
              return originalSend.call(this, data);
            }
          }
          return originalSend.call(this, data);
        };

        next();
      } catch (error) {
        this.logger.error('Error in transformation middleware', {
          error: error instanceof Error ? error.message : String(error),
          url: req.url,
        });
        next(error);
      }
    };
  }

  /**
   * Get version information
   */
  public getVersionInfo(version?: string): ApiVersion | null {
    const targetVersion = version || this.config.defaultVersion;
    return this.versions.get(targetVersion) || null;
  }

  /**
   * Get all supported versions
   */
  public getSupportedVersions(): ApiVersion[] {
    return Array.from(this.versions.values())
      .filter(v => this.config.supportedVersions.includes(v.version));
  }

  /**
   * Add new API version
   */
  public addVersion(version: ApiVersion): void {
    this.versions.set(version.version, version);
    
    if (!this.config.supportedVersions.includes(version.version)) {
      this.config.supportedVersions.push(version.version);
    }

    this.logger.info('API version added', {
      version: version.version,
      status: version.status,
    });
  }

  /**
   * Deprecate API version
   */
  public deprecateVersion(version: string, deprecationDate?: Date, sunsetDate?: Date): void {
    const versionInfo = this.versions.get(version);
    if (!versionInfo) {
      throw new Error(`Version ${version} not found`);
    }

    versionInfo.status = 'deprecated';
    versionInfo.deprecationDate = deprecationDate || new Date();
    if (sunsetDate) {
      versionInfo.sunsetDate = sunsetDate;
    }

    this.logger.info('API version deprecated', {
      version,
      deprecationDate: versionInfo.deprecationDate,
      sunsetDate: versionInfo.sunsetDate,
    });
  }

  /**
   * Sunset API version
   */
  public sunsetVersion(version: string): void {
    const versionInfo = this.versions.get(version);
    if (!versionInfo) {
      throw new Error(`Version ${version} not found`);
    }

    versionInfo.status = 'sunset';
    versionInfo.sunsetDate = new Date();

    // Remove from supported versions
    this.config.supportedVersions = this.config.supportedVersions.filter(v => v !== version);

    this.logger.info('API version sunset', { version });
  }

  /**
   * Private helper methods
   */
  private extractVersion(req: Request): string {
    // Method 1: Check header
    const headerVersion = req.headers[this.config.versionHeader.toLowerCase()] as string;
    if (headerVersion) {
      return this.normalizeVersion(headerVersion);
    }

    // Method 2: Check query parameter
    const paramVersion = req.query[this.config.versionParam] as string;
    if (paramVersion) {
      return this.normalizeVersion(paramVersion);
    }

    // Method 3: Check URL path
    const pathMatch = req.path.match(new RegExp(`^${this.config.versionPrefix}/(v\\d+)`));
    if (pathMatch) {
      return pathMatch[1];
    }

    // Method 4: Check Accept header
    const acceptHeader = req.headers.accept;
    if (acceptHeader) {
      const versionMatch = acceptHeader.match(/application\/vnd\.api\+json;version=(\w+)/);
      if (versionMatch) {
        return this.normalizeVersion(versionMatch[1]);
      }
    }

    return this.config.defaultVersion;
  }

  private normalizeVersion(version: string): string {
    // Ensure version starts with 'v'
    if (!version.startsWith('v')) {
      return `v${version}`;
    }
    return version;
  }

  private resolveVersion(requestedVersion: string): string | null {
    // Check if exact version is supported
    if (this.config.supportedVersions.includes(requestedVersion)) {
      return requestedVersion;
    }

    // Try to find compatible version (e.g., v1.1 -> v1)
    const majorVersion = requestedVersion.split('.')[0];
    if (this.config.supportedVersions.includes(majorVersion)) {
      return majorVersion;
    }

    return null;
  }

  private findCompatibleVersion(route: VersionRoute, requestedVersion: string): string | null {
    const availableVersions = Object.keys(route.versions);
    
    // Try exact match first
    if (availableVersions.includes(requestedVersion)) {
      return requestedVersion;
    }

    // Try major version match
    const majorVersion = requestedVersion.split('.')[0];
    const compatibleVersion = availableVersions.find(v => v.startsWith(majorVersion));
    
    return compatibleVersion || null;
  }

  private addVersionWarnings(req: Request, res: Response, version: string): void {
    const versionInfo = this.versions.get(version);
    if (!versionInfo) return;

    if (versionInfo.status === 'deprecated' && this.config.deprecationWarnings) {
      res.setHeader('Warning', '299 - "API version is deprecated"');
      res.setHeader('Deprecation', versionInfo.deprecationDate?.toISOString() || 'true');
      
      if (versionInfo.sunsetDate) {
        res.setHeader('Sunset', versionInfo.sunsetDate.toISOString());
      }
    }

    if (versionInfo.status === 'sunset' && this.config.sunsetWarnings) {
      res.setHeader('Warning', '299 - "API version is sunset"');
      res.setHeader('Sunset', versionInfo.sunsetDate?.toISOString() || 'true');
    }
  }

  private initializeVersions(): void {
    // Initialize default versions
    const v1: ApiVersion = {
      version: 'v1',
      status: 'active',
      releaseDate: new Date('2024-01-01'),
      breaking: false,
      changelog: ['Initial API release'],
    };

    this.addVersion(v1);
  }

  private initializeRoutes(): void {
    // Initialize route versioning configuration
    // This would typically be loaded from configuration files
    
    const messageRoutes: VersionRoute = {
      path: '/api/v1/messages',
      method: 'POST',
      versions: {
        v1: {
          service: 'message-service',
          endpoint: '/api/v1/messages',
        },
      },
    };

    this.routes.set('POST:/api/v1/messages', messageRoutes);
  }

  private initializeTransformers(): void {
    // Initialize request/response transformers
    // These handle backward compatibility between versions
    
    const v1ToV2Transformer = {
      transformRequest: (data: any, version: string) => {
        // Transform v1 request format to v2
        if (version === 'v1' && data.message) {
          return {
            content: {
              text: data.message,
              format: 'text',
            },
            ...data,
          };
        }
        return data;
      },
      
      transformResponse: (data: any, version: string) => {
        // Transform v2 response format to v1
        if (version === 'v1' && data.content) {
          return {
            message: data.content.text,
            ...data,
          };
        }
        return data;
      },
    };

    this.transformers.set('v1-to-v2', v1ToV2Transformer);
  }

  /**
   * Get versioning metrics
   */
  public getMetrics(): {
    totalVersions: number;
    activeVersions: number;
    deprecatedVersions: number;
    sunsetVersions: number;
    versionUsage: Record<string, number>;
  } {
    const versions = Array.from(this.versions.values());
    
    return {
      totalVersions: versions.length,
      activeVersions: versions.filter(v => v.status === 'active').length,
      deprecatedVersions: versions.filter(v => v.status === 'deprecated').length,
      sunsetVersions: versions.filter(v => v.status === 'sunset').length,
      versionUsage: {}, // This would be populated from actual usage metrics
    };
  }
}

export default ApiVersioningService;
