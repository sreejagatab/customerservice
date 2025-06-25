-- ML Models and Training Infrastructure Tables
-- Migration: 015_create_ml_tables.sql

-- ML Models table
CREATE TABLE IF NOT EXISTS ml_models (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    version VARCHAR(50) NOT NULL DEFAULT '1.0.0',
    type VARCHAR(50) NOT NULL CHECK (type IN ('classification', 'regression', 'clustering', 'nlp', 'sentiment', 'churn_prediction')),
    industry VARCHAR(50) NOT NULL CHECK (industry IN ('healthcare', 'finance', 'legal', 'ecommerce', 'general')),
    status VARCHAR(50) NOT NULL DEFAULT 'training' CHECK (status IN ('training', 'trained', 'deployed', 'deprecated', 'failed')),
    accuracy DECIMAL(5,4) DEFAULT 0,
    precision_score DECIMAL(5,4) DEFAULT 0,
    recall_score DECIMAL(5,4) DEFAULT 0,
    f1_score DECIMAL(5,4) DEFAULT 0,
    training_data JSONB NOT NULL,
    hyperparameters JSONB DEFAULT '{}',
    architecture JSONB NOT NULL,
    compliance JSONB DEFAULT '{"hipaa": false, "sox": false, "gdpr": true, "pci": false}',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    trained_at TIMESTAMP WITH TIME ZONE,
    deployed_at TIMESTAMP WITH TIME ZONE
);

