# Universal AI Customer Service Platform - API Documentation

## Overview

The Universal AI Customer Service Platform provides a comprehensive REST API for integrating with your existing systems and building custom applications.

**Base URL**: `https://api.universalai-cs.com/v1`

## Authentication

All API requests require authentication using API keys.

### API Key Authentication
```http
Authorization: Bearer YOUR_API_KEY
```

### Getting API Keys
1. Log into your dashboard
2. Navigate to Settings → Security → API Keys
3. Click "Create New API Key"
4. Copy and securely store your key

## Rate Limiting

- **Standard Plan**: 1,000 requests per hour
- **Professional Plan**: 10,000 requests per hour
- **Enterprise Plan**: 100,000 requests per hour

Rate limit headers are included in all responses:
```http
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1640995200
```

## Error Handling

The API uses standard HTTP status codes and returns detailed error information:

```json
{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "The request is missing required parameters",
    "details": {
      "missing_fields": ["email", "message"]
    }
  }
}
```

### Common Error Codes
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `429` - Rate Limited
- `500` - Internal Server Error

## Endpoints

### Messages

#### Send Message
Send a message through the AI processing pipeline.

```http
POST /messages
```

**Request Body:**
```json
{
  "integration_id": "gmail-123",
  "from": "customer@example.com",
  "to": "support@company.com",
  "subject": "Order inquiry",
  "body": "Where is my order #12345?",
  "metadata": {
    "customer_id": "cust_123",
    "order_id": "12345"
  }
}
```

**Response:**
```json
{
  "id": "msg_abc123",
  "status": "processed",
  "ai_response": {
    "category": "order_inquiry",
    "intent": "track_order",
    "confidence": 0.95,
    "response": "Let me help you track your order #12345...",
    "auto_sent": true
  },
  "processing_time": 1250,
  "created_at": "2024-01-15T10:30:00Z"
}
```

#### Get Message
Retrieve a specific message by ID.

```http
GET /messages/{message_id}
```

**Response:**
```json
{
  "id": "msg_abc123",
  "integration_id": "gmail-123",
  "from": "customer@example.com",
  "to": "support@company.com",
  "subject": "Order inquiry",
  "body": "Where is my order #12345?",
  "ai_response": {
    "category": "order_inquiry",
    "intent": "track_order",
    "confidence": 0.95,
    "response": "Let me help you track your order #12345...",
    "auto_sent": true
  },
  "status": "resolved",
  "created_at": "2024-01-15T10:30:00Z",
  "updated_at": "2024-01-15T10:31:00Z"
}
```

#### List Messages
Get a paginated list of messages.

```http
GET /messages?limit=50&offset=0&status=open&integration_id=gmail-123
```

**Query Parameters:**
- `limit` (optional): Number of results (max 100, default 50)
- `offset` (optional): Pagination offset (default 0)
- `status` (optional): Filter by status (open, resolved, pending, escalated)
- `integration_id` (optional): Filter by integration
- `from_date` (optional): Filter messages after date (ISO 8601)
- `to_date` (optional): Filter messages before date (ISO 8601)

### Conversations

#### Get Conversation
Retrieve a conversation thread.

```http
GET /conversations/{conversation_id}
```

**Response:**
```json
{
  "id": "conv_xyz789",
  "subject": "Order inquiry",
  "status": "open",
  "priority": "medium",
  "customer": {
    "email": "customer@example.com",
    "name": "John Doe"
  },
  "messages": [
    {
      "id": "msg_abc123",
      "from": "customer@example.com",
      "body": "Where is my order #12345?",
      "timestamp": "2024-01-15T10:30:00Z"
    }
  ],
  "created_at": "2024-01-15T10:30:00Z",
  "updated_at": "2024-01-15T10:31:00Z"
}
```

#### Update Conversation
Update conversation status or properties.

```http
PATCH /conversations/{conversation_id}
```

**Request Body:**
```json
{
  "status": "resolved",
  "priority": "high",
  "assigned_to": "agent_123",
  "tags": ["order", "urgent"]
}
```

### Integrations

#### List Integrations
Get all configured integrations.

```http
GET /integrations
```

**Response:**
```json
{
  "integrations": [
    {
      "id": "gmail-123",
      "name": "Gmail Support",
      "type": "email",
      "status": "connected",
      "config": {
        "email": "support@company.com",
        "auto_response": true
      },
      "created_at": "2024-01-10T09:00:00Z"
    }
  ]
}
```

