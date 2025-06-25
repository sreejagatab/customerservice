# 🔌 API Reference

Complete API documentation for the Universal AI Customer Service Platform.

## 📋 Overview

The Universal AI Customer Service Platform provides a comprehensive RESTful API that enables developers to integrate with all platform features. All APIs follow REST conventions and return JSON responses.

### Base URL
```
Production: https://api.universalai-cs.com/api/v1
Development: http://localhost:3001/api/v1
```

### Authentication
All API requests require authentication using JWT tokens:

```bash
Authorization: Bearer <your-jwt-token>
```

### Content Type
All requests should include the appropriate content type header:

```bash
Content-Type: application/json
```

### Rate Limiting
- **Free Tier**: 1,000 requests per hour
- **Professional**: 10,000 requests per hour  
- **Enterprise**: 100,000 requests per hour

## 🔐 Authentication API

### Login
```http
POST /auth/login
```

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "refresh_token_here",
    "user": {
      "id": "user_123",
      "email": "user@example.com",
      "name": "John Doe",
      "role": "admin"
    }
  }
}
```

### Register
```http
POST /auth/register
```

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123",
  "name": "John Doe",
  "organizationName": "Acme Corp"
}
```

### Refresh Token
```http
POST /auth/refresh
```

**Request Body:**
```json
{
  "refreshToken": "refresh_token_here"
}
```

## 🏢 Organizations API

### List Organizations
```http
GET /organizations
```

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 20)
- `search` (optional): Search term

**Response:**
```json
{
  "success": true,
  "data": {
    "organizations": [
      {
        "id": "org_123",
        "name": "Acme Corp",
        "domain": "acme.com",
        "plan": "professional",
        "createdAt": "2024-01-01T00:00:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 1,
      "pages": 1
    }
  }
}
```

### Create Organization
```http
POST /organizations
```

**Request Body:**
```json
{
  "name": "New Company",
  "domain": "newcompany.com",
  "plan": "professional"
}
```

### Get Organization
```http
GET /organizations/{id}
```

### Update Organization
```http
PUT /organizations/{id}
```

### Delete Organization
```http
DELETE /organizations/{id}
```

## 🔗 Integrations API

### List Integrations
```http
GET /integrations
```

**Response:**
```json
{
  "success": true,
  "data": {
    "integrations": [
      {
        "id": "int_123",
        "type": "gmail",
        "name": "Gmail Integration",
        "status": "active",
        "config": {
          "email": "support@company.com"
        },
        "createdAt": "2024-01-01T00:00:00Z"
      }
    ]
  }
}
```

### Create Integration
```http
POST /integrations
```

**Request Body:**
```json
{
  "type": "gmail",
  "name": "Gmail Support",
  "config": {
    "email": "support@company.com",
    "clientId": "google_client_id",
    "clientSecret": "google_client_secret"
  }
}
```

### Test Integration
```http
POST /integrations/{id}/test
```

## 💬 Conversations API

### List Conversations
```http
GET /conversations
```

**Query Parameters:**
- `status` (optional): Filter by status (open, closed, pending)
- `assignedTo` (optional): Filter by assigned user ID
- `channel` (optional): Filter by channel (email, chat, voice)
- `page` (optional): Page number
- `limit` (optional): Items per page

**Response:**
```json
{
  "success": true,
  "data": {
    "conversations": [
      {
        "id": "conv_123",
        "subject": "Need help with billing",
        "status": "open",
        "priority": "medium",
        "channel": "email",
        "customer": {
          "id": "cust_123",
          "name": "Jane Doe",
          "email": "jane@example.com"
        },
        "assignedTo": {
          "id": "user_123",
          "name": "John Agent"
        },
        "messageCount": 5,
        "createdAt": "2024-01-01T00:00:00Z",
        "updatedAt": "2024-01-01T12:00:00Z"
      }
    ]
  }
}
```

### Create Conversation
```http
POST /conversations
```

### Get Conversation
```http
GET /conversations/{id}
```

### Update Conversation
```http
PUT /conversations/{id}
```

## 📨 Messages API

### List Messages
```http
GET /conversations/{conversationId}/messages
```

**Response:**
```json
{
  "success": true,
  "data": {
    "messages": [
      {
        "id": "msg_123",
        "conversationId": "conv_123",
        "content": "Hello, I need help with my account",
        "type": "customer",
        "channel": "email",
        "sender": {
          "id": "cust_123",
          "name": "Jane Doe",
          "email": "jane@example.com"
        },
        "aiAnalysis": {
          "sentiment": "neutral",
          "intent": "account_help",
          "confidence": 0.95
        },
        "createdAt": "2024-01-01T00:00:00Z"
      }
    ]
  }
}
```

