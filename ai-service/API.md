# AI Service API Documentation

## Overview

The AI Service provides comprehensive artificial intelligence capabilities for customer service automation, including message classification, response generation, sentiment analysis, and cost optimization.

**Base URL**: `http://localhost:3003/api/v1`

**Authentication**: Bearer token (JWT) required for all endpoints except health checks.

## Table of Contents

1. [Health Endpoints](#health-endpoints)
2. [AI Processing Endpoints](#ai-processing-endpoints)
3. [Provider Management](#provider-management)
4. [Configuration Management](#configuration-management)
5. [Performance Monitoring](#performance-monitoring)
6. [Cost Optimization](#cost-optimization)
7. [Error Handling](#error-handling)
8. [Rate Limiting](#rate-limiting)

## Health Endpoints

### Basic Health Check
```http
GET /health
```

**Response:**
```json
{
  "status": "healthy",
  "service": "ai-service",
  "version": "1.0.0",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "uptime": 3600,
  "environment": "production"
}
```

### Detailed Health Check
```http
GET /api/v1/health/detailed
```

**Response:**
```json
{
  "status": "healthy",
  "service": "ai-service",
  "components": {
    "database": {
      "healthy": true,
      "responseTime": 15,
      "stats": {
        "totalCount": 10,
        "idleCount": 8,
        "waitingCount": 0
      }
    },
    "queue": {
      "healthy": true,
      "stats": {
        "waiting": 5,
        "active": 2,
        "completed": 1000,
        "failed": 3
      }
    },
    "providers": [
      {
        "id": "openai-provider-1",
        "name": "OpenAI GPT",
        "provider": "openai",
        "healthy": true,
        "responseTime": 1200
      }
    ]
  }
}
```

## AI Processing Endpoints

### Classify Message
Classify a customer message with sentiment analysis and priority scoring.

```http
POST /api/v1/ai/classify
```

**Request Body:**
```json
{
  "messageId": "msg_123456",
  "organizationId": "org_789",
  "integrationId": "int_456",
  "messageText": "I'm having trouble with my order and need help",
  "messageHtml": "<p>I'm having trouble with my order and need help</p>",
  "sender": {
    "email": "customer@example.com",
    "name": "John Doe",
    "tier": "premium"
  },
  "context": {
    "conversationHistory": [
      {
        "role": "customer",
        "content": "Hello, I need assistance",
        "timestamp": "2024-01-01T10:00:00.000Z"
      }
    ],
    "customerInfo": {
      "previousInteractions": 5,
      "satisfactionScore": 4.2
    }
  },
  "options": {
    "includeEntities": true,
    "includeSentiment": true,
    "confidenceThreshold": 0.8,
    "preferredProvider": "openai"
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "messageId": "msg_123456",
    "classification": {
      "category": "technical_support",
      "subcategory": "order_issue",
      "intent": "get_help",
      "confidence": 0.92,
      "urgency": "high",
      "topics": ["order", "trouble", "help"],
      "reasoning": "Customer expressing difficulty with order and requesting assistance",
      "alternativeCategories": [
        {
          "category": "complaint",
          "confidence": 0.75
        }
      ]
    },
    "sentiment": {
      "score": -0.3,
      "label": "negative",
      "confidence": 0.85,
      "emotions": [
        {
          "emotion": "frustration",
          "score": 0.7
        }
      ]
    },
    "language": {
      "detected": "en",
      "confidence": 0.98,
      "alternatives": []
    },
    "entities": [
      {
        "text": "order",
        "label": "PRODUCT",
        "confidence": 0.9,
        "start": 25,
        "end": 30
      }
    ],
    "priority": {
      "score": 78,
      "level": "high",
      "factors": ["high urgency", "premium customer", "negative sentiment"]
    },
    "processingTime": 1850,
    "cost": 0.0025,
    "modelUsed": "gpt-3.5-turbo",
    "requiresHumanReview": true
  },
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

### Generate Response
Generate a context-aware response to a customer message.

```http
POST /api/v1/ai/generate-response
```

**Request Body:**
```json
{
  "messageId": "msg_123456",
  "organizationId": "org_789",
  "messageText": "I need help with my order",
  "classification": {
    "category": "technical_support",
    "intent": "get_help",
    "urgency": "high"
  },
  "conversationContext": {
    "history": [
      {
        "role": "customer",
        "content": "I need help with my order",
        "timestamp": "2024-01-01T10:00:00.000Z"
      }
    ],
    "customerInfo": {
      "name": "John Doe",
      "email": "john@example.com",
      "tier": "premium",
      "language": "en"
    }
  },
  "organizationContext": {
    "businessInfo": {
      "name": "Acme Corp",
      "industry": "E-commerce",
      "supportHours": "9 AM - 5 PM EST"
    },
    "policies": {
      "returnPolicy": "30-day return policy",
      "shippingPolicy": "Free shipping on orders over $50"
    },
    "knowledgeBase": [
      {
        "id": "kb_1",
        "title": "Order Status FAQ",
        "content": "To check your order status, please provide your order number",
        "category": "orders",
        "tags": ["order", "status", "tracking"]
      }
    ],
    "brandVoice": {
      "tone": "friendly",
      "style": "Professional but approachable",
      "preferredPhrases": ["Thank you for contacting us", "Happy to help"]
    }
  },
  "options": {
    "tone": "friendly",
    "length": "medium",
    "includeReasoning": true,
    "targetLanguage": "en"
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "messageId": "msg_123456",
    "response": {
      "content": "Thank you for contacting us, John! I'm happy to help you with your order. To better assist you, could you please provide your order number? Once I have that, I can check the status and help resolve any issues you're experiencing.",
      "confidence": 0.94,
      "reasoning": "Generated personalized response using customer name, acknowledging the issue, and requesting specific information needed to help",
      "suggestedActions": [
        "Request order number",
        "Check order status",
        "Escalate if needed"
      ],
      "requiresHumanReview": false,
      "alternatives": [
        "Hi John! I'd be glad to help with your order. What specific issue are you experiencing?"
      ]
    },
    "knowledgeBaseUsed": [
      {
        "id": "kb_1",
        "title": "Order Status FAQ",
        "relevanceScore": 0.85
      }
    ],
    "processingTime": 2100,
    "cost": 0.0045,
    "modelUsed": "gpt-3.5-turbo",
    "qualityScore": 88
  },
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

### Batch Classification
Classify multiple messages in a single request.

```http
POST /api/v1/ai/classify-batch
```

**Request Body:**
```json
{
  "messages": [
    {
      "messageId": "msg_1",
      "organizationId": "org_789",
      "messageText": "I love your product!"
    },
    {
      "messageId": "msg_2",
      "organizationId": "org_789",
      "messageText": "My order is late, this is unacceptable"
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "results": [
      {
        "messageId": "msg_1",
        "classification": {
          "category": "compliment",
          "confidence": 0.95,
          "urgency": "low"
        }
      },
      {
        "messageId": "msg_2",
        "classification": {
          "category": "complaint",
          "confidence": 0.88,
          "urgency": "high"
        }
      }
    ],
    "processed": 2,
    "total": 2
  },
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

## Provider Management

### Get All Providers
```http
GET /api/v1/ai/providers
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "provider_1",
      "name": "OpenAI GPT",
      "provider": "openai",
      "isActive": true,
      "isHealthy": true,
      "metrics": {
        "averageLatency": 1200,
        "successRate": 0.98,
        "averageCost": 0.003
      }
    }
  ],
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

### Add New Provider
```http
POST /api/v1/ai/providers
```

**Request Body:**
```json
{
  "organizationId": "org_789",
  "name": "Custom OpenAI",
  "provider": "openai",
  "apiKey": "sk-...",
  "baseUrl": "https://api.openai.com/v1",
  "rateLimits": {
    "requestsPerMinute": 60,
    "tokensPerMinute": 40000
  },
  "costConfig": {
    "inputTokenCost": 0.0015,
    "outputTokenCost": 0.002
  },
  "features": ["text_generation", "classification"],
  "priority": 5
}
```

## Configuration Management

### Create Model Configuration
```http
POST /api/v1/ai/config/models
```

### Add Training Data
```http
POST /api/v1/ai/config/training-data
```

### Create Prompt Template
```http
POST /api/v1/ai/config/prompt-templates
```

## Performance Monitoring

### Get Accuracy Metrics
```http
GET /api/v1/ai/monitoring/accuracy?organizationId=org_789&timeRange=day
```

### Get Cost Metrics
```http
GET /api/v1/ai/monitoring/costs?organizationId=org_789&timeRange=week
```

### Create A/B Test
```http
POST /api/v1/ai/monitoring/ab-tests
```

## Cost Optimization

### Create Cost Rule
```http
POST /api/v1/ai/monitoring/cost-rules
```

### Get Cost Predictions
```http
GET /api/v1/ai/monitoring/cost-predictions?organizationId=org_789&period=month
```

## Error Handling

All endpoints return errors in a consistent format:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "messageText is required",
    "details": {
      "field": "messageText",
      "value": null
    }
  },
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

### Common Error Codes
- `VALIDATION_ERROR` (400): Invalid request data
- `UNAUTHORIZED` (401): Invalid or missing authentication
- `FORBIDDEN` (403): Insufficient permissions
- `NOT_FOUND` (404): Resource not found
- `RATE_LIMIT_EXCEEDED` (429): Too many requests
- `INTERNAL_ERROR` (500): Server error
- `SERVICE_UNAVAILABLE` (503): Service temporarily unavailable

## Rate Limiting

- **Default**: 100 requests per minute per API key
- **Burst**: Up to 200 requests in a 10-second window
- **Headers**: Rate limit information included in response headers

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1640995200
```
