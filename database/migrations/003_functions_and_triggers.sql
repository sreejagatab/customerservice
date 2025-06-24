-- Migration: 003_functions_and_triggers
-- Description: Create database functions, triggers, and views
-- Created: 2025-06-24

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at columns
CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_integrations_updated_at BEFORE UPDATE ON integrations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON conversations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_messages_updated_at BEFORE UPDATE ON messages FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_ai_models_updated_at BEFORE UPDATE ON ai_models FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_workflows_updated_at BEFORE UPDATE ON workflows FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_workflow_executions_updated_at BEFORE UPDATE ON workflow_executions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_webhooks_updated_at BEFORE UPDATE ON webhooks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_webhook_deliveries_updated_at BEFORE UPDATE ON webhook_deliveries FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_sessions_updated_at BEFORE UPDATE ON sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_api_keys_updated_at BEFORE UPDATE ON api_keys FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_rate_limits_updated_at BEFORE UPDATE ON rate_limits FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to update conversation last_message_at when a message is inserted
CREATE OR REPLACE FUNCTION update_conversation_last_message_at()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE conversations 
    SET last_message_at = NEW.created_at 
    WHERE id = NEW.conversation_id;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for updating conversation last_message_at
CREATE TRIGGER update_conversation_last_message_at_trigger 
    AFTER INSERT ON messages 
    FOR EACH ROW 
    EXECUTE FUNCTION update_conversation_last_message_at();

-- Function to clean up expired sessions
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM sessions WHERE expires_at < NOW();
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ language 'plpgsql';

-- Function to clean up old analytics events (older than 90 days)
CREATE OR REPLACE FUNCTION cleanup_old_analytics_events()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM analytics_events WHERE created_at < NOW() - INTERVAL '90 days';
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ language 'plpgsql';

-- Function to clean up old audit logs (older than 1 year)
CREATE OR REPLACE FUNCTION cleanup_old_audit_logs()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM audit_logs WHERE created_at < NOW() - INTERVAL '1 year';
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ language 'plpgsql';

-- Function to clean up old webhook deliveries (older than 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_webhook_deliveries()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM webhook_deliveries WHERE created_at < NOW() - INTERVAL '30 days';
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ language 'plpgsql';

-- Function to clean up old rate limit records (older than 24 hours)
CREATE OR REPLACE FUNCTION cleanup_old_rate_limits()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM rate_limits WHERE created_at < NOW() - INTERVAL '24 hours';
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ language 'plpgsql';

-- Create a view for conversation statistics
CREATE VIEW conversation_stats AS
SELECT 
    c.organization_id,
    c.integration_id,
    c.status,
    c.priority,
    COUNT(*) as count,
    AVG(c.response_time) as avg_response_time,
    AVG(c.resolution_time) as avg_resolution_time,
    AVG(c.satisfaction_rating) as avg_satisfaction_rating,
    DATE_TRUNC('day', c.created_at) as date
FROM conversations c
GROUP BY c.organization_id, c.integration_id, c.status, c.priority, DATE_TRUNC('day', c.created_at);

-- Create a view for message statistics
CREATE VIEW message_stats AS
SELECT 
    m.conversation_id,
    c.organization_id,
    c.integration_id,
    m.direction,
    m.status,
    COUNT(*) as count,
    DATE_TRUNC('day', m.created_at) as date
FROM messages m
JOIN conversations c ON m.conversation_id = c.id
GROUP BY m.conversation_id, c.organization_id, c.integration_id, m.direction, m.status, DATE_TRUNC('day', m.created_at);

-- Create a view for AI processing statistics
CREATE VIEW ai_processing_stats AS
SELECT 
    c.organization_id,
    (m.ai_classification->>'provider') as ai_provider,
    (m.ai_classification->>'model') as ai_model,
    COUNT(*) as total_requests,
    AVG((m.ai_classification->>'confidence')::float) as avg_confidence,
    AVG((m.ai_classification->>'processingTime')::float) as avg_processing_time,
    SUM((m.ai_response->>'cost')::float) as total_cost,
    DATE_TRUNC('day', m.processed_at) as date
FROM messages m
JOIN conversations c ON m.conversation_id = c.id
WHERE m.ai_classification IS NOT NULL
GROUP BY c.organization_id, (m.ai_classification->>'provider'), (m.ai_classification->>'model'), DATE_TRUNC('day', m.processed_at);

-- Create a view for workflow execution statistics
CREATE VIEW workflow_execution_stats AS
SELECT 
    w.organization_id,
    w.id as workflow_id,
    w.name as workflow_name,
    we.status,
    COUNT(*) as count,
    AVG(we.duration) as avg_duration,
    DATE_TRUNC('day', we.started_at) as date
FROM workflow_executions we
JOIN workflows w ON we.workflow_id = w.id
GROUP BY w.organization_id, w.id, w.name, we.status, DATE_TRUNC('day', we.started_at);