#### Create Integration
Add a new integration.

```http
POST /integrations
```

**Request Body:**
```json
{
  "name": "Custom SMTP",
  "type": "smtp",
  "config": {
    "smtp_host": "smtp.example.com",
    "smtp_port": 587,
    "imap_host": "imap.example.com",
    "imap_port": 993,
    "username": "support@company.com",
    "password": "app_password"
  }
}
```

### AI Training

#### Add Training Example
Add a new training example for AI improvement.

```http
POST /training/examples
```

**Request Body:**
```json
{
  "input": "How do I return an item?",
  "expected_category": "return_request",
  "expected_intent": "initiate_return",
  "expected_response": "I can help you start the return process..."
}
```

#### Trigger Model Training
Start training the AI model with new examples.

```http
POST /training/train
```

**Request Body:**
```json
{
  "training_set_id": "ts_123",
  "validation_split": 0.2,
  "epochs": 10
}
```

**Response:**
```json
{
  "training_job_id": "job_abc123",
  "status": "started",
  "estimated_completion": "2024-01-15T12:00:00Z"
}
```

### Analytics

#### Get Metrics
Retrieve performance metrics.

```http
GET /analytics/metrics?from_date=2024-01-01&to_date=2024-01-31
```

**Response:**
```json
{
  "period": {
    "from": "2024-01-01T00:00:00Z",
    "to": "2024-01-31T23:59:59Z"
  },
  "metrics": {
    "total_messages": 12847,
    "avg_response_time": 2.3,
    "ai_accuracy": 0.942,
    "resolution_rate": 0.875,
    "customer_satisfaction": 4.6
  },
  "by_integration": {
    "gmail-123": {
      "messages": 8234,
      "accuracy": 0.951
    }
  }
}
```

## Webhooks

Configure webhooks to receive real-time notifications about events.

### Webhook Events
- `message.received` - New message received
- `message.processed` - Message processed by AI
- `conversation.escalated` - Conversation escalated
- `integration.error` - Integration error occurred

### Webhook Configuration
```http
POST /webhooks
```

**Request Body:**
```json
{
  "url": "https://your-app.com/webhooks/uaics",
  "events": ["message.received", "conversation.escalated"],
  "secret": "your_webhook_secret"
}
```

### Webhook Payload Example
```json
{
  "event": "message.received",
  "data": {
    "message_id": "msg_abc123",
    "conversation_id": "conv_xyz789",
    "from": "customer@example.com",
    "subject": "Order inquiry",
    "body": "Where is my order #12345?"
  },
  "timestamp": "2024-01-15T10:30:00Z"
}
```

## SDKs and Libraries

### JavaScript/Node.js
```bash
npm install @universalai-cs/sdk
```

```javascript
const UAICS = require('@universalai-cs/sdk');

const client = new UAICS({
  apiKey: 'your_api_key'
});

// Send a message
const response = await client.messages.create({
  integration_id: 'gmail-123',
  from: 'customer@example.com',
  body: 'Hello, I need help with my order'
});
```

### Python
```bash
pip install universalai-cs
```

```python
import universalai_cs

client = universalai_cs.Client(api_key='your_api_key')

# Send a message
response = client.messages.create(
    integration_id='gmail-123',
    from_email='customer@example.com',
    body='Hello, I need help with my order'
)
```

### cURL Examples

#### Send Message
```bash
curl -X POST https://api.universalai-cs.com/v1/messages \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "integration_id": "gmail-123",
    "from": "customer@example.com",
    "body": "Where is my order #12345?"
  }'
```

#### Get Analytics
```bash
curl -X GET "https://api.universalai-cs.com/v1/analytics/metrics?from_date=2024-01-01" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

## Testing

### Sandbox Environment
Use the sandbox environment for testing:
- **Base URL**: `https://api-sandbox.universalai-cs.com/v1`
- **Test API Keys**: Available in dashboard under "Development"

### Postman Collection
Download our Postman collection for easy API testing:
[Download Collection](https://api.universalai-cs.com/postman/collection.json)

## Support

- **API Documentation**: https://docs.universalai-cs.com/api
- **Status Page**: https://status.universalai-cs.com
- **Support Email**: api-support@universalai-cs.com
- **Developer Forum**: https://community.universalai-cs.com
