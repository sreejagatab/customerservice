-- Seed: 001_initial_data
-- Description: Insert initial system data and default configurations
-- Created: 2025-06-24

-- Insert default organization (for development/demo)
INSERT INTO organizations (
    id,
    name,
    slug,
    plan,
    status,
    settings,
    limits
) VALUES (
    '00000000-0000-0000-0000-000000000001',
    'Demo Organization',
    'demo-org',
    'professional',
    'active',
    '{
        "timezone": "UTC",
        "language": "en",
        "branding": {
            "primaryColor": "#2563eb",
            "secondaryColor": "#64748b"
        },
        "notifications": {
            "email": true,
            "slack": false,
            "webhook": false
        },
        "security": {
            "mfaRequired": false,
            "sessionTimeout": 86400,
            "ipWhitelist": []
        }
    }',
    '{
        "maxUsers": 25,
        "maxIntegrations": 15,
        "maxMessagesPerMonth": 5000,
        "maxAiRequestsPerMonth": 2500,
        "maxWorkflows": 50,
        "storageLimit": 10240
    }'
) ON CONFLICT (id) DO NOTHING;

-- Insert default admin user (password: admin123!)
INSERT INTO users (
    id,
    organization_id,
    email,
    password_hash,
    first_name,
    last_name,
    role,
    permissions,
    status,
    email_verified,
    preferences
) VALUES (
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    'admin@demo.com',
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj/RK.PmvlJO', -- admin123!
    'Admin',
    'User',
    'admin',
    ARRAY[
        'org:read', 'org:write',
        'user:read', 'user:write', 'user:delete',
        'integration:read', 'integration:write', 'integration:delete',
        'message:read', 'message:write',
        'ai:read', 'ai:write', 'ai:train',
        'workflow:read', 'workflow:write', 'workflow:execute',
        'analytics:read', 'analytics:export'
    ],
    'active',
    true,
    '{
        "language": "en",
        "timezone": "UTC",
        "notifications": {
            "email": true,
            "browser": true,
            "mobile": false
        },
        "dashboard": {
            "layout": "grid",
            "widgets": ["overview", "recent_conversations", "ai_stats", "integration_health"]
        }
    }'
) ON CONFLICT (id) DO NOTHING;

-- Insert default AI models for the demo organization
INSERT INTO ai_models (
    organization_id,
    provider,
    model_name,
    display_name,
    config,
    is_active,
    priority,
    cost_per_input_token,
    cost_per_output_token,
    max_tokens,
    context_window,
    capabilities
) VALUES 
(
    '00000000-0000-0000-0000-000000000001',
    'openai',
    'gpt-4',
    'GPT-4',
    '{
        "temperature": 0.7,
        "top_p": 1.0,
        "frequency_penalty": 0.0,
        "presence_penalty": 0.0
    }',
    true,
    1,
    0.00003,
    0.00006,
    4000,
    8192,
    ARRAY['text_generation', 'text_classification', 'sentiment_analysis', 'entity_extraction', 'question_answering']
),
(
    '00000000-0000-0000-0000-000000000001',
    'openai',
    'gpt-3.5-turbo',
    'GPT-3.5 Turbo',
    '{
        "temperature": 0.7,
        "top_p": 1.0,
        "frequency_penalty": 0.0,
        "presence_penalty": 0.0
    }',
    true,
    2,
    0.000001,
    0.000002,
    4000,
    4096,
    ARRAY['text_generation', 'text_classification', 'sentiment_analysis', 'entity_extraction']
),
(
    '00000000-0000-0000-0000-000000000001',
    'anthropic',
    'claude-3-sonnet-20240229',
    'Claude 3 Sonnet',
    '{
        "temperature": 0.7,
        "max_tokens": 2000
    }',
    false,
    3,
    0.000003,
    0.000015,
    2000,
    200000,
    ARRAY['text_generation', 'text_classification', 'sentiment_analysis', 'entity_extraction', 'question_answering']
) ON CONFLICT DO NOTHING;

