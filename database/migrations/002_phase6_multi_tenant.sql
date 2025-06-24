-- Phase 6: Multi-Tenant SaaS Foundation Migration
-- This migration adds enhanced multi-tenant capabilities, partner management, and enterprise features

-- Add new columns to existing organizations table for multi-tenancy
ALTER TABLE organizations 
ADD COLUMN IF NOT EXISTS tenant_type tenant_type DEFAULT 'direct',
ADD COLUMN IF NOT EXISTS parent_organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS partner_id UUID,
ADD COLUMN IF NOT EXISTS branding JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS custom_domain VARCHAR(255),
ADD COLUMN IF NOT EXISTS ssl_certificate JSONB DEFAULT NULL,
ADD COLUMN IF NOT EXISTS region VARCHAR(50) DEFAULT 'us-east-1',
ADD COLUMN IF NOT EXISTS data_residency_requirements JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS compliance_settings JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS resource_quotas JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS usage_metrics JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS subscription_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS billing_status billing_status DEFAULT 'active';

-- Create new indexes for organizations
CREATE INDEX IF NOT EXISTS idx_organizations_tenant_type ON organizations(tenant_type);
CREATE INDEX IF NOT EXISTS idx_organizations_parent_organization_id ON organizations(parent_organization_id);
CREATE INDEX IF NOT EXISTS idx_organizations_partner_id ON organizations(partner_id);
CREATE INDEX IF NOT EXISTS idx_organizations_custom_domain ON organizations(custom_domain);
CREATE INDEX IF NOT EXISTS idx_organizations_region ON organizations(region);
CREATE INDEX IF NOT EXISTS idx_organizations_billing_status ON organizations(billing_status);

-- Subscription Plans table (for flexible pricing)
CREATE TABLE IF NOT EXISTS subscription_plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    description TEXT,
    plan_type subscription_plan NOT NULL,
    pricing JSONB NOT NULL DEFAULT '{}', -- monthly_price, yearly_price, setup_fee, etc.
    features JSONB NOT NULL DEFAULT '{}', -- feature flags and limits
    limits JSONB NOT NULL DEFAULT '{}', -- usage limits
    is_active BOOLEAN DEFAULT TRUE,
    is_public BOOLEAN DEFAULT TRUE,
    target_audience VARCHAR(50) DEFAULT 'general', -- 'general', 'enterprise', 'partner'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for subscription_plans
CREATE INDEX IF NOT EXISTS idx_subscription_plans_slug ON subscription_plans(slug);
CREATE INDEX IF NOT EXISTS idx_subscription_plans_plan_type ON subscription_plans(plan_type);
CREATE INDEX IF NOT EXISTS idx_subscription_plans_is_active ON subscription_plans(is_active);
CREATE INDEX IF NOT EXISTS idx_subscription_plans_target_audience ON subscription_plans(target_audience);

-- Billing and Usage Tracking
CREATE TABLE IF NOT EXISTS billing_usage (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    billing_period_start TIMESTAMP WITH TIME ZONE NOT NULL,
    billing_period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    usage_data JSONB NOT NULL DEFAULT '{}', -- messages, ai_requests, storage, etc.
    costs JSONB NOT NULL DEFAULT '{}', -- breakdown by service
    total_cost DECIMAL(10,2) DEFAULT 0,
    currency VARCHAR(3) DEFAULT 'USD',
    status VARCHAR(20) DEFAULT 'draft', -- draft, finalized, paid
    invoice_id VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for billing_usage
CREATE INDEX IF NOT EXISTS idx_billing_usage_organization_id ON billing_usage(organization_id);
CREATE INDEX IF NOT EXISTS idx_billing_usage_billing_period_start ON billing_usage(billing_period_start);
CREATE INDEX IF NOT EXISTS idx_billing_usage_status ON billing_usage(status);

-- White-label Branding
CREATE TABLE IF NOT EXISTS white_label_branding (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    partner_id UUID REFERENCES partners(id) ON DELETE SET NULL,
    brand_name VARCHAR(255) NOT NULL,
    logo_url VARCHAR(500),
    favicon_url VARCHAR(500),
    primary_color VARCHAR(7), -- hex color
    secondary_color VARCHAR(7),
    accent_color VARCHAR(7),
    font_family VARCHAR(100),
    custom_css TEXT,
    email_templates JSONB DEFAULT '{}',
    custom_domain VARCHAR(255),
    ssl_enabled BOOLEAN DEFAULT FALSE,
    footer_text TEXT,
    privacy_policy_url VARCHAR(500),
    terms_of_service_url VARCHAR(500),
    support_email VARCHAR(255),
    support_phone VARCHAR(50),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(organization_id)
);

-- Create indexes for white_label_branding
CREATE INDEX IF NOT EXISTS idx_white_label_branding_organization_id ON white_label_branding(organization_id);
CREATE INDEX IF NOT EXISTS idx_white_label_branding_partner_id ON white_label_branding(partner_id);
CREATE INDEX IF NOT EXISTS idx_white_label_branding_custom_domain ON white_label_branding(custom_domain);

-- Resource Quotas and Monitoring
CREATE TABLE IF NOT EXISTS resource_quotas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    resource_type VARCHAR(50) NOT NULL, -- 'messages', 'storage', 'ai_requests', 'users', etc.
    quota_limit BIGINT NOT NULL,
    current_usage BIGINT DEFAULT 0,
    reset_period VARCHAR(20) DEFAULT 'monthly', -- 'daily', 'weekly', 'monthly', 'yearly'
    last_reset_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    alert_threshold DECIMAL(3,2) DEFAULT 0.80, -- alert at 80% usage
    is_hard_limit BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(organization_id, resource_type)
);

