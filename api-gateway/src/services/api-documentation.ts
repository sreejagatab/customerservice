/**
 * API Documentation Service
 * Generates and serves comprehensive API documentation
 */

import { Request, Response } from 'express';
import { Logger } from '@universal-ai-cs/shared';
import { ServiceRegistry } from './service-registry';
import { ApiVersioningService } from './api-versioning';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

export interface ApiEndpoint {
  path: string;
  method: string;
  summary: string;
  description: string;
  tags: string[];
  parameters: Parameter[];
  requestBody?: RequestBody;
  responses: Record<string, Response>;
  security?: SecurityRequirement[];
  deprecated?: boolean;
  version: string;
  service: string;
}

export interface Parameter {
  name: string;
  in: 'query' | 'header' | 'path' | 'cookie';
  description: string;
  required: boolean;
  schema: Schema;
  example?: any;
}

export interface RequestBody {
  description: string;
  required: boolean;
  content: Record<string, MediaType>;
}

export interface MediaType {
  schema: Schema;
  example?: any;
  examples?: Record<string, Example>;
}

export interface Schema {
  type: string;
  format?: string;
  properties?: Record<string, Schema>;
  items?: Schema;
  required?: string[];
  enum?: any[];
  example?: any;
}

export interface Example {
  summary: string;
  description?: string;
  value: any;
}

export interface SecurityRequirement {
  [key: string]: string[];
}

export class ApiDocumentationService {
  private logger: Logger;
  private serviceRegistry: ServiceRegistry;
  private versioningService: ApiVersioningService;
  private endpoints: Map<string, ApiEndpoint> = new Map();
  private schemas: Map<string, Schema> = new Map();

  constructor(
    serviceRegistry: ServiceRegistry,
    versioningService: ApiVersioningService
  ) {
    this.logger = new Logger('ApiDocumentationService');
    this.serviceRegistry = serviceRegistry;
    this.versioningService = versioningService;
    
    this.initializeSchemas();
    this.initializeEndpoints();
  }

  /**
   * Generate OpenAPI specification
   */
  public generateOpenApiSpec(version?: string): any {
    const targetVersion = version || 'v1';
    const versionInfo = this.versioningService.getVersionInfo(targetVersion);
    
    const spec = {
      openapi: '3.0.0',
      info: {
        title: 'Universal AI Customer Service Platform API',
        version: targetVersion,
        description: 'Comprehensive API for the Universal AI Customer Service Platform',
        contact: {
          name: 'API Support',
          email: 'api-support@universalai-cs.com',
          url: 'https://docs.universalai-cs.com',
        },
        license: {
          name: 'MIT',
          url: 'https://opensource.org/licenses/MIT',
        },
      },
      servers: [
        {
          url: process.env.API_BASE_URL || 'https://api.universalai-cs.com',
          description: 'Production server',
        },
        {
          url: 'https://staging-api.universalai-cs.com',
          description: 'Staging server',
        },
        {
          url: 'http://localhost:3000',
          description: 'Development server',
        },
      ],
      paths: this.generatePaths(targetVersion),
      components: {
        schemas: this.generateSchemas(),
        securitySchemes: this.generateSecuritySchemes(),
        parameters: this.generateCommonParameters(),
        responses: this.generateCommonResponses(),
        examples: this.generateExamples(),
      },
      security: [
        { bearerAuth: [] },
        { apiKey: [] },
      ],
      tags: this.generateTags(),
      externalDocs: {
        description: 'Find more info here',
        url: 'https://docs.universalai-cs.com',
      },
    };

    // Add version-specific information
    if (versionInfo) {
      spec.info.description += `\n\nVersion Status: ${versionInfo.status}`;
      if (versionInfo.deprecationDate) {
        spec.info.description += `\nDeprecated: ${versionInfo.deprecationDate.toISOString()}`;
      }
      if (versionInfo.sunsetDate) {
        spec.info.description += `\nSunset: ${versionInfo.sunsetDate.toISOString()}`;
      }
    }

    return spec;
  }

  /**
   * Generate Swagger UI middleware
   */
  public generateSwaggerMiddleware(version?: string) {
    const spec = this.generateOpenApiSpec(version);
    
    const options = {
      explorer: true,
      customCss: `
        .swagger-ui .topbar { display: none }
        .swagger-ui .info .title { color: #2c3e50 }
      `,
      customSiteTitle: 'Universal AI CS API Documentation',
      swaggerOptions: {
        persistAuthorization: true,
        displayRequestDuration: true,
        filter: true,
        showExtensions: true,
        showCommonExtensions: true,
      },
    };

    return swaggerUi.setup(spec, options);
  }