### Send Message
```http
POST /conversations/{conversationId}/messages
```

**Request Body:**
```json
{
  "content": "Thank you for contacting us. How can I help you today?",
  "type": "agent"
}
```

## 🤖 AI Processing API

### Classify Message
```http
POST /ai/classify
```

**Request Body:**
```json
{
  "content": "I'm having trouble logging into my account",
  "context": {
    "channel": "email",
    "customerHistory": []
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "classification": {
      "intent": "login_issue",
      "sentiment": "frustrated",
      "priority": "medium",
      "confidence": 0.92,
      "suggestedActions": [
        "password_reset",
        "account_verification"
      ]
    }
  }
}
```

### Generate Response
```http
POST /ai/generate
```

**Request Body:**
```json
{
  "prompt": "Customer is having login issues",
  "context": {
    "conversationHistory": [],
    "customerInfo": {},
    "intent": "login_issue"
  },
  "provider": "openai"
}
```

### List AI Models
```http
GET /ai/models
```

## ⚡ Workflows API

### List Workflows
```http
GET /workflows
```

### Create Workflow
```http
POST /workflows
```

**Request Body:**
```json
{
  "name": "Auto-assign urgent tickets",
  "description": "Automatically assign high priority tickets to senior agents",
  "trigger": {
    "type": "message_received",
    "conditions": [
      {
        "field": "priority",
        "operator": "equals",
        "value": "high"
      }
    ]
  },
  "actions": [
    {
      "type": "assign_conversation",
      "config": {
        "assignTo": "senior_agent_pool"
      }
    }
  ]
}
```

### Execute Workflow
```http
POST /workflows/{id}/execute
```

## 📊 Analytics API

### Dashboard Metrics
```http
GET /analytics/dashboard
```

**Query Parameters:**
- `period` (optional): Time period (today, week, month, year)
- `timezone` (optional): Timezone for date calculations

**Response:**
```json
{
  "success": true,
  "data": {
    "metrics": {
      "totalConversations": 1250,
      "openConversations": 45,
      "averageResponseTime": 120,
      "customerSatisfaction": 4.2,
      "resolutionRate": 0.87
    },
    "trends": {
      "conversationsGrowth": 0.15,
      "responseTimeImprovement": -0.08
    }
  }
}
```

### Conversation Analytics
```http
GET /analytics/conversations
```

### Performance Metrics
```http
GET /analytics/performance
```

### Generate Report
```http
POST /analytics/reports
```

## 📞 Voice API

### List Calls
```http
GET /voice/calls
```

### Initiate Call
```http
POST /voice/calls
```

**Request Body:**
```json
{
  "to": "+1234567890",
  "from": "+0987654321",
  "conversationId": "conv_123"
}
```

### Get Call Details
```http
GET /voice/calls/{id}
```

### Voice Analytics
```http
GET /voice/analytics
```

## 🤝 Partners API

### List Partners
```http
GET /partners
```

### Create Partner
```http
POST /partners
```

### Partner Revenue
```http
GET /partners/{id}/revenue
```

## 🎨 Branding API

### Get Branding Settings
```http
GET /branding
```

### Update Branding
```http
PUT /branding
```

### Upload Assets
```http
POST /branding/assets
```

## 📊 Error Responses

All API endpoints return consistent error responses:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request parameters",
    "details": {
      "field": "email",
      "message": "Email is required"
    }
  }
}
```

### Common Error Codes
- `AUTHENTICATION_REQUIRED`: Missing or invalid authentication
- `AUTHORIZATION_FAILED`: Insufficient permissions
- `VALIDATION_ERROR`: Invalid request parameters
- `RESOURCE_NOT_FOUND`: Requested resource doesn't exist
- `RATE_LIMIT_EXCEEDED`: Too many requests
- `INTERNAL_SERVER_ERROR`: Server error

## 📚 Additional Resources

- [Integration Guide](./integrations.md)
- [Authentication Guide](./authentication.md)
- [Webhook Documentation](./webhooks.md)
- [SDK Documentation](./sdks.md)

For more detailed API documentation, visit our interactive API explorer at [api.universalai-cs.com](https://api.universalai-cs.com).
