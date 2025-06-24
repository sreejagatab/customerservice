-- Phase 6.4: Global Infrastructure & Compliance Migration
-- This migration adds compliance frameworks, audit logging, and security controls

-- Compliance Frameworks table
CREATE TABLE IF NOT EXISTS compliance_frameworks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    version VARCHAR(50) NOT NULL,
    description TEXT,
    certification_status VARCHAR(50) DEFAULT 'not_started', -- 'not_started', 'in_progress', 'certified', 'expired'
    last_audit_date TIMESTAMP WITH TIME ZONE,
    next_audit_date TIMESTAMP WITH TIME ZONE,
    certification_body VARCHAR(255),
    certificate_number VARCHAR(255),
    expiry_date TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(name, version)
);

-- Create indexes for compliance_frameworks
CREATE INDEX IF NOT EXISTS idx_compliance_frameworks_name ON compliance_frameworks(name);
CREATE INDEX IF NOT EXISTS idx_compliance_frameworks_certification_status ON compliance_frameworks(certification_status);
CREATE INDEX IF NOT EXISTS idx_compliance_frameworks_expiry_date ON compliance_frameworks(expiry_date);

-- Compliance Requirements table
CREATE TABLE IF NOT EXISTS compliance_requirements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    framework_id UUID NOT NULL REFERENCES compliance_frameworks(id) ON DELETE CASCADE,
    category VARCHAR(255) NOT NULL,
    requirement VARCHAR(255) NOT NULL,
    description TEXT,
    implementation_status VARCHAR(50) DEFAULT 'not_implemented', -- 'not_implemented', 'partial', 'implemented', 'verified'
    evidence TEXT[] DEFAULT '{}',
    last_review_date TIMESTAMP WITH TIME ZONE,
    assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
    priority VARCHAR(20) DEFAULT 'medium', -- 'low', 'medium', 'high', 'critical'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for compliance_requirements
CREATE INDEX IF NOT EXISTS idx_compliance_requirements_framework_id ON compliance_requirements(framework_id);
CREATE INDEX IF NOT EXISTS idx_compliance_requirements_implementation_status ON compliance_requirements(implementation_status);
CREATE INDEX IF NOT EXISTS idx_compliance_requirements_priority ON compliance_requirements(priority);
CREATE INDEX IF NOT EXISTS idx_compliance_requirements_assigned_to ON compliance_requirements(assigned_to);

-- Audit Logs table (for comprehensive audit trail)
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(255) NOT NULL,
    resource VARCHAR(255) NOT NULL,
    resource_id UUID,
    details TEXT, -- encrypted sensitive data
    ip_address INET,
    user_agent TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    severity VARCHAR(20) DEFAULT 'info', -- 'info', 'warning', 'error', 'critical'
    compliance_frameworks JSONB DEFAULT '[]',
    data_classification VARCHAR(50) DEFAULT 'internal', -- 'public', 'internal', 'confidential', 'restricted'
    session_id VARCHAR(255),
    request_id VARCHAR(255),
    correlation_id VARCHAR(255)
);

-- Create indexes for audit_logs
CREATE INDEX IF NOT EXISTS idx_audit_logs_organization_id ON audit_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs(resource);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_logs_severity ON audit_logs(severity);
CREATE INDEX IF NOT EXISTS idx_audit_logs_compliance_frameworks ON audit_logs USING GIN(compliance_frameworks);

