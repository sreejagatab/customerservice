-- AI Service Database Schema
-- Universal AI Customer Service Platform - Phase 3: AI Processing Engine

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- AI Providers table
CREATE TABLE IF NOT EXISTS ai_providers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL,
    name VARCHAR(100) NOT NULL,
    provider_type VARCHAR(50) NOT NULL, -- openai, anthropic, google, azure_openai, etc.
    api_key_encrypted TEXT NOT NULL,
    base_url VARCHAR(500),
    organization_identifier VARCHAR(255), -- For OpenAI org ID, etc.
    rate_limits JSONB DEFAULT '{}',
    cost_config JSONB DEFAULT '{}',
    features JSONB DEFAULT '[]',
    priority INTEGER DEFAULT 5,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(organization_id, name)
);

-- AI Models table
CREATE TABLE IF NOT EXISTS ai_models (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id UUID NOT NULL REFERENCES ai_providers(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    display_name VARCHAR(200) NOT NULL,
    model_type VARCHAR(50) NOT NULL, -- chat, completion, embedding, classification, etc.
    max_tokens INTEGER NOT NULL,
    context_window INTEGER NOT NULL,
    supported_languages JSONB DEFAULT '["en"]',
    capabilities JSONB DEFAULT '[]',
    cost_per_input_token DECIMAL(10, 8) DEFAULT 0,
    cost_per_output_token DECIMAL(10, 8) DEFAULT 0,
    average_latency_ms INTEGER DEFAULT 1000,
    quality_score INTEGER DEFAULT 80, -- 0-100
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(provider_id, name)
);

-- AI Processing Jobs table
CREATE TABLE IF NOT EXISTS ai_processing_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL,
    message_id UUID,
    conversation_id UUID,
    job_type VARCHAR(50) NOT NULL, -- classify_message, generate_response, etc.
    provider_id UUID REFERENCES ai_providers(id),
    model_id UUID REFERENCES ai_models(id),
    input_data JSONB NOT NULL,
    context_data JSONB DEFAULT '{}',
    options JSONB DEFAULT '{}',
    status VARCHAR(20) DEFAULT 'pending', -- pending, processing, completed, failed, cancelled
    result JSONB,
    error_message TEXT,
    tokens_used INTEGER DEFAULT 0,
    cost DECIMAL(10, 6) DEFAULT 0,
    processing_time_ms INTEGER,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- AI Classifications table (for message classification results)
CREATE TABLE IF NOT EXISTS ai_classifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id UUID NOT NULL,
    organization_id UUID NOT NULL,
    job_id UUID REFERENCES ai_processing_jobs(id),
    category VARCHAR(100) NOT NULL,
    subcategory VARCHAR(100),
    intent VARCHAR(100) NOT NULL,
    confidence DECIMAL(4, 3) NOT NULL, -- 0.000 to 1.000
    urgency VARCHAR(20) NOT NULL, -- low, normal, high, urgent, critical
    sentiment JSONB NOT NULL, -- {score: -1 to 1, label: positive/negative/neutral, confidence: 0-1}
    language VARCHAR(10) NOT NULL,
    topics JSONB DEFAULT '[]',
    entities JSONB DEFAULT '[]',
    reasoning TEXT,
    alternative_categories JSONB DEFAULT '[]',
    processing_time_ms INTEGER NOT NULL,
    model_used VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(message_id, organization_id)
);

-- AI Responses table (for generated responses)
CREATE TABLE IF NOT EXISTS ai_responses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id UUID NOT NULL,
    organization_id UUID NOT NULL,
    job_id UUID REFERENCES ai_processing_jobs(id),
    content TEXT NOT NULL,
    confidence DECIMAL(4, 3) NOT NULL,
    reasoning TEXT,
    suggested_actions JSONB DEFAULT '[]',
    requires_human_review BOOLEAN DEFAULT false,
    alternatives JSONB DEFAULT '[]',
    processing_time_ms INTEGER NOT NULL,
    model_used VARCHAR(100) NOT NULL,
    tokens_used INTEGER NOT NULL,
    cost DECIMAL(10, 6) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(message_id, organization_id)
);

-- AI Training Data table
CREATE TABLE IF NOT EXISTS ai_training_data (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL,
    data_type VARCHAR(50) NOT NULL, -- faq, conversation, policy, product_info, etc.
    title VARCHAR(500),
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    tags JSONB DEFAULT '[]',
    language VARCHAR(10) DEFAULT 'en',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- AI Performance Metrics table
CREATE TABLE IF NOT EXISTS ai_performance_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL,
    provider_id UUID REFERENCES ai_providers(id),
    model_id UUID REFERENCES ai_models(id),
    metric_type VARCHAR(50) NOT NULL, -- accuracy, latency, cost, satisfaction, etc.
    metric_value DECIMAL(10, 6) NOT NULL,
    measurement_period VARCHAR(20) NOT NULL, -- hourly, daily, weekly, monthly
    period_start TIMESTAMP WITH TIME ZONE NOT NULL,
    period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    sample_size INTEGER DEFAULT 1,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- AI Cost Tracking table
CREATE TABLE IF NOT EXISTS ai_cost_tracking (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL,
    provider_id UUID REFERENCES ai_providers(id),
    model_id UUID REFERENCES ai_models(id),
    job_id UUID REFERENCES ai_processing_jobs(id),
    operation_type VARCHAR(50) NOT NULL,
    tokens_input INTEGER DEFAULT 0,
    tokens_output INTEGER DEFAULT 0,
    cost_input DECIMAL(10, 6) DEFAULT 0,
    cost_output DECIMAL(10, 6) DEFAULT 0,
    total_cost DECIMAL(10, 6) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    billing_period DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_ai_providers_org_active ON ai_providers(organization_id, is_active);
CREATE INDEX IF NOT EXISTS idx_ai_models_provider_active ON ai_models(provider_id, is_active);
CREATE INDEX IF NOT EXISTS idx_ai_processing_jobs_org_status ON ai_processing_jobs(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_ai_processing_jobs_message ON ai_processing_jobs(message_id);
CREATE INDEX IF NOT EXISTS idx_ai_processing_jobs_created ON ai_processing_jobs(created_at);
CREATE INDEX IF NOT EXISTS idx_ai_classifications_message ON ai_classifications(message_id);
CREATE INDEX IF NOT EXISTS idx_ai_classifications_org ON ai_classifications(organization_id);
CREATE INDEX IF NOT EXISTS idx_ai_responses_message ON ai_responses(message_id);
CREATE INDEX IF NOT EXISTS idx_ai_responses_org ON ai_responses(organization_id);
CREATE INDEX IF NOT EXISTS idx_ai_training_data_org_type ON ai_training_data(organization_id, data_type);
CREATE INDEX IF NOT EXISTS idx_ai_training_data_active ON ai_training_data(is_active);
CREATE INDEX IF NOT EXISTS idx_ai_performance_metrics_org_period ON ai_performance_metrics(organization_id, period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_ai_cost_tracking_org_period ON ai_cost_tracking(organization_id, billing_period);
CREATE INDEX IF NOT EXISTS idx_ai_cost_tracking_provider ON ai_cost_tracking(provider_id, billing_period);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at columns
CREATE TRIGGER update_ai_providers_updated_at BEFORE UPDATE ON ai_providers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_ai_models_updated_at BEFORE UPDATE ON ai_models FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_ai_processing_jobs_updated_at BEFORE UPDATE ON ai_processing_jobs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_ai_training_data_updated_at BEFORE UPDATE ON ai_training_data FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
