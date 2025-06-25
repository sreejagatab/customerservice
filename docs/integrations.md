# 🔗 Integration Guide

Complete guide for integrating with external platforms and services.

## 📋 Overview

The Universal AI Customer Service Platform supports 20+ integrations with popular business platforms. This guide covers setup, configuration, and best practices for each integration.

## 📧 Email Integrations

### Gmail Integration

#### Prerequisites
- Google Cloud Console project
- Gmail API enabled
- OAuth 2.0 credentials

#### Setup Steps

1. **Create Google Cloud Project**
```bash
# Visit Google Cloud Console
https://console.cloud.google.com/

# Create new project or select existing
# Enable Gmail API
```

2. **Configure OAuth 2.0**
```json
{
  "client_id": "your-google-client-id",
  "client_secret": "your-google-client-secret",
  "redirect_uri": "https://your-domain.com/auth/google/callback"
}
```

3. **Add Integration via API**
```bash
curl -X POST https://api.universalai-cs.com/api/v1/integrations \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "gmail",
    "name": "Support Gmail",
    "config": {
      "email": "support@yourcompany.com",
      "clientId": "your-google-client-id",
      "clientSecret": "your-google-client-secret"
    }
  }'
```

#### Features
- ✅ Automatic email ingestion
- ✅ Two-way email sync
- ✅ Attachment handling
- ✅ Thread management
- ✅ Label synchronization

### Outlook Integration

#### Prerequisites
- Microsoft Azure AD application
- Microsoft Graph API permissions
- OAuth 2.0 credentials

#### Setup Steps

1. **Register Azure AD Application**
```bash
# Visit Azure Portal
https://portal.azure.com/

# App Registrations > New registration
# Configure API permissions for Microsoft Graph
```

2. **Required Permissions**
- `Mail.Read`
- `Mail.Send`
- `Mail.ReadWrite`
- `User.Read`

3. **Integration Configuration**
```json
{
  "type": "outlook",
  "name": "Outlook Integration",
  "config": {
    "clientId": "azure-app-client-id",
    "clientSecret": "azure-app-client-secret",
    "tenantId": "azure-tenant-id",
    "email": "support@yourcompany.com"
  }
}
```

## 💬 Chat Platform Integrations

### Slack Integration

#### Setup Steps

1. **Create Slack App**
```bash
# Visit Slack API
https://api.slack.com/apps

# Create New App > From scratch
# Add Bot Token Scopes
```

2. **Required Scopes**
- `channels:read`
- `chat:write`
- `im:read`
- `im:write`
- `users:read`

3. **Integration Configuration**
```json
{
  "type": "slack",
  "name": "Slack Support",
  "config": {
    "botToken": "xoxb-your-bot-token",
    "signingSecret": "your-signing-secret",
    "channel": "#support"
  }
}
```

#### Features
- ✅ Real-time message sync
- ✅ Thread support
- ✅ File attachments
- ✅ User mentions
- ✅ Custom slash commands

### Microsoft Teams Integration

#### Setup Steps

1. **Register Teams App**
```bash
# Visit Microsoft Teams Developer Portal
https://dev.teams.microsoft.com/

# Create new app
# Configure bot capabilities
```

2. **Integration Configuration**
```json
{
  "type": "teams",
  "name": "Teams Support",
  "config": {
    "appId": "teams-app-id",
    "appPassword": "teams-app-password",
    "tenantId": "azure-tenant-id"
  }
}
```

## 🛒 E-commerce Integrations

### Shopify Integration

#### Setup Steps

1. **Create Shopify App**
```bash
# Visit Shopify Partners
https://partners.shopify.com/

# Create app > Custom app
# Configure API permissions
```

2. **Required Permissions**
- `read_orders`
- `read_customers`
- `read_products`
- `write_orders`

3. **Integration Configuration**
```json
{
  "type": "shopify",
  "name": "Shopify Store",
  "config": {
    "shopDomain": "your-shop.myshopify.com",
    "apiKey": "shopify-api-key",
    "apiSecret": "shopify-api-secret",
    "accessToken": "shopify-access-token"
  }
}
```

#### Features
- ✅ Order synchronization
- ✅ Customer data sync
- ✅ Product information
- ✅ Inventory updates
- ✅ Webhook notifications

### WooCommerce Integration

#### Setup Steps

1. **Generate API Keys**
```bash
# WooCommerce > Settings > Advanced > REST API
# Create new key with Read/Write permissions
```

2. **Integration Configuration**
```json
{
  "type": "woocommerce",
  "name": "WooCommerce Store",
  "config": {
    "storeUrl": "https://yourstore.com",
    "consumerKey": "ck_your_consumer_key",
    "consumerSecret": "cs_your_consumer_secret"
  }
}
```

