# 📊 Monitoring Guide

Comprehensive monitoring and observability setup for the Universal AI Customer Service Platform.

## 📋 Overview

Our monitoring stack provides complete observability across all services with metrics, logging, tracing, and alerting capabilities.

## 🏗️ Monitoring Architecture

### Observability Stack
```
┌─────────────────────────────────────────────────────────────┐
│                    Monitoring Stack                         │
├─────────────┬─────────────┬─────────────┬─────────────────┤
│ Metrics     │ Logging     │ Tracing     │ Alerting        │
│ (Prometheus)│ (ELK Stack) │ (Jaeger)    │ (AlertManager)  │
├─────────────┼─────────────┼─────────────┼─────────────────┤
│ Dashboards  │ Log         │ Performance │ Incident        │
│ (Grafana)   │ Analysis    │ Monitoring  │ Response        │
└─────────────┴─────────────┴─────────────┴─────────────────┘
```

## 📈 Metrics Collection

### Prometheus Setup

#### Prometheus Configuration
```yaml
# prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

rule_files:
  - "alert_rules.yml"

scrape_configs:
  - job_name: 'api-gateway'
    static_configs:
      - targets: ['api-gateway:3001']
    metrics_path: '/metrics'
    scrape_interval: 10s

  - job_name: 'ai-service'
    static_configs:
      - targets: ['ai-service:3004']
    metrics_path: '/metrics'
    scrape_interval: 15s

  - job_name: 'postgres'
    static_configs:
      - targets: ['postgres-exporter:9187']

  - job_name: 'redis'
    static_configs:
      - targets: ['redis-exporter:9121']

alerting:
  alertmanagers:
    - static_configs:
        - targets:
          - alertmanager:9093
```

#### Application Metrics
```typescript
import { register, Counter, Histogram, Gauge } from 'prom-client';

// HTTP Request Metrics
export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code', 'service'],
});

export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'service'],
  buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10],
});

// Business Metrics
export const conversationsTotal = new Counter({
  name: 'conversations_total',
  help: 'Total number of conversations created',
  labelNames: ['channel', 'organization'],
});

export const messagesProcessed = new Counter({
  name: 'messages_processed_total',
  help: 'Total number of messages processed',
  labelNames: ['type', 'status', 'service'],
});

export const aiRequestsTotal = new Counter({
  name: 'ai_requests_total',
  help: 'Total number of AI requests',
  labelNames: ['provider', 'model', 'status'],
});

export const aiRequestDuration = new Histogram({
  name: 'ai_request_duration_seconds',
  help: 'Duration of AI requests in seconds',
  labelNames: ['provider', 'model'],
  buckets: [0.5, 1, 2, 5, 10, 30],
});

// System Metrics
export const activeConnections = new Gauge({
  name: 'active_connections',
  help: 'Number of active connections',
  labelNames: ['service', 'type'],
});

export const memoryUsage = new Gauge({
  name: 'memory_usage_bytes',
  help: 'Memory usage in bytes',
  labelNames: ['service'],
});

// Middleware for automatic metrics collection
export const metricsMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    
    httpRequestsTotal
      .labels(req.method, req.route?.path || req.path, res.statusCode.toString(), 'api-gateway')
      .inc();
    
    httpRequestDuration
      .labels(req.method, req.route?.path || req.path, 'api-gateway')
      .observe(duration);
  });
  
  next();
};
```

### Custom Metrics Collection
```typescript
export class MetricsCollector {
  private static instance: MetricsCollector;
  
  static getInstance(): MetricsCollector {
    if (!MetricsCollector.instance) {
      MetricsCollector.instance = new MetricsCollector();
    }
    return MetricsCollector.instance;
  }
  
  recordConversationCreated(channel: string, organizationId: string): void {
    conversationsTotal.labels(channel, organizationId).inc();
  }
  
  recordMessageProcessed(type: string, status: string, service: string): void {
    messagesProcessed.labels(type, status, service).inc();
  }
  
  recordAIRequest(provider: string, model: string, duration: number, status: string): void {
    aiRequestsTotal.labels(provider, model, status).inc();
    aiRequestDuration.labels(provider, model).observe(duration);
  }
  
  updateActiveConnections(service: string, type: string, count: number): void {
    activeConnections.labels(service, type).set(count);
  }
  
  updateMemoryUsage(service: string, bytes: number): void {
    memoryUsage.labels(service).set(bytes);
  }
}
```