-- ML Datasets table
CREATE TABLE IF NOT EXISTS ml_datasets (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL CHECK (type IN ('training', 'validation', 'test')),
    size INTEGER DEFAULT 0,
    features JSONB DEFAULT '[]',
    labels JSONB DEFAULT '[]',
    source JSONB NOT NULL,
    preprocessing JSONB DEFAULT '{}',
    compliance JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ML Training Jobs table
CREATE TABLE IF NOT EXISTS ml_training_jobs (
    id VARCHAR(255) PRIMARY KEY,
    model_id VARCHAR(255) NOT NULL REFERENCES ml_models(id) ON DELETE CASCADE,
    dataset_id VARCHAR(255) NOT NULL REFERENCES ml_datasets(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
    progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
    config JSONB NOT NULL,
    metrics JSONB DEFAULT '{"loss": [], "accuracy": [], "valLoss": [], "valAccuracy": []}',
    logs JSONB DEFAULT '[]',
    error_message TEXT,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    duration_ms INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ML Predictions table
CREATE TABLE IF NOT EXISTS ml_predictions (
    id VARCHAR(255) PRIMARY KEY,
    model_id VARCHAR(255) NOT NULL REFERENCES ml_models(id) ON DELETE CASCADE,
    input JSONB NOT NULL,
    output JSONB NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ML Model Metrics table
CREATE TABLE IF NOT EXISTS ml_model_metrics (
    id SERIAL PRIMARY KEY,
    model_id VARCHAR(255) NOT NULL REFERENCES ml_models(id) ON DELETE CASCADE,
    metrics JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Customer Churn Predictions table
CREATE TABLE IF NOT EXISTS customer_churn_predictions (
    id VARCHAR(255) PRIMARY KEY,
    customer_id VARCHAR(255) NOT NULL,
    churn_probability DECIMAL(5,4) NOT NULL,
    risk_level VARCHAR(20) NOT NULL CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
    contributing_factors JSONB DEFAULT '[]',
    recommended_actions JSONB DEFAULT '[]',
    predicted_churn_date TIMESTAMP WITH TIME ZONE,
    confidence_interval JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '30 days'
);

-- Demand Forecasts table
CREATE TABLE IF NOT EXISTS demand_forecasts (
    id VARCHAR(255) PRIMARY KEY,
    product_id VARCHAR(255) NOT NULL,
    period VARCHAR(20) NOT NULL CHECK (period IN ('daily', 'weekly', 'monthly', 'quarterly')),
    forecast_data JSONB NOT NULL,
    accuracy_metrics JSONB DEFAULT '{}',
    influencing_factors JSONB DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    valid_until TIMESTAMP WITH TIME ZONE NOT NULL
);

-- Customer Lifetime Value table
CREATE TABLE IF NOT EXISTS customer_lifetime_values (
    id VARCHAR(255) PRIMARY KEY,
    customer_id VARCHAR(255) NOT NULL,
    current_value DECIMAL(12,2) NOT NULL,
    predicted_value DECIMAL(12,2) NOT NULL,
    value_segment VARCHAR(20) NOT NULL CHECK (value_segment IN ('low', 'medium', 'high', 'premium')),
    growth_potential DECIMAL(5,4) NOT NULL,
    retention_probability DECIMAL(5,4) NOT NULL,
    recommended_investment DECIMAL(12,2) DEFAULT 0,
    payback_period_months INTEGER DEFAULT 0,
    risk_factors JSONB DEFAULT '[]',
    opportunities JSONB DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Sentiment Trends table
CREATE TABLE IF NOT EXISTS sentiment_trends (
    id SERIAL PRIMARY KEY,
    period TIMESTAMP WITH TIME ZONE NOT NULL,
    granularity VARCHAR(20) NOT NULL CHECK (granularity IN ('hourly', 'daily', 'weekly')),
    overall_sentiment DECIMAL(3,2) NOT NULL CHECK (overall_sentiment >= -1 AND overall_sentiment <= 1),
    sentiment_distribution JSONB NOT NULL,
    topic_sentiments JSONB DEFAULT '[]',
    alerts JSONB DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Business Insights table
CREATE TABLE IF NOT EXISTS business_insights (
    id VARCHAR(255) PRIMARY KEY,
    type VARCHAR(20) NOT NULL CHECK (type IN ('opportunity', 'risk', 'trend', 'anomaly')),
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    confidence DECIMAL(3,2) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    impact JSONB NOT NULL,
    evidence JSONB DEFAULT '[]',
    recommendations JSONB DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'acknowledged', 'resolved', 'expired'))
);

-- Compliance Validations table
CREATE TABLE IF NOT EXISTS compliance_validations (
    id VARCHAR(255) PRIMARY KEY,
    model_id VARCHAR(255) NOT NULL REFERENCES ml_models(id) ON DELETE CASCADE,
    validation_type VARCHAR(20) NOT NULL CHECK (validation_type IN ('hipaa', 'sox', 'gdpr', 'pci')),
    validation_result JSONB NOT NULL,
    passed BOOLEAN NOT NULL,
    issues JSONB DEFAULT '[]',
    recommendations JSONB DEFAULT '[]',
    validated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    valid_until TIMESTAMP WITH TIME ZONE NOT NULL
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_ml_models_status ON ml_models(status);
CREATE INDEX IF NOT EXISTS idx_ml_models_industry ON ml_models(industry);
CREATE INDEX IF NOT EXISTS idx_ml_models_type ON ml_models(type);
CREATE INDEX IF NOT EXISTS idx_ml_training_jobs_model_id ON ml_training_jobs(model_id);
CREATE INDEX IF NOT EXISTS idx_ml_training_jobs_status ON ml_training_jobs(status);
CREATE INDEX IF NOT EXISTS idx_ml_predictions_model_id ON ml_predictions(model_id);
CREATE INDEX IF NOT EXISTS idx_ml_predictions_created_at ON ml_predictions(created_at);
CREATE INDEX IF NOT EXISTS idx_customer_churn_customer_id ON customer_churn_predictions(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_churn_risk_level ON customer_churn_predictions(risk_level);
CREATE INDEX IF NOT EXISTS idx_demand_forecasts_product_id ON demand_forecasts(product_id);
CREATE INDEX IF NOT EXISTS idx_demand_forecasts_period ON demand_forecasts(period);
CREATE INDEX IF NOT EXISTS idx_clv_customer_id ON customer_lifetime_values(customer_id);
CREATE INDEX IF NOT EXISTS idx_clv_value_segment ON customer_lifetime_values(value_segment);
CREATE INDEX IF NOT EXISTS idx_sentiment_trends_period ON sentiment_trends(period);
CREATE INDEX IF NOT EXISTS idx_sentiment_trends_granularity ON sentiment_trends(granularity);
CREATE INDEX IF NOT EXISTS idx_business_insights_type ON business_insights(type);
CREATE INDEX IF NOT EXISTS idx_business_insights_status ON business_insights(status);
CREATE INDEX IF NOT EXISTS idx_business_insights_expires_at ON business_insights(expires_at);
CREATE INDEX IF NOT EXISTS idx_compliance_validations_model_id ON compliance_validations(model_id);
CREATE INDEX IF NOT EXISTS idx_compliance_validations_type ON compliance_validations(validation_type);

-- Create triggers for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_ml_models_updated_at BEFORE UPDATE ON ml_models FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_ml_datasets_updated_at BEFORE UPDATE ON ml_datasets FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_customer_lifetime_values_updated_at BEFORE UPDATE ON customer_lifetime_values FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert sample data for testing
INSERT INTO ml_models (id, name, type, industry, status, architecture, training_data, metadata) VALUES
('churn_model_v1', 'Customer Churn Prediction Model', 'churn_prediction', 'general', 'deployed', 
 '{"layers": [{"type": "dense", "units": 128, "activation": "relu"}], "optimizer": "adam", "loss": "categoricalCrossentropy", "metrics": ["accuracy"]}',
 '{"size": 50000, "features": ["tenure", "monthly_charges", "total_charges"], "labels": ["churn", "no_churn"], "source": "customer_database"}',
 '{"description": "Predicts customer churn probability", "tags": ["churn", "prediction"], "createdAt": "2024-01-01T00:00:00Z", "modelSize": 0}'),
('sentiment_model_v1', 'Sentiment Analysis Model', 'sentiment', 'general', 'deployed',
 '{"layers": [{"type": "dense", "units": 256, "activation": "relu"}], "optimizer": "adam", "loss": "categoricalCrossentropy", "metrics": ["accuracy"]}',
 '{"size": 100000, "features": ["text", "context"], "labels": ["positive", "negative", "neutral"], "source": "feedback_database"}',
 '{"description": "Analyzes sentiment in customer feedback", "tags": ["sentiment", "nlp"], "createdAt": "2024-01-01T00:00:00Z", "modelSize": 0}');

INSERT INTO ml_datasets (id, name, type, size, features, labels, source) VALUES
('customer_data_v1', 'Customer Behavior Dataset', 'training', 50000,
 '[{"name": "tenure", "type": "numerical"}, {"name": "monthly_charges", "type": "numerical"}, {"name": "total_charges", "type": "numerical"}]',
 '[{"name": "churn", "type": "binary"}]',
 '{"type": "database", "location": "customer_database", "format": "sql"}'),
('feedback_data_v1', 'Customer Feedback Dataset', 'training', 100000,
 '[{"name": "text", "type": "text"}, {"name": "context", "type": "categorical"}]',
 '[{"name": "sentiment", "type": "categorical", "classes": ["positive", "negative", "neutral"]}]',
 '{"type": "database", "location": "feedback_database", "format": "sql"}');

COMMENT ON TABLE ml_models IS 'Stores machine learning model definitions and metadata';
COMMENT ON TABLE ml_datasets IS 'Stores dataset information for model training';
COMMENT ON TABLE ml_training_jobs IS 'Tracks model training job status and progress';
COMMENT ON TABLE ml_predictions IS 'Stores model prediction results for analytics';
COMMENT ON TABLE customer_churn_predictions IS 'Stores customer churn prediction results';
COMMENT ON TABLE demand_forecasts IS 'Stores demand forecasting results';
COMMENT ON TABLE customer_lifetime_values IS 'Stores customer lifetime value calculations';
COMMENT ON TABLE sentiment_trends IS 'Stores sentiment analysis trends over time';
COMMENT ON TABLE business_insights IS 'Stores automated business insights and recommendations';
COMMENT ON TABLE compliance_validations IS 'Stores compliance validation results for models';

-- Compliance Framework Tables

-- Data Processing Records (GDPR Article 30)
CREATE TABLE IF NOT EXISTS data_processing_records (
    id VARCHAR(255) PRIMARY KEY,
    organization_id VARCHAR(255) NOT NULL,
    data_type VARCHAR(255) NOT NULL,
    purpose TEXT NOT NULL,
    legal_basis VARCHAR(100) NOT NULL,
    data_subjects JSONB DEFAULT '[]',
    categories JSONB DEFAULT '[]',
    recipients JSONB DEFAULT '[]',
    transfers JSONB DEFAULT '[]',
    retention JSONB NOT NULL,
    security_measures JSONB DEFAULT '[]',
    data_protection_officer VARCHAR(255),
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Consent Records (GDPR Article 7)
CREATE TABLE IF NOT EXISTS consent_records (
    id VARCHAR(255) PRIMARY KEY,
    data_subject_id VARCHAR(255) NOT NULL,
    organization_id VARCHAR(255) NOT NULL,
    purpose TEXT NOT NULL,
    data_types JSONB DEFAULT '[]',
    consent_given TIMESTAMP WITH TIME ZONE NOT NULL,
    consent_withdrawn TIMESTAMP WITH TIME ZONE,
    method VARCHAR(50) NOT NULL CHECK (method IN ('explicit', 'implicit', 'opt_in', 'opt_out')),
    evidence TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'withdrawn', 'expired')),
    renewal_required TIMESTAMP WITH TIME ZONE
);

-- Data Subject Requests (GDPR Chapter 3)
CREATE TABLE IF NOT EXISTS data_subject_requests (
    id VARCHAR(255) PRIMARY KEY,
    type VARCHAR(50) NOT NULL CHECK (type IN ('access', 'rectification', 'erasure', 'portability', 'restriction', 'objection')),
    data_subject_id VARCHAR(255) NOT NULL,
    organization_id VARCHAR(255) NOT NULL,
    details TEXT NOT NULL,
    verification_method VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'verified', 'processing', 'completed', 'rejected')),
    due_date TIMESTAMP WITH TIME ZONE NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE,
    response JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Compliance Audits
CREATE TABLE IF NOT EXISTS compliance_audits (
    id VARCHAR(255) PRIMARY KEY,
    framework_id VARCHAR(255) NOT NULL,
    organization_id VARCHAR(255) NOT NULL,
    auditor_id VARCHAR(255) NOT NULL,
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'in_progress', 'completed', 'failed')),
    scope JSONB DEFAULT '[]',
    findings JSONB DEFAULT '[]',
    overall_score DECIMAL(5,2) DEFAULT 0,
    certification JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Compliance Reports
CREATE TABLE IF NOT EXISTS compliance_reports (
    id VARCHAR(255) PRIMARY KEY,
    organization_id VARCHAR(255) NOT NULL,
    framework_id VARCHAR(255) NOT NULL,
    format VARCHAR(10) NOT NULL CHECK (format IN ('pdf', 'json', 'csv')),
    data JSONB NOT NULL,
    generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Security Incidents
CREATE TABLE IF NOT EXISTS security_incidents (
    id VARCHAR(255) PRIMARY KEY,
    organization_id VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL,
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    affected_systems JSONB DEFAULT '[]',
    affected_data JSONB DEFAULT '[]',
    detected_at TIMESTAMP WITH TIME ZONE NOT NULL,
    reported_at TIMESTAMP WITH TIME ZONE,
    resolved_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'contained', 'resolved', 'closed')),
    response_actions JSONB DEFAULT '[]',
    lessons_learned TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Compliance Training Records
CREATE TABLE IF NOT EXISTS compliance_training (
    id VARCHAR(255) PRIMARY KEY,
    organization_id VARCHAR(255) NOT NULL,
    employee_id VARCHAR(255) NOT NULL,
    training_type VARCHAR(100) NOT NULL,
    framework_id VARCHAR(255),
    completed_at TIMESTAMP WITH TIME ZONE NOT NULL,
    score DECIMAL(5,2),
    certificate_number VARCHAR(100),
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for compliance tables
CREATE INDEX IF NOT EXISTS idx_data_processing_org_id ON data_processing_records(organization_id);
CREATE INDEX IF NOT EXISTS idx_data_processing_data_type ON data_processing_records(data_type);
CREATE INDEX IF NOT EXISTS idx_consent_records_data_subject ON consent_records(data_subject_id);
CREATE INDEX IF NOT EXISTS idx_consent_records_org_id ON consent_records(organization_id);
CREATE INDEX IF NOT EXISTS idx_consent_records_status ON consent_records(status);
CREATE INDEX IF NOT EXISTS idx_data_subject_requests_subject ON data_subject_requests(data_subject_id);
CREATE INDEX IF NOT EXISTS idx_data_subject_requests_org ON data_subject_requests(organization_id);
CREATE INDEX IF NOT EXISTS idx_data_subject_requests_status ON data_subject_requests(status);
CREATE INDEX IF NOT EXISTS idx_compliance_audits_org ON compliance_audits(organization_id);
CREATE INDEX IF NOT EXISTS idx_compliance_audits_framework ON compliance_audits(framework_id);
CREATE INDEX IF NOT EXISTS idx_compliance_audits_status ON compliance_audits(status);
CREATE INDEX IF NOT EXISTS idx_security_incidents_org ON security_incidents(organization_id);
CREATE INDEX IF NOT EXISTS idx_security_incidents_severity ON security_incidents(severity);
CREATE INDEX IF NOT EXISTS idx_security_incidents_status ON security_incidents(status);
CREATE INDEX IF NOT EXISTS idx_compliance_training_org ON compliance_training(organization_id);
CREATE INDEX IF NOT EXISTS idx_compliance_training_employee ON compliance_training(employee_id);

-- Insert sample compliance data
INSERT INTO data_processing_records (id, organization_id, data_type, purpose, legal_basis, retention) VALUES
('dpr_customer_data', 'org_1', 'customer_personal_data', 'Service delivery and customer support', 'contract', '{"period": "7 years", "criteria": "Contract termination + 7 years"}'),
('dpr_employee_data', 'org_1', 'employee_personal_data', 'Employment management', 'contract', '{"period": "10 years", "criteria": "Employment termination + 10 years"}');

INSERT INTO consent_records (id, data_subject_id, organization_id, purpose, data_types, consent_given, method, evidence, status) VALUES
('consent_marketing_001', 'customer_123', 'org_1', 'Marketing communications', '["email", "preferences"]', NOW(), 'explicit', 'Checkbox consent on registration form', 'active'),
('consent_analytics_001', 'customer_123', 'org_1', 'Analytics and improvement', '["usage_data", "behavior"]', NOW(), 'opt_in', 'Cookie consent banner', 'active');
