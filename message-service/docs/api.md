# Message Service API Documentation

## Overview

The Message Service is a core component of the Universal AI Customer Service Platform that handles message processing, routing, and management. It provides RESTful APIs for creating, retrieving, updating, and processing messages.

## Base URL

```
http://localhost:3004/api/v1
```

## Authentication

All API requests require the following headers:

- `x-organization-id`: Organization identifier
- `x-integration-id`: Integration identifier
- `Authorization`: Bearer token (optional for some endpoints)

## Rate Limiting

The API implements rate limiting to ensure fair usage:

- **General API**: 1000 requests per minute per IP
- **Message Creation**: 100 requests per minute per organization
- **AI Processing**: 20 requests per minute per organization
- **Search**: 50 requests per minute per user

Rate limit headers are included in responses:
- `X-RateLimit-Limit`: Maximum requests allowed
- `X-RateLimit-Remaining`: Remaining requests in current window
- `X-RateLimit-Reset`: Time when the rate limit resets

## Error Handling

All errors follow a consistent format:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable error message",
    "timestamp": "2024-01-01T00:00:00.000Z",
    "requestId": "req-123456789",
    "details": {}
  }
}
```

Common error codes:
- `VALIDATION_ERROR`: Request validation failed
- `NOT_FOUND`: Resource not found
- `RATE_LIMIT_EXCEEDED`: Rate limit exceeded
- `UNAUTHORIZED`: Authentication required
- `FORBIDDEN`: Access denied
- `INTERNAL_ERROR`: Server error

## Endpoints

### Health Check

#### GET /health

Check service health status.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "service": "message-service",
  "version": "1.0.0",
  "environment": "production",
  "uptime": 3600,
  "checks": {
    "database": {
      "status": "healthy",
      "responseTime": 5
    },
    "redis": {
      "status": "healthy",
      "responseTime": 2
    }
  }
}
```

### Messages

#### GET /messages

List messages with pagination and filtering.

**Query Parameters:**
- `page` (integer, optional): Page number (default: 1)
- `limit` (integer, optional): Items per page (default: 20, max: 100)
- `conversationId` (UUID, optional): Filter by conversation ID
- `direction` (string, optional): Filter by direction (`inbound` or `outbound`)
- `status` (string, optional): Filter by status
- `startDate` (ISO 8601, optional): Filter messages after this date
- `endDate` (ISO 8601, optional): Filter messages before this date

