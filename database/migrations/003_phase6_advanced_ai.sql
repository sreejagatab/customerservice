-- Phase 6.2: Advanced AI & Machine Learning Migration
-- This migration adds custom model training, industry-specific AI, and predictive analytics capabilities

-- Custom AI Models table (for organization-specific trained models)
CREATE TABLE IF NOT EXISTS custom_ai_models (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    industry VARCHAR(100), -- 'healthcare', 'finance', 'ecommerce', 'legal', 'general'
    base_model VARCHAR(100) NOT NULL, -- 'gpt-4', 'claude-3', 'gemini-pro'
    model_version VARCHAR(50) DEFAULT '1.0.0',
    training_status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'training', 'completed', 'failed', 'deployed'
    training_data_size INTEGER DEFAULT 0,
    training_started_at TIMESTAMP WITH TIME ZONE,
    training_completed_at TIMESTAMP WITH TIME ZONE,
    deployment_status VARCHAR(50) DEFAULT 'not_deployed', -- 'not_deployed', 'deploying', 'deployed', 'failed'
    model_endpoint VARCHAR(500),
    performance_metrics JSONB DEFAULT '{}',
    training_config JSONB DEFAULT '{}',
    validation_results JSONB DEFAULT '{}',
    cost_per_request DECIMAL(10, 8) DEFAULT 0,
    accuracy_score DECIMAL(5, 4), -- 0.0000 to 1.0000
    f1_score DECIMAL(5, 4),
    precision_score DECIMAL(5, 4),
    recall_score DECIMAL(5, 4),
    is_active BOOLEAN DEFAULT FALSE,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for custom_ai_models
CREATE INDEX IF NOT EXISTS idx_custom_ai_models_organization_id ON custom_ai_models(organization_id);
CREATE INDEX IF NOT EXISTS idx_custom_ai_models_industry ON custom_ai_models(industry);
CREATE INDEX IF NOT EXISTS idx_custom_ai_models_training_status ON custom_ai_models(training_status);
CREATE INDEX IF NOT EXISTS idx_custom_ai_models_deployment_status ON custom_ai_models(deployment_status);
CREATE INDEX IF NOT EXISTS idx_custom_ai_models_is_active ON custom_ai_models(is_active);
CREATE INDEX IF NOT EXISTS idx_custom_ai_models_created_by ON custom_ai_models(created_by);

-- Training Datasets table
CREATE TABLE IF NOT EXISTS training_datasets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    dataset_type VARCHAR(50) NOT NULL, -- 'classification', 'generation', 'sentiment', 'intent'
    industry VARCHAR(100),
    data_format VARCHAR(50) DEFAULT 'jsonl', -- 'jsonl', 'csv', 'json'
    file_path VARCHAR(500),
    file_size BIGINT DEFAULT 0,
    record_count INTEGER DEFAULT 0,
    validation_split DECIMAL(3, 2) DEFAULT 0.20, -- 20% for validation
    data_quality_score DECIMAL(5, 4),
    preprocessing_config JSONB DEFAULT '{}',
    schema_definition JSONB DEFAULT '{}',
    sample_data JSONB DEFAULT '{}',
    upload_status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'uploading', 'processing', 'ready', 'failed'
    processing_errors JSONB DEFAULT '[]',
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for training_datasets
CREATE INDEX IF NOT EXISTS idx_training_datasets_organization_id ON training_datasets(organization_id);
CREATE INDEX IF NOT EXISTS idx_training_datasets_dataset_type ON training_datasets(dataset_type);
CREATE INDEX IF NOT EXISTS idx_training_datasets_industry ON training_datasets(industry);
CREATE INDEX IF NOT EXISTS idx_training_datasets_upload_status ON training_datasets(upload_status);
CREATE INDEX IF NOT EXISTS idx_training_datasets_created_by ON training_datasets(created_by);

-- Model Training Jobs table
CREATE TABLE IF NOT EXISTS model_training_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    custom_model_id UUID NOT NULL REFERENCES custom_ai_models(id) ON DELETE CASCADE,
    dataset_id UUID NOT NULL REFERENCES training_datasets(id) ON DELETE CASCADE,
    job_name VARCHAR(255) NOT NULL,
    training_config JSONB NOT NULL DEFAULT '{}',
    hyperparameters JSONB DEFAULT '{}',
    status VARCHAR(50) DEFAULT 'queued', -- 'queued', 'running', 'completed', 'failed', 'cancelled'
    progress_percentage INTEGER DEFAULT 0,
    current_epoch INTEGER DEFAULT 0,
    total_epochs INTEGER DEFAULT 10,
    loss_history JSONB DEFAULT '[]',
    validation_metrics JSONB DEFAULT '{}',
    training_logs TEXT,
    error_message TEXT,
    compute_resources JSONB DEFAULT '{}', -- GPU type, memory, etc.
    estimated_completion_time TIMESTAMP WITH TIME ZONE,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    total_cost DECIMAL(10, 2) DEFAULT 0,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for model_training_jobs
CREATE INDEX IF NOT EXISTS idx_model_training_jobs_custom_model_id ON model_training_jobs(custom_model_id);
CREATE INDEX IF NOT EXISTS idx_model_training_jobs_dataset_id ON model_training_jobs(dataset_id);
CREATE INDEX IF NOT EXISTS idx_model_training_jobs_status ON model_training_jobs(status);
CREATE INDEX IF NOT EXISTS idx_model_training_jobs_created_by ON model_training_jobs(created_by);
CREATE INDEX IF NOT EXISTS idx_model_training_jobs_started_at ON model_training_jobs(started_at);

-- Model Evaluations table
CREATE TABLE IF NOT EXISTS model_evaluations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    custom_model_id UUID NOT NULL REFERENCES custom_ai_models(id) ON DELETE CASCADE,
    evaluation_name VARCHAR(255) NOT NULL,
    evaluation_type VARCHAR(50) NOT NULL, -- 'validation', 'test', 'production', 'benchmark'
    test_dataset_id UUID REFERENCES training_datasets(id) ON DELETE SET NULL,
    metrics JSONB NOT NULL DEFAULT '{}',
    confusion_matrix JSONB,
    classification_report JSONB,
    sample_predictions JSONB DEFAULT '[]',
    evaluation_config JSONB DEFAULT '{}',
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'running', 'completed', 'failed'
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for model_evaluations
CREATE INDEX IF NOT EXISTS idx_model_evaluations_custom_model_id ON model_evaluations(custom_model_id);
CREATE INDEX IF NOT EXISTS idx_model_evaluations_evaluation_type ON model_evaluations(evaluation_type);
CREATE INDEX IF NOT EXISTS idx_model_evaluations_status ON model_evaluations(status);
CREATE INDEX IF NOT EXISTS idx_model_evaluations_created_by ON model_evaluations(created_by);

-- Predictive Analytics Models table
CREATE TABLE IF NOT EXISTS predictive_models (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    model_type VARCHAR(100) NOT NULL, -- 'churn_prediction', 'demand_forecasting', 'sentiment_trending', 'capacity_planning'
    algorithm VARCHAR(100), -- 'random_forest', 'xgboost', 'lstm', 'arima', 'prophet'
    features JSONB NOT NULL DEFAULT '[]', -- list of feature columns
    target_variable VARCHAR(100),
    training_data_query TEXT, -- SQL query to generate training data
    prediction_horizon INTEGER DEFAULT 30, -- days into the future
    retrain_frequency VARCHAR(50) DEFAULT 'weekly', -- 'daily', 'weekly', 'monthly'
    model_artifact_path VARCHAR(500),
    performance_metrics JSONB DEFAULT '{}',
    feature_importance JSONB DEFAULT '{}',
    last_trained_at TIMESTAMP WITH TIME ZONE,
    next_retrain_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT TRUE,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for predictive_models
CREATE INDEX IF NOT EXISTS idx_predictive_models_organization_id ON predictive_models(organization_id);
CREATE INDEX IF NOT EXISTS idx_predictive_models_model_type ON predictive_models(model_type);
CREATE INDEX IF NOT EXISTS idx_predictive_models_is_active ON predictive_models(is_active);
CREATE INDEX IF NOT EXISTS idx_predictive_models_next_retrain_at ON predictive_models(next_retrain_at);
CREATE INDEX IF NOT EXISTS idx_predictive_models_created_by ON predictive_models(created_by);

-- Predictions table
CREATE TABLE IF NOT EXISTS predictions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    predictive_model_id UUID NOT NULL REFERENCES predictive_models(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    prediction_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    target_date TIMESTAMP WITH TIME ZONE NOT NULL, -- when the prediction is for
    input_features JSONB NOT NULL DEFAULT '{}',
    prediction_value JSONB NOT NULL, -- the actual prediction
    confidence_score DECIMAL(5, 4),
    prediction_interval JSONB, -- confidence intervals
    actual_value JSONB, -- filled in later for evaluation
    accuracy_score DECIMAL(5, 4), -- calculated when actual value is known
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for predictions
CREATE INDEX IF NOT EXISTS idx_predictions_predictive_model_id ON predictions(predictive_model_id);
CREATE INDEX IF NOT EXISTS idx_predictions_organization_id ON predictions(organization_id);
CREATE INDEX IF NOT EXISTS idx_predictions_prediction_date ON predictions(prediction_date);
CREATE INDEX IF NOT EXISTS idx_predictions_target_date ON predictions(target_date);

-- Industry-specific AI Configurations
CREATE TABLE IF NOT EXISTS industry_ai_configs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    industry VARCHAR(100) NOT NULL,
    config_name VARCHAR(255) NOT NULL,
    ai_provider ai_provider NOT NULL,
    model_name VARCHAR(100) NOT NULL,
    system_prompts JSONB NOT NULL DEFAULT '{}',
    classification_categories JSONB DEFAULT '[]',
    response_templates JSONB DEFAULT '{}',
    compliance_rules JSONB DEFAULT '{}',
    safety_filters JSONB DEFAULT '{}',
    performance_thresholds JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT TRUE,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(organization_id, industry, config_name)
);

-- Create indexes for industry_ai_configs
CREATE INDEX IF NOT EXISTS idx_industry_ai_configs_organization_id ON industry_ai_configs(organization_id);
CREATE INDEX IF NOT EXISTS idx_industry_ai_configs_industry ON industry_ai_configs(industry);
CREATE INDEX IF NOT EXISTS idx_industry_ai_configs_ai_provider ON industry_ai_configs(ai_provider);
CREATE INDEX IF NOT EXISTS idx_industry_ai_configs_is_active ON industry_ai_configs(is_active);

-- AI Performance Analytics
CREATE TABLE IF NOT EXISTS ai_performance_analytics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    model_id UUID, -- can reference custom_ai_models or be null for standard models
    ai_provider ai_provider NOT NULL,
    model_name VARCHAR(100) NOT NULL,
    request_date DATE NOT NULL,
    total_requests INTEGER DEFAULT 0,
    successful_requests INTEGER DEFAULT 0,
    failed_requests INTEGER DEFAULT 0,
    avg_response_time DECIMAL(8, 2), -- milliseconds
    avg_confidence_score DECIMAL(5, 4),
    total_tokens_used BIGINT DEFAULT 0,
    total_cost DECIMAL(10, 4) DEFAULT 0,
    accuracy_metrics JSONB DEFAULT '{}',
    error_breakdown JSONB DEFAULT '{}',
    usage_by_category JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(organization_id, model_id, ai_provider, model_name, request_date)
);

-- Create indexes for ai_performance_analytics
CREATE INDEX IF NOT EXISTS idx_ai_performance_analytics_organization_id ON ai_performance_analytics(organization_id);
CREATE INDEX IF NOT EXISTS idx_ai_performance_analytics_model_id ON ai_performance_analytics(model_id);
CREATE INDEX IF NOT EXISTS idx_ai_performance_analytics_request_date ON ai_performance_analytics(request_date);
CREATE INDEX IF NOT EXISTS idx_ai_performance_analytics_ai_provider ON ai_performance_analytics(ai_provider);

-- Add triggers for updated_at columns on new tables
CREATE TRIGGER update_custom_ai_models_updated_at BEFORE UPDATE ON custom_ai_models FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_training_datasets_updated_at BEFORE UPDATE ON training_datasets FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_model_training_jobs_updated_at BEFORE UPDATE ON model_training_jobs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_model_evaluations_updated_at BEFORE UPDATE ON model_evaluations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_predictive_models_updated_at BEFORE UPDATE ON predictive_models FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_industry_ai_configs_updated_at BEFORE UPDATE ON industry_ai_configs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to calculate model performance metrics
CREATE OR REPLACE FUNCTION calculate_model_performance_metrics(
    model_id UUID,
    start_date TIMESTAMP WITH TIME ZONE DEFAULT NOW() - INTERVAL '30 days',
    end_date TIMESTAMP WITH TIME ZONE DEFAULT NOW()
)
RETURNS JSONB AS $$
DECLARE
    metrics JSONB := '{}';
    total_requests INTEGER;
    avg_accuracy DECIMAL(5, 4);
    avg_response_time DECIMAL(8, 2);
    total_cost DECIMAL(10, 4);
BEGIN
    -- Calculate basic metrics
    SELECT 
        SUM(total_requests),
        AVG(avg_confidence_score),
        AVG(avg_response_time),
        SUM(total_cost)
    INTO total_requests, avg_accuracy, avg_response_time, total_cost
    FROM ai_performance_analytics
    WHERE model_id = calculate_model_performance_metrics.model_id
      AND request_date BETWEEN start_date::DATE AND end_date::DATE;

    -- Build metrics JSON
    metrics := jsonb_build_object(
        'total_requests', COALESCE(total_requests, 0),
        'avg_accuracy', COALESCE(avg_accuracy, 0),
        'avg_response_time', COALESCE(avg_response_time, 0),
        'total_cost', COALESCE(total_cost, 0),
        'period_start', start_date,
        'period_end', end_date
    );

    RETURN metrics;
END;
$$ LANGUAGE plpgsql;

-- Function to get industry-specific AI recommendations
CREATE OR REPLACE FUNCTION get_industry_ai_recommendations(org_id UUID)
RETURNS JSONB AS $$
DECLARE
    org_industry VARCHAR(100);
    recommendations JSONB := '[]';
BEGIN
    -- Get organization industry from settings or infer from data
    SELECT settings->>'industry' INTO org_industry
    FROM organizations 
    WHERE id = org_id;

    -- Build recommendations based on industry
    CASE org_industry
        WHEN 'healthcare' THEN
            recommendations := '[
                {"type": "compliance", "message": "Enable HIPAA compliance mode for healthcare data"},
                {"type": "model", "message": "Consider using medical-specific AI models for better accuracy"},
                {"type": "security", "message": "Implement additional encryption for patient data"}
            ]';
        WHEN 'finance' THEN
            recommendations := '[
                {"type": "compliance", "message": "Enable financial regulations compliance (SOX, PCI-DSS)"},
                {"type": "model", "message": "Use finance-specific models for better fraud detection"},
                {"type": "security", "message": "Implement multi-factor authentication for all users"}
            ]';
        ELSE
            recommendations := '[
                {"type": "general", "message": "Consider custom model training for better accuracy"},
                {"type": "optimization", "message": "Enable cost optimization for AI requests"}
            ]';
    END CASE;

    RETURN recommendations;