-- Security Controls table
CREATE TABLE IF NOT EXISTS security_controls (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL, -- 'access_control', 'encryption', 'monitoring', 'incident_response', 'data_protection'
    description TEXT,
    implementation_status VARCHAR(50) DEFAULT 'active', -- 'active', 'inactive', 'testing', 'failed'
    configuration JSONB DEFAULT '{}',
    last_test_date TIMESTAMP WITH TIME ZONE,
    next_test_date TIMESTAMP WITH TIME ZONE,
    effectiveness VARCHAR(20) DEFAULT 'medium', -- 'low', 'medium', 'high'
    automated_testing BOOLEAN DEFAULT FALSE,
    compliance_frameworks JSONB DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for security_controls
CREATE INDEX IF NOT EXISTS idx_security_controls_category ON security_controls(category);
CREATE INDEX IF NOT EXISTS idx_security_controls_implementation_status ON security_controls(implementation_status);
CREATE INDEX IF NOT EXISTS idx_security_controls_effectiveness ON security_controls(effectiveness);
CREATE INDEX IF NOT EXISTS idx_security_controls_compliance_frameworks ON security_controls USING GIN(compliance_frameworks);

-- Data Residency Rules table
CREATE TABLE IF NOT EXISTS data_residency_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    region VARCHAR(50) NOT NULL,
    data_types TEXT[] NOT NULL, -- types of data this rule applies to
    storage_requirements JSONB DEFAULT '{}', -- where data can be stored
    processing_restrictions JSONB DEFAULT '{}', -- where data can be processed
    transfer_restrictions JSONB DEFAULT '{}', -- where data can be transferred
    retention_period INTEGER DEFAULT 2555, -- days (7 years default)
    deletion_requirements JSONB DEFAULT '{}',
    compliance_frameworks TEXT[] DEFAULT '{}',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for data_residency_rules
CREATE INDEX IF NOT EXISTS idx_data_residency_rules_organization_id ON data_residency_rules(organization_id);
CREATE INDEX IF NOT EXISTS idx_data_residency_rules_region ON data_residency_rules(region);
CREATE INDEX IF NOT EXISTS idx_data_residency_rules_is_active ON data_residency_rules(is_active);

-- Incident Response table
CREATE TABLE IF NOT EXISTS security_incidents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    incident_type VARCHAR(100) NOT NULL, -- 'data_breach', 'unauthorized_access', 'malware', 'phishing', 'other'
    severity VARCHAR(20) NOT NULL, -- 'low', 'medium', 'high', 'critical'
    status VARCHAR(50) DEFAULT 'open', -- 'open', 'investigating', 'contained', 'resolved', 'closed'
    title VARCHAR(255) NOT NULL,
    description TEXT,
    affected_systems TEXT[],
    affected_data_types TEXT[],
    potential_impact TEXT,
    detection_method VARCHAR(100),
    detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    reported_at TIMESTAMP WITH TIME ZONE,
    contained_at TIMESTAMP WITH TIME ZONE,
    resolved_at TIMESTAMP WITH TIME ZONE,
    assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
    response_team JSONB DEFAULT '[]',
    timeline JSONB DEFAULT '[]',
    evidence JSONB DEFAULT '[]',
    lessons_learned TEXT,
    compliance_notifications JSONB DEFAULT '[]', -- regulatory notifications required
    customer_notifications JSONB DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for security_incidents
CREATE INDEX IF NOT EXISTS idx_security_incidents_organization_id ON security_incidents(organization_id);
CREATE INDEX IF NOT EXISTS idx_security_incidents_incident_type ON security_incidents(incident_type);
CREATE INDEX IF NOT EXISTS idx_security_incidents_severity ON security_incidents(severity);
CREATE INDEX IF NOT EXISTS idx_security_incidents_status ON security_incidents(status);
CREATE INDEX IF NOT EXISTS idx_security_incidents_detected_at ON security_incidents(detected_at);
CREATE INDEX IF NOT EXISTS idx_security_incidents_assigned_to ON security_incidents(assigned_to);

-- Encryption Keys Management table
CREATE TABLE IF NOT EXISTS encryption_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    key_name VARCHAR(255) NOT NULL,
    key_type VARCHAR(50) NOT NULL, -- 'aes-256', 'rsa-2048', 'rsa-4096'
    key_purpose VARCHAR(100) NOT NULL, -- 'data_encryption', 'backup_encryption', 'communication'
    key_status VARCHAR(50) DEFAULT 'active', -- 'active', 'rotating', 'deprecated', 'revoked'
    key_material TEXT, -- encrypted key material
    key_version INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE,
    rotated_at TIMESTAMP WITH TIME ZONE,
    revoked_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(organization_id, key_name, key_version)
);