-- Insert sample integration templates
INSERT INTO integrations (
    organization_id,
    name,
    type,
    provider,
    config,
    credentials,
    status
) VALUES 
(
    '00000000-0000-0000-0000-000000000001',
    'Demo Gmail Integration',
    'email',
    'gmail',
    '{
        "autoSync": true,
        "syncInterval": 5,
        "batchSize": 50,
        "retryAttempts": 3,
        "timeout": 30,
        "fieldMapping": {
            "sender": "from.email",
            "subject": "subject",
            "body": "body.text",
            "timestamp": "date",
            "messageId": "id"
        },
        "filters": {
            "labels": ["INBOX"],
            "excludeSpam": true
        }
    }',
    '{
        "type": "oauth2",
        "accessToken": "demo_access_token",
        "refreshToken": "demo_refresh_token",
        "expiresAt": "2025-12-31T23:59:59Z"
    }',
    'inactive'
) ON CONFLICT DO NOTHING;

-- Insert sample workflow templates
INSERT INTO workflows (
    organization_id,
    name,
    description,
    status,
    triggers,
    steps,
    variables,
    settings,
    tags,
    created_by
) VALUES (
    '00000000-0000-0000-0000-000000000001',
    'Auto-classify and Route Messages',
    'Automatically classify incoming messages and route them based on urgency and category',
    'draft',
    '[
        {
            "id": "trigger_1",
            "type": "message_received",
            "name": "New Message Received",
            "conditions": [
                {
                    "field": "direction",
                    "operator": "equals",
                    "value": "inbound"
                }
            ],
            "settings": {
                "debounceMs": 1000
            },
            "active": true
        }
    ]',
    '[
        {
            "id": "step_1",
            "type": "ai_classify",
            "name": "Classify Message",
            "position": {"x": 100, "y": 100},
            "config": {
                "provider": "openai",
                "model": "gpt-3.5-turbo",
                "includeContext": true,
                "confidenceThreshold": 0.8
            },
            "onSuccess": "step_2",
            "onFailure": "step_error",
            "active": true
        },
        {
            "id": "step_2",
            "type": "condition",
            "name": "Check Urgency",
            "position": {"x": 300, "y": 100},
            "config": {
                "conditions": [
                    {
                        "field": "ai_classification.urgency",
                        "operator": "in",
                        "value": ["urgent", "critical"]
                    }
                ]
            },
            "onSuccess": "step_3",
            "onFailure": "step_4",
            "active": true
        },
        {
            "id": "step_3",
            "type": "escalate_to_human",
            "name": "Escalate Urgent",
            "position": {"x": 500, "y": 50},
            "config": {
                "department": "support",
                "priority": "high",
                "message": "Urgent message requires immediate attention"
            },
            "active": true
        },
        {
            "id": "step_4",
            "type": "ai_generate_response",
            "name": "Generate Auto-Response",
            "position": {"x": 500, "y": 150},
            "config": {
                "provider": "openai",
                "model": "gpt-3.5-turbo",
                "tone": "professional",
                "includeReasoning": false
            },
            "active": true
        }
    ]',
    '[
        {
            "name": "confidence_threshold",
            "type": "number",
            "defaultValue": 0.8,
            "description": "Minimum confidence score for AI classification",
            "required": true
        }
    ]',
    '{
        "maxExecutionTime": 300,
        "maxConcurrentExecutions": 10,
        "errorHandling": "continue_on_error",
        "logging": {
            "level": "info",
            "includeVariables": true,
            "includeStepOutputs": true,
            "retentionDays": 30
        },
        "notifications": {
            "onSuccess": false,
            "onFailure": true,
            "onTimeout": true,
            "recipients": ["admin@demo.com"],
            "channels": ["email"]
        }
    }',
    ARRAY['auto-classification', 'routing', 'ai'],
    '00000000-0000-0000-0000-000000000001'
) ON CONFLICT DO NOTHING;

-- Insert sample analytics events for demo data
INSERT INTO analytics_events (
    organization_id,
    event_type,
    event_data,
    user_id,
    metadata
) VALUES 
(
    '00000000-0000-0000-0000-000000000001',
    'user_login',
    '{"ip_address": "127.0.0.1", "user_agent": "Demo Browser"}',
    '00000000-0000-0000-0000-000000000001',
    '{"source": "web_app", "version": "1.0.0"}'
),
(
    '00000000-0000-0000-0000-000000000001',
    'system_startup',
    '{"services": ["api-gateway", "auth-service", "ai-service"], "startup_time": 5.2}',
    null,
    '{"source": "system", "environment": "development"}'
) ON CONFLICT DO NOTHING;
