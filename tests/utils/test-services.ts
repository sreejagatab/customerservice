import axios, { AxiosInstance } from 'axios';
import { spawn, ChildProcess } from 'child_process';

export class TestServices {
  private services: Map<string, ChildProcess> = new Map();
  private httpClient: AxiosInstance;
  private baseUrls: Record<string, string> = {
    'api-gateway': process.env.API_GATEWAY_URL || 'http://localhost:3000',
    'auth-service': process.env.AUTH_SERVICE_URL || 'http://localhost:3001',
  };

  constructor() {
    this.httpClient = axios.create({
      timeout: 10000,
      validateStatus: () => true, // Don't throw on HTTP errors
    });
  }

  async setup(): Promise<void> {
    console.log('🚀 Starting test services...');

    // Start services in order
    await this.startService('auth-service', 3001);
    await this.startService('api-gateway', 3000);

    // Wait for all services to be healthy
    await this.waitForServices();

    console.log('✅ All test services are running');
  }

  async cleanup(): Promise<void> {
    console.log('🛑 Stopping test services...');

    // Stop services in reverse order
    for (const [name, process] of this.services) {
      console.log(`Stopping ${name}...`);
      process.kill('SIGTERM');
      
      // Wait for graceful shutdown
      await new Promise((resolve) => {
        process.on('exit', resolve);
        setTimeout(resolve, 5000); // Force kill after 5 seconds
      });
    }

    this.services.clear();
    console.log('✅ All test services stopped');
  }

  async resetState(): Promise<void> {
    // Reset any service state that needs to be cleaned between tests
    // This could include clearing caches, resetting counters, etc.
  }

  private async startService(serviceName: string, port: number): Promise<void> {
    const serviceDir = serviceName;
    
    console.log(`Starting ${serviceName} on port ${port}...`);

    const process = spawn('npm', ['run', 'dev'], {
      cwd: serviceDir,
      stdio: 'pipe',
      env: {
        ...process.env,
        PORT: port.toString(),
        NODE_ENV: 'test',
      },
    });

    // Handle process output
    process.stdout?.on('data', (data) => {
      if (process.env.VERBOSE_TESTS) {
        console.log(`[${serviceName}] ${data.toString().trim()}`);
      }
    });

    process.stderr?.on('data', (data) => {
      console.error(`[${serviceName}] ${data.toString().trim()}`);
    });

    process.on('exit', (code) => {
      if (code !== 0) {
        console.error(`${serviceName} exited with code ${code}`);
      }
    });

    this.services.set(serviceName, process);

    // Wait for service to start
    await this.waitForService(serviceName, port);
  }

  private async waitForService(serviceName: string, port: number, maxRetries: number = 30): Promise<void> {
    const url = `http://localhost:${port}/health`;
    
    for (let i = 0; i < maxRetries; i++) {
      try {
        const response = await this.httpClient.get(url);
        if (response.status === 200) {
          console.log(`✅ ${serviceName} is ready`);
          return;
        }
      } catch (error) {
        // Service not ready yet
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    throw new Error(`${serviceName} failed to start within timeout`);
  }

  private async waitForServices(): Promise<void> {
    const healthChecks = Object.entries(this.baseUrls).map(async ([name, url]) => {
      const healthUrl = `${url}/health`;
      
      for (let i = 0; i < 30; i++) {
        try {
          const response = await this.httpClient.get(healthUrl);
          if (response.status === 200) {
            return;
          }
        } catch (error) {
          // Service not ready yet
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      throw new Error(`Service ${name} health check failed`);
    });

    await Promise.all(healthChecks);
  }

  // Helper methods for making API calls
  async makeRequest(method: string, path: string, data?: any, headers?: any): Promise<any> {
    const url = `${this.baseUrls['api-gateway']}${path}`;
    
    const response = await this.httpClient.request({
      method,
      url,
      data,
      headers,
    });

    return {
      status: response.status,
      data: response.data,
      headers: response.headers,
    };
  }

  async login(email: string, password: string): Promise<{ token: string; user: any }> {
    const response = await this.makeRequest('POST', '/api/v1/auth/login', {
      email,
      password,
    });

    if (response.status !== 200) {
      throw new Error(`Login failed: ${response.data?.error?.message || 'Unknown error'}`);
    }

    return {
      token: response.data.data.tokens.accessToken,
      user: response.data.data.user,
    };
  }

  async makeAuthenticatedRequest(
    method: string,
    path: string,
    token: string,
    data?: any
  ): Promise<any> {
    return this.makeRequest(method, path, data, {
      Authorization: `Bearer ${token}`,
    });
  }

  async createTestUser(userData: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    organizationName: string;
  }): Promise<{ token: string; user: any }> {
    const response = await this.makeRequest('POST', '/api/v1/auth/register', userData);

    if (response.status !== 201) {
      throw new Error(`Registration failed: ${response.data?.error?.message || 'Unknown error'}`);
    }

    return {
      token: response.data.data.tokens.accessToken,
      user: response.data.data.user,
    };
  }

  getServiceUrl(serviceName: string): string {
    return this.baseUrls[serviceName] || `http://localhost:3000`;
  }

  isServiceRunning(serviceName: string): boolean {
    return this.services.has(serviceName);
  }
}