  /**
   * Add endpoint documentation
   */
  public addEndpoint(endpoint: ApiEndpoint): void {
    const key = `${endpoint.method}:${endpoint.path}:${endpoint.version}`;
    this.endpoints.set(key, endpoint);
    
    this.logger.debug('API endpoint documented', {
      method: endpoint.method,
      path: endpoint.path,
      version: endpoint.version,
      service: endpoint.service,
    });
  }

  /**
   * Add schema definition
   */
  public addSchema(name: string, schema: Schema): void {
    this.schemas.set(name, schema);
  }

  /**
   * Generate API documentation in multiple formats
   */
  public generateDocumentation(format: 'json' | 'yaml' | 'html' = 'json', version?: string): string {
    const spec = this.generateOpenApiSpec(version);
    
    switch (format) {
      case 'json':
        return JSON.stringify(spec, null, 2);
      case 'yaml':
        return this.convertToYaml(spec);
      case 'html':
        return this.generateHtmlDocumentation(spec);
      default:
        return JSON.stringify(spec, null, 2);
    }
  }

  /**
   * Get endpoint documentation
   */
  public getEndpointDocs(method: string, path: string, version: string): ApiEndpoint | null {
    const key = `${method}:${path}:${version}`;
    return this.endpoints.get(key) || null;
  }

  /**
   * Private helper methods
   */
  private generatePaths(version: string): Record<string, any> {
    const paths: Record<string, any> = {};
    
    for (const [key, endpoint] of this.endpoints) {
      if (endpoint.version !== version) continue;
      
      if (!paths[endpoint.path]) {
        paths[endpoint.path] = {};
      }
      
      paths[endpoint.path][endpoint.method.toLowerCase()] = {
        summary: endpoint.summary,
        description: endpoint.description,
        tags: endpoint.tags,
        parameters: endpoint.parameters,
        requestBody: endpoint.requestBody,
        responses: endpoint.responses,
        security: endpoint.security,
        deprecated: endpoint.deprecated,
        'x-service': endpoint.service,
      };
    }
    
    return paths;
  }

  private generateSchemas(): Record<string, any> {
    const schemas: Record<string, any> = {};
    
    for (const [name, schema] of this.schemas) {
      schemas[name] = schema;
    }
    
    return schemas;
  }