END;
$$ LANGUAGE plpgsql;

-- Insert default industry AI configurations
INSERT INTO industry_ai_configs (organization_id, industry, config_name, ai_provider, model_name, system_prompts, classification_categories, compliance_rules) 
SELECT 
    o.id,
    'healthcare',
    'HIPAA Compliant Healthcare AI',
    'openai',
    'gpt-4',
    '{"system": "You are a HIPAA-compliant healthcare customer service AI. Always protect patient privacy and follow medical guidelines."}',
    '["medical_inquiry", "appointment_scheduling", "billing_question", "insurance_claim", "prescription_refill", "emergency"]',
    '{"hipaa_compliance": true, "phi_detection": true, "medical_advice_disclaimer": true}'
FROM organizations o
WHERE o.id IN (SELECT DISTINCT organization_id FROM organizations LIMIT 1)
ON CONFLICT (organization_id, industry, config_name) DO NOTHING;

INSERT INTO industry_ai_configs (organization_id, industry, config_name, ai_provider, model_name, system_prompts, classification_categories, compliance_rules)
SELECT 
    o.id,
    'finance',
    'Financial Services Compliant AI',
    'anthropic',
    'claude-3-sonnet',
    '{"system": "You are a financial services AI assistant. Follow all financial regulations and never provide investment advice."}',
    '["account_inquiry", "transaction_dispute", "loan_application", "investment_question", "fraud_report", "compliance_issue"]',
    '{"sox_compliance": true, "pci_dss_compliance": true, "investment_advice_disclaimer": true}'
FROM organizations o
WHERE o.id IN (SELECT DISTINCT organization_id FROM organizations LIMIT 1)
ON CONFLICT (organization_id, industry, config_name) DO NOTHING;