-- Create indexes for resource_quotas
CREATE INDEX IF NOT EXISTS idx_resource_quotas_organization_id ON resource_quotas(organization_id);
CREATE INDEX IF NOT EXISTS idx_resource_quotas_resource_type ON resource_quotas(resource_type);
CREATE INDEX IF NOT EXISTS idx_resource_quotas_last_reset_at ON resource_quotas(last_reset_at);

-- Multi-Region Data Centers
CREATE TABLE IF NOT EXISTS data_centers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    region VARCHAR(50) UNIQUE NOT NULL,
    location VARCHAR(255) NOT NULL,
    provider VARCHAR(50) NOT NULL, -- 'aws', 'azure', 'gcp', 'on_premise'
    endpoint_url VARCHAR(500) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    capacity_info JSONB DEFAULT '{}',
    compliance_certifications TEXT[] DEFAULT '{}',
    data_residency_rules JSONB DEFAULT '{}',
    latency_zones TEXT[] DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for data_centers
CREATE INDEX IF NOT EXISTS idx_data_centers_region ON data_centers(region);
CREATE INDEX IF NOT EXISTS idx_data_centers_provider ON data_centers(provider);
CREATE INDEX IF NOT EXISTS idx_data_centers_is_active ON data_centers(is_active);

-- Organization Data Center Assignment
CREATE TABLE IF NOT EXISTS organization_data_centers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    data_center_id UUID NOT NULL REFERENCES data_centers(id) ON DELETE CASCADE,
    is_primary BOOLEAN DEFAULT FALSE,
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(organization_id, data_center_id)
);

-- Create indexes for organization_data_centers
CREATE INDEX IF NOT EXISTS idx_organization_data_centers_organization_id ON organization_data_centers(organization_id);
CREATE INDEX IF NOT EXISTS idx_organization_data_centers_data_center_id ON organization_data_centers(data_center_id);
CREATE INDEX IF NOT EXISTS idx_organization_data_centers_is_primary ON organization_data_centers(is_primary);

-- Add triggers for updated_at columns on new tables
CREATE TRIGGER update_subscription_plans_updated_at BEFORE UPDATE ON subscription_plans FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_billing_usage_updated_at BEFORE UPDATE ON billing_usage FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_white_label_branding_updated_at BEFORE UPDATE ON white_label_branding FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_resource_quotas_updated_at BEFORE UPDATE ON resource_quotas FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_data_centers_updated_at BEFORE UPDATE ON data_centers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to check resource quota before usage
CREATE OR REPLACE FUNCTION check_resource_quota(org_id UUID, resource_type VARCHAR, usage_amount BIGINT DEFAULT 1)
RETURNS BOOLEAN AS $$
DECLARE
    quota_record RECORD;
    allowed BOOLEAN := TRUE;
BEGIN
    SELECT * INTO quota_record 
    FROM resource_quotas 
    WHERE organization_id = org_id AND resource_type = check_resource_quota.resource_type;
    
    IF FOUND THEN
        IF quota_record.is_hard_limit AND (quota_record.current_usage + usage_amount) > quota_record.quota_limit THEN
            allowed := FALSE;
        END IF;
    END IF;
    
    RETURN allowed;