## 📊 Grafana Dashboards

### System Overview Dashboard
```json
{
  "dashboard": {
    "title": "Universal AI CS - System Overview",
    "panels": [
      {
        "title": "Request Rate",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(http_requests_total[5m])",
            "legendFormat": "{{service}} - {{method}}"
          }
        ]
      },
      {
        "title": "Response Time",
        "type": "graph",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))",
            "legendFormat": "95th percentile"
          },
          {
            "expr": "histogram_quantile(0.50, rate(http_request_duration_seconds_bucket[5m]))",
            "legendFormat": "50th percentile"
          }
        ]
      },
      {
        "title": "Error Rate",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(http_requests_total{status_code=~\"5..\"}[5m]) / rate(http_requests_total[5m])",
            "legendFormat": "Error Rate"
          }
        ]
      }
    ]
  }
}
```

### Business Metrics Dashboard
```json
{
  "dashboard": {
    "title": "Universal AI CS - Business Metrics",
    "panels": [
      {
        "title": "Conversations Created",
        "type": "stat",
        "targets": [
          {
            "expr": "increase(conversations_total[24h])",
            "legendFormat": "Last 24h"
          }
        ]
      },
      {
        "title": "Messages Processed",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(messages_processed_total[5m])",
            "legendFormat": "{{type}} - {{status}}"
          }
        ]
      },
      {
        "title": "AI Request Performance",
        "type": "graph",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, rate(ai_request_duration_seconds_bucket[5m]))",
            "legendFormat": "{{provider}} - {{model}}"
          }
        ]
      }
    ]
  }
}
```

## 📝 Logging

### ELK Stack Setup

#### Elasticsearch Configuration
```yaml
# elasticsearch.yml
cluster.name: universal-ai-cs
node.name: elasticsearch-1
network.host: 0.0.0.0
discovery.type: single-node
xpack.security.enabled: true
xpack.security.transport.ssl.enabled: true
```

#### Logstash Configuration
```ruby
# logstash.conf
input {
  beats {
    port => 5044
  }
}

filter {
  if [fields][service] {
    mutate {
      add_field => { "service" => "%{[fields][service]}" }
    }
  }
  
  # Parse JSON logs
  if [message] =~ /^\{/ {
    json {
      source => "message"
    }
  }
  
  # Add timestamp
  date {
    match => [ "timestamp", "ISO8601" ]
  }
  
  # Extract log level
  if [level] {
    mutate {
      uppercase => [ "level" ]
    }
  }
}

output {
  elasticsearch {
    hosts => ["elasticsearch:9200"]
    index => "universal-ai-cs-%{+YYYY.MM.dd}"
  }
}
```

#### Filebeat Configuration
```yaml
# filebeat.yml
filebeat.inputs:
- type: log
  enabled: true
  paths:
    - /var/log/universal-ai-cs/*.log
  fields:
    service: api-gateway
  fields_under_root: true

- type: docker
  containers.ids:
    - "*"
  processors:
    - add_docker_metadata: ~

output.logstash:
  hosts: ["logstash:5044"]

logging.level: info
```

### Application Logging
```typescript
import winston from 'winston';
import { ElasticsearchTransport } from 'winston-elasticsearch';

// Logger configuration
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: {
    service: process.env.SERVICE_NAME || 'unknown',
    version: process.env.SERVICE_VERSION || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
  },
  transports: [
    // Console output
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
    
    // File output
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
    }),
    new winston.transports.File({
      filename: 'logs/combined.log',
    }),
    
    // Elasticsearch output (production)
    ...(process.env.NODE_ENV === 'production' ? [
      new ElasticsearchTransport({
        level: 'info',
        clientOpts: {
          node: process.env.ELASTICSEARCH_URL,
        },
        index: 'universal-ai-cs',
      }),
    ] : []),
  ],
});

// Structured logging helpers
export const logRequest = (req: Request, res: Response, duration: number) => {
  logger.info('HTTP Request', {
    method: req.method,
    url: req.url,
    statusCode: res.statusCode,
    duration,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    userId: req.user?.id,
  });
};

export const logError = (error: Error, context?: Record<string, any>) => {
  logger.error('Application Error', {
    error: error.message,
    stack: error.stack,
    ...context,
  });
};

export const logBusinessEvent = (event: string, data: Record<string, any>) => {
  logger.info('Business Event', {
    event,
    ...data,
  });
};
```