  private generateSecuritySchemes(): Record<string, any> {
    return {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT token obtained from authentication endpoint',
      },
      apiKey: {
        type: 'apiKey',
        in: 'header',
        name: 'X-API-Key',
        description: 'API key for service-to-service authentication',
      },
      organizationId: {
        type: 'apiKey',
        in: 'header',
        name: 'X-Organization-ID',
        description: 'Organization identifier for multi-tenant access',
      },
    };
  }

  private generateCommonParameters(): Record<string, any> {
    return {
      organizationId: {
        name: 'X-Organization-ID',
        in: 'header',
        description: 'Organization identifier',
        required: true,
        schema: {
          type: 'string',
          format: 'uuid',
        },
      },
      requestId: {
        name: 'X-Request-ID',
        in: 'header',
        description: 'Unique request identifier for tracing',
        required: false,
        schema: {
          type: 'string',
        },
      },
      page: {
        name: 'page',
        in: 'query',
        description: 'Page number for pagination',
        required: false,
        schema: {
          type: 'integer',
          minimum: 1,
          default: 1,
        },
      },
      limit: {
        name: 'limit',
        in: 'query',
        description: 'Number of items per page',
        required: false,
        schema: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
          default: 20,
        },
      },
    };
  }

  private generateCommonResponses(): Record<string, any> {
    return {
      Success: {
        description: 'Successful operation',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                success: { type: 'boolean', example: true },
                data: { type: 'object' },
                meta: {
                  type: 'object',
                  properties: {
                    timestamp: { type: 'string', format: 'date-time' },
                    requestId: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
      Error: {
        description: 'Error response',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                success: { type: 'boolean', example: false },
                error: {
                  type: 'object',
                  properties: {
                    code: { type: 'string' },
                    message: { type: 'string' },
                    details: { type: 'object' },
                    timestamp: { type: 'string', format: 'date-time' },
                  },
                },
              },
            },
          },
        },
      },
      Unauthorized: {
        description: 'Authentication required',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/responses/Error',
            },
          },
        },
      },
      Forbidden: {
        description: 'Insufficient permissions',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/responses/Error',
            },
          },
        },
      },
      NotFound: {
        description: 'Resource not found',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/responses/Error',
            },
          },
        },
      },
      RateLimited: {
        description: 'Rate limit exceeded',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/responses/Error',
            },
          },
        },
      },
    };
  }

  private generateExamples(): Record<string, any> {
    return {
      MessageRequest: {
        summary: 'Create message request',
        value: {
          conversationId: '123e4567-e89b-12d3-a456-426614174000',
          content: {
            text: 'Hello, I need help with my order',
            format: 'text',
          },
          sender: {
            email: 'customer@example.com',
            name: 'John Doe',
            type: 'customer',
          },
        },
      },
      MessageResponse: {
        summary: 'Message created response',
        value: {
          success: true,
          data: {
            id: 'msg_123456789',
            status: 'queued',
            estimatedProcessingTime: '2-5 seconds',
          },
          meta: {
            timestamp: '2024-01-01T12:00:00.000Z',
            requestId: 'req_123456789',
          },
        },
      },
    };
  }

  private generateTags(): Array<{ name: string; description: string }> {
    const services = this.serviceRegistry.getAllServices();
    
    const tags = [
      { name: 'Authentication', description: 'User authentication and authorization' },
      { name: 'Messages', description: 'Message processing and management' },
      { name: 'Conversations', description: 'Conversation management' },
      { name: 'AI', description: 'AI processing and analysis' },
      { name: 'Integrations', description: 'Third-party integrations' },
      { name: 'Analytics', description: 'Analytics and reporting' },
      { name: 'Voice', description: 'Voice call handling' },
      { name: 'Notifications', description: 'Notification management' },
      { name: 'Admin', description: 'Administrative functions' },
      { name: 'Health', description: 'Health checks and monitoring' },
    ];

    // Add service-specific tags
    services.forEach(service => {
      tags.push({
        name: service.name,
        description: `${service.name} specific endpoints`,
      });
    });

    return tags;
  }

  private convertToYaml(obj: any): string {
    // Simple YAML conversion - in production, use a proper YAML library
    return JSON.stringify(obj, null, 2);
  }

  private generateHtmlDocumentation(spec: any): string {
    // Generate basic HTML documentation
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>API Documentation</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 40px; }
          .endpoint { margin: 20px 0; padding: 20px; border: 1px solid #ddd; }
          .method { font-weight: bold; color: #007bff; }
        </style>
      </head>
      <body>
        <h1>${spec.info.title}</h1>
        <p>${spec.info.description}</p>
        <h2>Endpoints</h2>
        ${Object.entries(spec.paths).map(([path, methods]: [string, any]) =>
          Object.entries(methods).map(([method, details]: [string, any]) =>
            `<div class="endpoint">
              <span class="method">${method.toUpperCase()}</span> ${path}
              <p>${details.summary}</p>
              <p>${details.description}</p>
            </div>`
          ).join('')
        ).join('')}
      </body>
      </html>
    `;
  }

  private initializeSchemas(): void {
    // Initialize common schemas
    this.addSchema('Message', {
      type: 'object',
      required: ['conversationId', 'content', 'sender'],
      properties: {
        id: { type: 'string', format: 'uuid' },
        conversationId: { type: 'string', format: 'uuid' },
        content: {
          type: 'object',
          properties: {
            text: { type: 'string' },
            format: { type: 'string', enum: ['text', 'html', 'markdown'] },
          },
        },
        sender: {
          type: 'object',
          properties: {
            email: { type: 'string', format: 'email' },
            name: { type: 'string' },
            type: { type: 'string', enum: ['customer', 'agent', 'system'] },
          },
        },
      },
    });
  }

  private initializeEndpoints(): void {
    // Initialize common endpoints
    this.addEndpoint({
      path: '/api/v1/messages',
      method: 'POST',
      summary: 'Create a new message',
      description: 'Creates a new message in the system for processing',
      tags: ['Messages'],
      parameters: [],
      requestBody: {
        description: 'Message data',
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Message' },
          },
        },
      },
      responses: {
        '201': { $ref: '#/components/responses/Success' },
        '400': { $ref: '#/components/responses/Error' },
        '401': { $ref: '#/components/responses/Unauthorized' },
      },
      version: 'v1',
      service: 'message-service',
    });
  }
}

export default ApiDocumentationService;