**Response:**
```json
{
  "success": true,
  "data": {
    "messages": [
      {
        "id": "123e4567-e89b-12d3-a456-426614174000",
        "conversationId": "456e7890-e89b-12d3-a456-426614174001",
        "externalId": "email-123",
        "direction": "inbound",
        "content": {
          "text": "Hello, I need help with my order",
          "html": "<p>Hello, I need help with my order</p>",
          "format": "text"
        },
        "sender": {
          "email": "customer@example.com",
          "name": "John Doe",
          "type": "customer"
        },
        "recipient": {
          "email": "support@company.com",
          "name": "Support Team"
        },
        "status": "processed",
        "aiClassification": {
          "category": "order_inquiry",
          "urgency": "normal",
          "sentiment": {
            "label": "neutral",
            "score": 0.1
          }
        },
        "attachments": [],
        "metadata": {
          "organizationId": "org-123",
          "integrationId": "integration-456"
        },
        "processedAt": "2024-01-01T00:05:00.000Z",
        "createdAt": "2024-01-01T00:00:00.000Z",
        "updatedAt": "2024-01-01T00:05:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 150,
      "totalPages": 8
    }
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

#### POST /messages

Create a new message.

**Request Body:**
```json
{
  "conversationId": "456e7890-e89b-12d3-a456-426614174001",
  "externalId": "email-123",
  "direction": "inbound",
  "content": {
    "text": "Hello, I need help with my order",
    "html": "<p>Hello, I need help with my order</p>",
    "format": "text"
  },
  "sender": {
    "email": "customer@example.com",
    "name": "John Doe",
    "phone": "+1234567890",
    "type": "customer"
  },
  "recipient": {
    "email": "support@company.com",
    "name": "Support Team"
  },
  "attachments": [
    {
      "filename": "order-receipt.pdf",
      "contentType": "application/pdf",
      "size": 1024000,
      "url": "https://storage.example.com/files/receipt.pdf"
    }
  ],
  "metadata": {
    "source": "email",
    "priority": "normal"
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "messageId": "123e4567-e89b-12d3-a456-426614174000",
    "status": "queued",
    "processingTime": 45
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

#### GET /messages/{id}

Retrieve a specific message by ID.

**Path Parameters:**
- `id` (UUID, required): Message ID

**Response:**
```json
{
  "success": true,
  "data": {
    "message": {
      "id": "123e4567-e89b-12d3-a456-426614174000",
      "conversationId": "456e7890-e89b-12d3-a456-426614174001",
      "direction": "inbound",
      "content": {
        "text": "Hello, I need help with my order",
        "format": "text"
      },
      "sender": {
        "email": "customer@example.com",
        "name": "John Doe",
        "type": "customer"
      },
      "status": "processed",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:05:00.000Z"
    }
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

#### PUT /messages/{id}

Update a message.

**Path Parameters:**
- `id` (UUID, required): Message ID

**Request Body:**
```json
{
  "status": "read",
  "metadata": {
    "readBy": "agent-123",
    "readAt": "2024-01-01T00:10:00.000Z"
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "message": {
      "id": "123e4567-e89b-12d3-a456-426614174000",
      "status": "read",
      "metadata": {
        "readBy": "agent-123",
        "readAt": "2024-01-01T00:10:00.000Z"
      },
      "updatedAt": "2024-01-01T00:10:00.000Z"
    }
  },
  "timestamp": "2024-01-01T00:10:00.000Z"
}
```

#### DELETE /messages/{id}

Delete a message.

**Path Parameters:**
- `id` (UUID, required): Message ID

**Response:**
```
HTTP 204 No Content
```

#### POST /messages/{id}/process

Process a message with AI.

**Path Parameters:**
- `id` (UUID, required): Message ID

**Request Body:**
```json
{
  "forceReprocess": false,
  "skipAi": false
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "message": {
      "id": "123e4567-e89b-12d3-a456-426614174000",
      "status": "processed",
      "aiClassification": {
        "category": "order_inquiry",
        "urgency": "normal",
        "sentiment": {
          "label": "neutral",
          "score": 0.1
        }
      },
      "aiResponse": {
        "suggestedReply": "Thank you for contacting us about your order...",
        "confidence": 0.85
      }
    },
    "processingTime": 1250,
    "aiClassification": {
      "category": "order_inquiry",
      "urgency": "normal"
    },
    "aiResponse": {
      "suggestedReply": "Thank you for contacting us about your order..."
    }
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

#### POST /messages/batch

Batch process multiple messages.

**Request Body:**
```json
{
  "messageIds": [
    "123e4567-e89b-12d3-a456-426614174000",
    "456e7890-e89b-12d3-a456-426614174001"
  ],
  "operation": "process"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "processed": 2,
    "failed": 0,
    "results": [
      {
        "messageId": "123e4567-e89b-12d3-a456-426614174000",
        "status": "success"
      },
      {
        "messageId": "456e7890-e89b-12d3-a456-426614174001",
        "status": "success"
      }
    ]
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

#### POST /messages/search

Search messages by content and filters.

**Request Body:**
```json
{
  "query": "order help",
  "filters": {
    "direction": "inbound",
    "status": "processed",
    "startDate": "2024-01-01T00:00:00.000Z",
    "endDate": "2024-01-31T23:59:59.999Z"
  },
  "page": 1,
  "limit": 20
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "messages": [
      {
        "id": "123e4567-e89b-12d3-a456-426614174000",
        "content": {
          "text": "I need help with my order #12345"
        },
        "relevanceScore": 0.95
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 5,
      "totalPages": 1
    },
    "searchTime": 125,
    "query": "order help"
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

#### GET /messages/{id}/history

Get message processing history.

**Path Parameters:**
- `id` (UUID, required): Message ID

**Response:**
```json
{
  "success": true,
  "data": {
    "history": [
      {
        "timestamp": "2024-01-01T00:00:00.000Z",
        "event": "message_received",
        "details": {
          "source": "email",
          "integration": "gmail"
        }
      },
      {
        "timestamp": "2024-01-01T00:01:00.000Z",
        "event": "ai_classification",
        "details": {
          "category": "order_inquiry",
          "confidence": 0.92
        }
      },
      {
        "timestamp": "2024-01-01T00:02:00.000Z",
        "event": "message_routed",
        "details": {
          "assignedTo": "agent-123",
          "team": "support"
        }
      }
    ]
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## WebSocket Events

The service supports real-time updates via WebSocket connections.

### Connection

Connect to: `ws://localhost:3004`

### Authentication

Send authentication message after connection:

```json
{
  "event": "authenticate",
  "data": {
    "token": "your-jwt-token",
    "organizationId": "org-123",
    "userId": "user-456"
  }
}
```

### Subscription

Subscribe to conversation updates:

```json
{
  "event": "subscribe_conversation",
  "data": {
    "conversationId": "456e7890-e89b-12d3-a456-426614174001"
  }
}
```

### Events

#### message_update

Received when a message is created, updated, or status changes:

```json
{
  "event": "message_update",
  "data": {
    "type": "message_created",
    "messageId": "123e4567-e89b-12d3-a456-426614174000",
    "conversationId": "456e7890-e89b-12d3-a456-426614174001",
    "organizationId": "org-123",
    "data": {
      "message": {
        "id": "123e4567-e89b-12d3-a456-426614174000",
        "content": {
          "text": "New message content"
        },
        "status": "received"
      }
    },
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

#### typing_indicator

Received when someone is typing:

```json
{
  "event": "typing_indicator",
  "data": {
    "conversationId": "456e7890-e89b-12d3-a456-426614174001",
    "userId": "user-123",
    "isTyping": true,
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

## SDK Examples

### JavaScript/Node.js

```javascript
const axios = require('axios');

const messageService = axios.create({
  baseURL: 'http://localhost:3004/api/v1',
  headers: {
    'x-organization-id': 'your-org-id',
    'x-integration-id': 'your-integration-id',
    'Authorization': 'Bearer your-token'
  }
});

// Create a message
const createMessage = async (messageData) => {
  try {
    const response = await messageService.post('/messages', messageData);
    return response.data;
  } catch (error) {
    console.error('Error creating message:', error.response.data);
    throw error;
  }
};

// List messages
const listMessages = async (filters = {}) => {
  try {
    const response = await messageService.get('/messages', { params: filters });
    return response.data;
  } catch (error) {
    console.error('Error listing messages:', error.response.data);
    throw error;
  }
};
```

### Python

```python
import requests

class MessageServiceClient:
    def __init__(self, base_url, org_id, integration_id, token=None):
        self.base_url = base_url
        self.headers = {
            'x-organization-id': org_id,
            'x-integration-id': integration_id,
            'Content-Type': 'application/json'
        }
        if token:
            self.headers['Authorization'] = f'Bearer {token}'
    
    def create_message(self, message_data):
        response = requests.post(
            f'{self.base_url}/messages',
            json=message_data,
            headers=self.headers
        )
        response.raise_for_status()
        return response.json()
    
    def list_messages(self, **filters):
        response = requests.get(
            f'{self.base_url}/messages',
            params=filters,
            headers=self.headers
        )
        response.raise_for_status()
        return response.json()

# Usage
client = MessageServiceClient(
    'http://localhost:3004/api/v1',
    'your-org-id',
    'your-integration-id',
    'your-token'
)

message = client.create_message({
    'conversationId': '456e7890-e89b-12d3-a456-426614174001',
    'direction': 'inbound',
    'content': {'text': 'Hello, world!', 'format': 'text'},
    'sender': {'email': 'user@example.com', 'type': 'customer'}
})
```