## 🔍 Distributed Tracing

### Jaeger Setup
```typescript
import { initTracer } from 'jaeger-client';
import opentracing from 'opentracing';

// Initialize Jaeger tracer
const tracer = initTracer({
  serviceName: process.env.SERVICE_NAME || 'unknown-service',
  sampler: {
    type: 'const',
    param: 1, // Sample all requests in development
  },
  reporter: {
    agentHost: process.env.JAEGER_AGENT_HOST || 'localhost',
    agentPort: parseInt(process.env.JAEGER_AGENT_PORT || '6832'),
  },
}, {
  logger: {
    info: (msg) => logger.info(msg),
    error: (msg) => logger.error(msg),
  },
});

opentracing.initGlobalTracer(tracer);

// Tracing middleware
export const tracingMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const span = tracer.startSpan(`${req.method} ${req.path}`);
  
  span.setTag('http.method', req.method);
  span.setTag('http.url', req.url);
  span.setTag('user.id', req.user?.id);
  
  req.span = span;
  
  res.on('finish', () => {
    span.setTag('http.status_code', res.statusCode);
    span.finish();
  });
  
  next();
};

// Service-to-service tracing
export const traceServiceCall = async <T>(
  operationName: string,
  serviceCall: () => Promise<T>,
  parentSpan?: any
): Promise<T> => {
  const span = tracer.startSpan(operationName, {
    childOf: parentSpan,
  });
  
  try {
    const result = await serviceCall();
    span.setTag('success', true);
    return result;
  } catch (error) {
    span.setTag('error', true);
    span.setTag('error.message', error.message);
    throw error;
  } finally {
    span.finish();
  }
};
```

## 🚨 Alerting

### Alert Rules
```yaml
# alert_rules.yml
groups:
- name: universal-ai-cs-alerts
  rules:
  # High error rate
  - alert: HighErrorRate
    expr: rate(http_requests_total{status_code=~"5.."}[5m]) / rate(http_requests_total[5m]) > 0.05
    for: 5m
    labels:
      severity: critical
    annotations:
      summary: "High error rate detected"
      description: "Error rate is {{ $value | humanizePercentage }} for {{ $labels.service }}"

  # High response time
  - alert: HighResponseTime
    expr: histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 1
    for: 5m
    labels:
      severity: warning
    annotations:
      summary: "High response time detected"
      description: "95th percentile response time is {{ $value }}s for {{ $labels.service }}"

  # Service down
  - alert: ServiceDown
    expr: up == 0
    for: 1m
    labels:
      severity: critical
    annotations:
      summary: "Service is down"
      description: "{{ $labels.job }} service is down"

  # High memory usage
  - alert: HighMemoryUsage
    expr: memory_usage_bytes / (1024 * 1024 * 1024) > 2
    for: 10m
    labels:
      severity: warning
    annotations:
      summary: "High memory usage"
      description: "Memory usage is {{ $value }}GB for {{ $labels.service }}"

  # Database connection issues
  - alert: DatabaseConnectionIssues
    expr: increase(database_connection_errors_total[5m]) > 10
    for: 2m
    labels:
      severity: critical
    annotations:
      summary: "Database connection issues"
      description: "{{ $value }} database connection errors in the last 5 minutes"
```