-- Create indexes for encryption_keys
CREATE INDEX IF NOT EXISTS idx_encryption_keys_organization_id ON encryption_keys(organization_id);
CREATE INDEX IF NOT EXISTS idx_encryption_keys_key_status ON encryption_keys(key_status);
CREATE INDEX IF NOT EXISTS idx_encryption_keys_expires_at ON encryption_keys(expires_at);

-- Add triggers for updated_at columns
CREATE TRIGGER update_compliance_frameworks_updated_at BEFORE UPDATE ON compliance_frameworks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_compliance_requirements_updated_at BEFORE UPDATE ON compliance_requirements FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_security_controls_updated_at BEFORE UPDATE ON security_controls FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_data_residency_rules_updated_at BEFORE UPDATE ON data_residency_rules FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_security_incidents_updated_at BEFORE UPDATE ON security_incidents FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to automatically log audit events
CREATE OR REPLACE FUNCTION log_audit_event()
RETURNS TRIGGER AS $$
BEGIN
    -- Log the change to audit_logs table
    INSERT INTO audit_logs (
        organization_id,
        user_id,
        action,
        resource,
        resource_id,
        details,
        severity,
        compliance_frameworks
    ) VALUES (
        COALESCE(NEW.organization_id, OLD.organization_id),
        current_setting('app.current_user_id', true)::UUID,
        CASE 
            WHEN TG_OP = 'INSERT' THEN 'create'
            WHEN TG_OP = 'UPDATE' THEN 'update'
            WHEN TG_OP = 'DELETE' THEN 'delete'
        END,
        TG_TABLE_NAME,
        COALESCE(NEW.id, OLD.id),
        CASE 
            WHEN TG_OP = 'DELETE' THEN row_to_json(OLD)::TEXT
            ELSE row_to_json(NEW)::TEXT
        END,
        'info',
        '["audit"]'::JSONB
    );
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Function to check compliance violations
CREATE OR REPLACE FUNCTION check_compliance_violation(
    org_id UUID,
    violation_type VARCHAR,
    severity VARCHAR DEFAULT 'medium'
)
RETURNS BOOLEAN AS $$
DECLARE
    violation_count INTEGER;
    threshold INTEGER;
BEGIN
    -- Get violation count for the last 24 hours
    SELECT COUNT(*) INTO violation_count
    FROM audit_logs
    WHERE organization_id = org_id
      AND action LIKE '%violation%'
      AND timestamp >= NOW() - INTERVAL '24 hours';
    
    -- Set threshold based on severity
    threshold := CASE severity
        WHEN 'critical' THEN 1
        WHEN 'high' THEN 3
        WHEN 'medium' THEN 10
        ELSE 20
    END;
    
    -- Return true if threshold exceeded
    RETURN violation_count >= threshold;
END;
$$ LANGUAGE plpgsql;

-- Function to generate compliance score
CREATE OR REPLACE FUNCTION calculate_compliance_score(org_id UUID, framework_name VARCHAR)
RETURNS DECIMAL(5,2) AS $$
DECLARE
    total_requirements INTEGER;
    implemented_requirements INTEGER;
    recent_violations INTEGER;
    score DECIMAL(5,2);
BEGIN
    -- Get total requirements for framework
    SELECT COUNT(*) INTO total_requirements
    FROM compliance_requirements cr
    JOIN compliance_frameworks cf ON cr.framework_id = cf.id
    WHERE cf.name = framework_name;
    
    -- Get implemented requirements
    SELECT COUNT(*) INTO implemented_requirements
    FROM compliance_requirements cr
    JOIN compliance_frameworks cf ON cr.framework_id = cf.id
    WHERE cf.name = framework_name
      AND cr.implementation_status IN ('implemented', 'verified');
    
    -- Get recent violations (last 30 days)
    SELECT COUNT(*) INTO recent_violations
    FROM audit_logs
    WHERE organization_id = org_id
      AND action LIKE '%violation%'
      AND timestamp >= NOW() - INTERVAL '30 days'
      AND compliance_frameworks::jsonb ? framework_name;
    
    -- Calculate score
    IF total_requirements = 0 THEN
        RETURN 0;
    END IF;
    
    score := (implemented_requirements::DECIMAL / total_requirements) * 100;
    
    -- Deduct points for violations (max 50 point penalty)
    score := score - LEAST(recent_violations * 5, 50);
    
    -- Ensure score is between 0 and 100
    RETURN GREATEST(0, LEAST(100, score));