END;
$$ LANGUAGE plpgsql;

-- Function to update resource usage
CREATE OR REPLACE FUNCTION update_resource_usage(org_id UUID, resource_type VARCHAR, usage_amount BIGINT DEFAULT 1)
RETURNS VOID AS $$
BEGIN
    INSERT INTO resource_quotas (organization_id, resource_type, current_usage, quota_limit)
    VALUES (org_id, resource_type, usage_amount, 999999999)
    ON CONFLICT (organization_id, resource_type)
    DO UPDATE SET 
        current_usage = resource_quotas.current_usage + usage_amount,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- Function to reset resource quotas based on reset period
CREATE OR REPLACE FUNCTION reset_resource_quotas()
RETURNS INTEGER AS $$
DECLARE
    reset_count INTEGER := 0;
    quota_record RECORD;
BEGIN
    FOR quota_record IN 
        SELECT * FROM resource_quotas 
        WHERE (
            (reset_period = 'daily' AND last_reset_at < NOW() - INTERVAL '1 day') OR
            (reset_period = 'weekly' AND last_reset_at < NOW() - INTERVAL '1 week') OR
            (reset_period = 'monthly' AND last_reset_at < NOW() - INTERVAL '1 month') OR
            (reset_period = 'yearly' AND last_reset_at < NOW() - INTERVAL '1 year')
        )
    LOOP
        UPDATE resource_quotas 
        SET current_usage = 0, last_reset_at = NOW(), updated_at = NOW()
        WHERE id = quota_record.id;
        reset_count := reset_count + 1;
    END LOOP;
    
    RETURN reset_count;
END;
$$ LANGUAGE plpgsql;

-- Insert default data centers
INSERT INTO data_centers (name, region, location, provider, endpoint_url, compliance_certifications) VALUES
('US East (N. Virginia)', 'us-east-1', 'Virginia, USA', 'aws', 'https://us-east-1.universalai-cs.com', ARRAY['SOC2', 'ISO27001', 'HIPAA']),
('US West (Oregon)', 'us-west-2', 'Oregon, USA', 'aws', 'https://us-west-2.universalai-cs.com', ARRAY['SOC2', 'ISO27001', 'HIPAA']),
('EU (Ireland)', 'eu-west-1', 'Dublin, Ireland', 'aws', 'https://eu-west-1.universalai-cs.com', ARRAY['SOC2', 'ISO27001', 'GDPR']),
('Asia Pacific (Singapore)', 'ap-southeast-1', 'Singapore', 'aws', 'https://ap-southeast-1.universalai-cs.com', ARRAY['SOC2', 'ISO27001']),
('Canada (Central)', 'ca-central-1', 'Toronto, Canada', 'aws', 'https://ca-central-1.universalai-cs.com', ARRAY['SOC2', 'ISO27001', 'PIPEDA'])
ON CONFLICT (region) DO NOTHING;

-- Insert default subscription plans
INSERT INTO subscription_plans (name, slug, description, plan_type, pricing, features, limits) VALUES
('Starter', 'starter', 'Perfect for small businesses getting started', 'starter', 
 '{"monthly": 99, "yearly": 990, "setup_fee": 0}',
 '{"ai_processing": true, "basic_integrations": true, "email_support": true}',
 '{"messages_per_month": 10000, "integrations": 5, "users": 10}'),
('Professional', 'professional', 'Advanced features for growing businesses', 'professional',
 '{"monthly": 299, "yearly": 2990, "setup_fee": 0}',
 '{"ai_processing": true, "advanced_integrations": true, "priority_support": true, "analytics": true}',
 '{"messages_per_month": 50000, "integrations": 15, "users": 50}'),
('Enterprise', 'enterprise', 'Full-featured solution for large organizations', 'enterprise',
 '{"monthly": 999, "yearly": 9990, "setup_fee": 500}',
 '{"ai_processing": true, "all_integrations": true, "dedicated_support": true, "advanced_analytics": true, "custom_branding": true}',
 '{"messages_per_month": 250000, "integrations": -1, "users": 500}'),
('White Label', 'white_label', 'Complete white-label solution for partners', 'white_label',
 '{"monthly": 1999, "yearly": 19990, "setup_fee": 2000}',
 '{"everything": true, "white_label": true, "partner_portal": true, "revenue_sharing": true}',
 '{"messages_per_month": -1, "integrations": -1, "users": -1}')
ON CONFLICT (slug) DO NOTHING;