### AlertManager Configuration
```yaml
# alertmanager.yml
global:
  smtp_smarthost: 'localhost:587'
  smtp_from: 'alerts@universalai-cs.com'

route:
  group_by: ['alertname']
  group_wait: 10s
  group_interval: 10s
  repeat_interval: 1h
  receiver: 'web.hook'
  routes:
  - match:
      severity: critical
    receiver: 'critical-alerts'
  - match:
      severity: warning
    receiver: 'warning-alerts'

receivers:
- name: 'web.hook'
  webhook_configs:
  - url: 'http://notification-service:3008/webhooks/alerts'

- name: 'critical-alerts'
  email_configs:
  - to: 'oncall@universalai-cs.com'
    subject: 'CRITICAL: {{ .GroupLabels.alertname }}'
    body: |
      {{ range .Alerts }}
      Alert: {{ .Annotations.summary }}
      Description: {{ .Annotations.description }}
      {{ end }}
  slack_configs:
  - api_url: 'YOUR_SLACK_WEBHOOK_URL'
    channel: '#alerts-critical'
    title: 'Critical Alert'
    text: '{{ range .Alerts }}{{ .Annotations.summary }}{{ end }}'

- name: 'warning-alerts'
  email_configs:
  - to: 'team@universalai-cs.com'
    subject: 'WARNING: {{ .GroupLabels.alertname }}'
```

## 📱 Health Checks

### Service Health Endpoints
```typescript
export class HealthCheckService {
  async getHealthStatus(): Promise<HealthStatus> {
    const checks = await Promise.allSettled([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkRabbitMQ(),
      this.checkExternalAPIs(),
    ]);
    
    const status = checks.every(check => check.status === 'fulfilled' && check.value.healthy)
      ? 'healthy'
      : 'unhealthy';
    
    return {
      status,
      timestamp: new Date().toISOString(),
      service: process.env.SERVICE_NAME,
      version: process.env.SERVICE_VERSION,
      uptime: process.uptime(),
      checks: {
        database: checks[0].status === 'fulfilled' ? checks[0].value : { healthy: false },
        redis: checks[1].status === 'fulfilled' ? checks[1].value : { healthy: false },
        rabbitmq: checks[2].status === 'fulfilled' ? checks[2].value : { healthy: false },
        externalAPIs: checks[3].status === 'fulfilled' ? checks[3].value : { healthy: false },
      },
    };
  }
  
  private async checkDatabase(): Promise<{ healthy: boolean; responseTime?: number }> {
    const start = Date.now();
    try {
      await this.db.query('SELECT 1');
      return {
        healthy: true,
        responseTime: Date.now() - start,
      };
    } catch (error) {
      return { healthy: false };
    }
  }
  
  private async checkRedis(): Promise<{ healthy: boolean; responseTime?: number }> {
    const start = Date.now();
    try {
      await this.redis.ping();
      return {
        healthy: true,
        responseTime: Date.now() - start,
      };
    } catch (error) {
      return { healthy: false };
    }
  }
}
```

## 📊 Performance Monitoring

### Application Performance Monitoring
```typescript
export class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  
  static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }
  
  startTimer(operation: string): () => void {
    const start = Date.now();
    return () => {
      const duration = Date.now() - start;
      this.recordDuration(operation, duration);
    };
  }
  
  recordDuration(operation: string, duration: number): void {
    httpRequestDuration.labels('internal', operation, 'performance').observe(duration / 1000);
  }
  
  async profileFunction<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const endTimer = this.startTimer(name);
    try {
      const result = await fn();
      return result;
    } finally {
      endTimer();
    }
  }
}
```

## 🔧 Monitoring Best Practices

### Metrics Guidelines
- Use consistent naming conventions
- Include relevant labels for filtering
- Monitor both technical and business metrics
- Set appropriate alert thresholds

### Logging Best Practices
- Use structured logging (JSON format)
- Include correlation IDs for tracing
- Log at appropriate levels
- Avoid logging sensitive information

### Alerting Guidelines
- Alert on symptoms, not causes
- Use appropriate severity levels
- Include actionable information
- Avoid alert fatigue

## 📚 Additional Resources

- [Prometheus Documentation](https://prometheus.io/docs/)
- [Grafana Documentation](https://grafana.com/docs/)
- [ELK Stack Guide](https://www.elastic.co/guide/)
- [Jaeger Documentation](https://www.jaegertracing.io/docs/)

For monitoring support, contact our DevOps team at devops@universalai-cs.com