END;
$$ LANGUAGE plpgsql;

-- Insert default compliance frameworks
INSERT INTO compliance_frameworks (name, version, description) VALUES
('SOC 2 Type II', '2017', 'Service Organization Control 2 Type II certification for security, availability, processing integrity, confidentiality, and privacy'),
('ISO 27001', '2013', 'International standard for information security management systems'),
('GDPR', '2018', 'General Data Protection Regulation for EU data protection'),
('HIPAA', '2013', 'Health Insurance Portability and Accountability Act for healthcare data protection'),
('PCI DSS', '4.0', 'Payment Card Industry Data Security Standard')
ON CONFLICT (name, version) DO NOTHING;

-- Insert default security controls
INSERT INTO security_controls (name, category, description, implementation_status, effectiveness, compliance_frameworks) VALUES
('Multi-Factor Authentication', 'access_control', 'Require MFA for all user accounts', 'active', 'high', '["SOC 2 Type II", "ISO 27001"]'),
('Data Encryption at Rest', 'encryption', 'Encrypt all data stored in databases and file systems', 'active', 'high', '["SOC 2 Type II", "ISO 27001", "HIPAA", "PCI DSS"]'),
('Data Encryption in Transit', 'encryption', 'Encrypt all data transmitted over networks', 'active', 'high', '["SOC 2 Type II", "ISO 27001", "HIPAA", "PCI DSS"]'),
('Access Logging and Monitoring', 'monitoring', 'Log and monitor all system access and changes', 'active', 'medium', '["SOC 2 Type II", "ISO 27001", "HIPAA"]'),
('Incident Response Plan', 'incident_response', 'Documented procedures for security incident response', 'active', 'medium', '["SOC 2 Type II", "ISO 27001"]'),
('Data Backup and Recovery', 'data_protection', 'Regular backups with tested recovery procedures', 'active', 'high', '["SOC 2 Type II", "ISO 27001"]'),
('Vulnerability Scanning', 'monitoring', 'Regular automated vulnerability assessments', 'active', 'medium', '["SOC 2 Type II", "ISO 27001"]'),
('Network Segmentation', 'access_control', 'Isolate sensitive systems and data', 'active', 'high', '["PCI DSS", "ISO 27001"]')
ON CONFLICT DO NOTHING;

-- Insert default data residency rules for major regions
INSERT INTO data_residency_rules (organization_id, region, data_types, storage_requirements, processing_restrictions, compliance_frameworks)
SELECT 
    o.id,
    'eu-west-1',
    ARRAY['personal_data', 'customer_data'],
    '{"allowedRegions": ["eu-west-1", "eu-central-1"], "encryptionRequired": true}',
    '{"restrictedRegions": ["us-east-1", "us-west-2"], "approvalRequired": true}',
    ARRAY['GDPR']
FROM organizations o
WHERE o.region = 'eu-west-1'
ON CONFLICT DO NOTHING;

INSERT INTO data_residency_rules (organization_id, region, data_types, storage_requirements, processing_restrictions, compliance_frameworks)
SELECT 
    o.id,
    'ca-central-1',
    ARRAY['personal_data', 'customer_data'],
    '{"allowedRegions": ["ca-central-1"], "encryptionRequired": true}',
    '{"restrictedRegions": [], "approvalRequired": false}',
    ARRAY['PIPEDA']
FROM organizations o
WHERE o.region = 'ca-central-1'
ON CONFLICT DO NOTHING;