## 🏢 CRM Integrations

### Salesforce Integration

#### Setup Steps

1. **Create Connected App**
```bash
# Salesforce Setup > App Manager > New Connected App
# Enable OAuth settings
# Configure callback URL
```

2. **Integration Configuration**
```json
{
  "type": "salesforce",
  "name": "Salesforce CRM",
  "config": {
    "clientId": "salesforce-client-id",
    "clientSecret": "salesforce-client-secret",
    "instanceUrl": "https://yourinstance.salesforce.com",
    "username": "your-username",
    "password": "your-password",
    "securityToken": "your-security-token"
  }
}
```

#### Features
- ✅ Contact synchronization
- ✅ Lead management
- ✅ Opportunity tracking
- ✅ Case management
- ✅ Custom objects

### HubSpot Integration

#### Setup Steps

1. **Create HubSpot App**
```bash
# Visit HubSpot Developer Portal
https://developers.hubspot.com/

# Create app > Get API key
```

2. **Integration Configuration**
```json
{
  "type": "hubspot",
  "name": "HubSpot CRM",
  "config": {
    "apiKey": "hubspot-api-key",
    "portalId": "your-portal-id"
  }
}
```

## 📞 Voice Integrations

### Twilio Integration

#### Setup Steps

1. **Get Twilio Credentials**
```bash
# Visit Twilio Console
https://console.twilio.com/

# Account SID and Auth Token
# Purchase phone number
```

2. **Integration Configuration**
```json
{
  "type": "twilio",
  "name": "Twilio Voice",
  "config": {
    "accountSid": "twilio-account-sid",
    "authToken": "twilio-auth-token",
    "phoneNumber": "+1234567890"
  }
}
```

#### Features
- ✅ Inbound/outbound calls
- ✅ Call recording
- ✅ IVR flows
- ✅ SMS messaging
- ✅ Call analytics

## 🔧 Custom Integrations

### Webhook Integration

#### Setup Steps

1. **Configure Webhook Endpoint**
```json
{
  "type": "webhook",
  "name": "Custom Webhook",
  "config": {
    "url": "https://your-system.com/webhook",
    "method": "POST",
    "headers": {
      "Authorization": "Bearer your-token",
      "Content-Type": "application/json"
    },
    "events": ["message.received", "conversation.created"]
  }
}
```

2. **Webhook Payload Example**
```json
{
  "event": "message.received",
  "timestamp": "2024-01-01T00:00:00Z",
  "data": {
    "messageId": "msg_123",
    "conversationId": "conv_123",
    "content": "Hello, I need help",
    "customer": {
      "id": "cust_123",
      "email": "customer@example.com"
    }
  }
}
```

### REST API Integration

#### Setup Steps

1. **Configure API Integration**
```json
{
  "type": "rest_api",
  "name": "Custom API",
  "config": {
    "baseUrl": "https://api.your-system.com",
    "authentication": {
      "type": "bearer",
      "token": "your-api-token"
    },
    "endpoints": {
      "createTicket": "/tickets",
      "updateTicket": "/tickets/{id}",
      "getCustomer": "/customers/{id}"
    }
  }
}
```

## 🔒 Security Best Practices

### API Key Management
- Store API keys securely using environment variables
- Rotate keys regularly
- Use least privilege principle
- Monitor API key usage

### OAuth 2.0 Security
- Use HTTPS for all OAuth flows
- Validate redirect URIs
- Implement PKCE for public clients
- Store refresh tokens securely

### Webhook Security
- Verify webhook signatures
- Use HTTPS endpoints
- Implement idempotency
- Rate limit webhook endpoints

## 🧪 Testing Integrations

### Test Integration
```bash
curl -X POST https://api.universalai-cs.com/api/v1/integrations/{id}/test \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Integration Health Check
```bash
curl -X GET https://api.universalai-cs.com/api/v1/integrations/{id}/health \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## 📊 Monitoring Integrations

### Integration Metrics
- Message volume
- Success/failure rates
- Response times
- Error patterns

### Alerts
- Integration failures
- Rate limit warnings
- Authentication errors
- Webhook delivery failures

## 🚨 Troubleshooting

### Common Issues

#### Authentication Errors
```bash
# Check API credentials
# Verify OAuth tokens
# Confirm permissions
```

#### Rate Limiting
```bash
# Implement exponential backoff
# Monitor rate limit headers
# Distribute requests over time
```

#### Webhook Failures
```bash
# Check endpoint availability
# Verify SSL certificates
# Review webhook logs
```

## 📚 Additional Resources

- [API Reference](./api.md)
- [Webhook Documentation](./webhooks.md)
- [Security Guide](./security.md)
- [Troubleshooting Guide](./troubleshooting.md)

For integration support, contact our team at integrations@universalai-cs.com
