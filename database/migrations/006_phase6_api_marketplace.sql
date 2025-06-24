-- Phase 6.5: API Marketplace & Ecosystem Migration
-- This migration adds third-party integration marketplace and comprehensive webhook system

-- API Marketplace Applications table
CREATE TABLE IF NOT EXISTS marketplace_applications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    developer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    description TEXT,
    long_description TEXT,
    category VARCHAR(100) NOT NULL, -- 'crm', 'ecommerce', 'communication', 'analytics', 'productivity', 'other'
    subcategory VARCHAR(100),
    app_type VARCHAR(50) DEFAULT 'integration', -- 'integration', 'widget', 'automation', 'analytics'
    status VARCHAR(50) DEFAULT 'draft', -- 'draft', 'submitted', 'reviewing', 'approved', 'rejected', 'published', 'suspended'
    visibility VARCHAR(50) DEFAULT 'public', -- 'public', 'private', 'partner_only'
    pricing_model VARCHAR(50) DEFAULT 'free', -- 'free', 'one_time', 'subscription', 'usage_based', 'revenue_share'
    pricing_details JSONB DEFAULT '{}',
    revenue_share_percentage DECIMAL(5,2) DEFAULT 0, -- percentage for marketplace
    logo_url VARCHAR(500),
    screenshots JSONB DEFAULT '[]',
    demo_url VARCHAR(500),
    documentation_url VARCHAR(500),
    support_url VARCHAR(500),
    privacy_policy_url VARCHAR(500),
    terms_of_service_url VARCHAR(500),
    webhook_url VARCHAR(500),
    oauth_config JSONB DEFAULT '{}',
    api_config JSONB DEFAULT '{}',
    permissions_required JSONB DEFAULT '[]',
    supported_features JSONB DEFAULT '[]',
    installation_count INTEGER DEFAULT 0,
    rating_average DECIMAL(3,2) DEFAULT 0,
    rating_count INTEGER DEFAULT 0,
    tags TEXT[] DEFAULT '{}',
    version VARCHAR(50) DEFAULT '1.0.0',
    changelog JSONB DEFAULT '[]',
    is_featured BOOLEAN DEFAULT FALSE,
    featured_until TIMESTAMP WITH TIME ZONE,
    approved_at TIMESTAMP WITH TIME ZONE,
    published_at TIMESTAMP WITH TIME ZONE,
    last_updated_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for marketplace_applications
CREATE INDEX IF NOT EXISTS idx_marketplace_applications_developer_id ON marketplace_applications(developer_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_applications_slug ON marketplace_applications(slug);
CREATE INDEX IF NOT EXISTS idx_marketplace_applications_category ON marketplace_applications(category);
CREATE INDEX IF NOT EXISTS idx_marketplace_applications_status ON marketplace_applications(status);
CREATE INDEX IF NOT EXISTS idx_marketplace_applications_visibility ON marketplace_applications(visibility);
CREATE INDEX IF NOT EXISTS idx_marketplace_applications_pricing_model ON marketplace_applications(pricing_model);
CREATE INDEX IF NOT EXISTS idx_marketplace_applications_is_featured ON marketplace_applications(is_featured);
CREATE INDEX IF NOT EXISTS idx_marketplace_applications_rating_average ON marketplace_applications(rating_average);
CREATE INDEX IF NOT EXISTS idx_marketplace_applications_installation_count ON marketplace_applications(installation_count);

-- Application Installations table
CREATE TABLE IF NOT EXISTS application_installations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    application_id UUID NOT NULL REFERENCES marketplace_applications(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    installed_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    installation_status VARCHAR(50) DEFAULT 'installing', -- 'installing', 'active', 'inactive', 'error', 'uninstalled'
    configuration JSONB DEFAULT '{}',
    permissions_granted JSONB DEFAULT '[]',
    oauth_tokens JSONB DEFAULT '{}', -- encrypted OAuth tokens
    webhook_secret VARCHAR(255),
    last_sync_at TIMESTAMP WITH TIME ZONE,
    sync_status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'syncing', 'success', 'error'
    sync_error_message TEXT,
    usage_metrics JSONB DEFAULT '{}',
    billing_info JSONB DEFAULT '{}',
    installed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    activated_at TIMESTAMP WITH TIME ZONE,
    deactivated_at TIMESTAMP WITH TIME ZONE,
    uninstalled_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(application_id, organization_id)
);

-- Create indexes for application_installations
CREATE INDEX IF NOT EXISTS idx_application_installations_application_id ON application_installations(application_id);
CREATE INDEX IF NOT EXISTS idx_application_installations_organization_id ON application_installations(organization_id);
CREATE INDEX IF NOT EXISTS idx_application_installations_installed_by ON application_installations(installed_by);
CREATE INDEX IF NOT EXISTS idx_application_installations_installation_status ON application_installations(installation_status);
CREATE INDEX IF NOT EXISTS idx_application_installations_sync_status ON application_installations(sync_status);

-- Application Reviews table
CREATE TABLE IF NOT EXISTS application_reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    application_id UUID NOT NULL REFERENCES marketplace_applications(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    title VARCHAR(255),
    review_text TEXT,
    pros TEXT,
    cons TEXT,
    is_verified BOOLEAN DEFAULT FALSE, -- verified purchase/installation
    is_featured BOOLEAN DEFAULT FALSE,
    helpful_count INTEGER DEFAULT 0,
    reported_count INTEGER DEFAULT 0,
    status VARCHAR(50) DEFAULT 'published', -- 'draft', 'published', 'hidden', 'removed'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(application_id, organization_id, user_id)
);

-- Create indexes for application_reviews
CREATE INDEX IF NOT EXISTS idx_application_reviews_application_id ON application_reviews(application_id);
CREATE INDEX IF NOT EXISTS idx_application_reviews_organization_id ON application_reviews(organization_id);
CREATE INDEX IF NOT EXISTS idx_application_reviews_user_id ON application_reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_application_reviews_rating ON application_reviews(rating);
CREATE INDEX IF NOT EXISTS idx_application_reviews_is_verified ON application_reviews(is_verified);
CREATE INDEX IF NOT EXISTS idx_application_reviews_status ON application_reviews(status);

-- Developer Profiles table
CREATE TABLE IF NOT EXISTS developer_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    company_name VARCHAR(255),
    website_url VARCHAR(500),
    github_url VARCHAR(500),
    linkedin_url VARCHAR(500),
    bio TEXT,
    specializations TEXT[] DEFAULT '{}',
    verification_status VARCHAR(50) DEFAULT 'unverified', -- 'unverified', 'pending', 'verified', 'rejected'
    verification_documents JSONB DEFAULT '[]',
    revenue_share_agreement BOOLEAN DEFAULT FALSE,
    payout_details JSONB DEFAULT '{}',
    total_revenue DECIMAL(12,2) DEFAULT 0,
    total_installations INTEGER DEFAULT 0,
    average_rating DECIMAL(3,2) DEFAULT 0,
    is_partner BOOLEAN DEFAULT FALSE,
    partner_tier VARCHAR(50), -- 'bronze', 'silver', 'gold', 'platinum'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Create indexes for developer_profiles
CREATE INDEX IF NOT EXISTS idx_developer_profiles_user_id ON developer_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_developer_profiles_verification_status ON developer_profiles(verification_status);
CREATE INDEX IF NOT EXISTS idx_developer_profiles_is_partner ON developer_profiles(is_partner);
CREATE INDEX IF NOT EXISTS idx_developer_profiles_partner_tier ON developer_profiles(partner_tier);

-- Webhook Endpoints table (Enhanced)
CREATE TABLE IF NOT EXISTS webhook_endpoints (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    application_id UUID REFERENCES marketplace_applications(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    url VARCHAR(500) NOT NULL,
    secret VARCHAR(255) NOT NULL,
    events TEXT[] NOT NULL, -- array of event types to subscribe to
    is_active BOOLEAN DEFAULT TRUE,
    retry_policy JSONB DEFAULT '{"max_retries": 3, "backoff_strategy": "exponential"}',
    timeout_seconds INTEGER DEFAULT 30,
    headers JSONB DEFAULT '{}',
    authentication JSONB DEFAULT '{}', -- auth config for webhook calls
    last_triggered_at TIMESTAMP WITH TIME ZONE,
    success_count INTEGER DEFAULT 0,
    failure_count INTEGER DEFAULT 0,
    last_success_at TIMESTAMP WITH TIME ZONE,
    last_failure_at TIMESTAMP WITH TIME ZONE,
    last_error_message TEXT,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for webhook_endpoints
CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_organization_id ON webhook_endpoints(organization_id);
CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_application_id ON webhook_endpoints(application_id);
CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_is_active ON webhook_endpoints(is_active);
CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_events ON webhook_endpoints USING GIN(events);

-- Webhook Deliveries table
CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    webhook_endpoint_id UUID NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
    event_type VARCHAR(255) NOT NULL,
    event_id UUID NOT NULL,
    payload JSONB NOT NULL,
    delivery_status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'delivered', 'failed', 'retrying'
    http_status_code INTEGER,
    response_body TEXT,
    response_headers JSONB DEFAULT '{}',
    attempt_count INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    next_retry_at TIMESTAMP WITH TIME ZONE,
    delivered_at TIMESTAMP WITH TIME ZONE,
    failed_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    processing_time_ms INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for webhook_deliveries
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook_endpoint_id ON webhook_deliveries(webhook_endpoint_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_event_type ON webhook_deliveries(event_type);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_delivery_status ON webhook_deliveries(delivery_status);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_next_retry_at ON webhook_deliveries(next_retry_at);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_created_at ON webhook_deliveries(created_at);

-- API Keys table (Enhanced for marketplace)
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    application_id UUID REFERENCES marketplace_applications(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    key_hash VARCHAR(255) NOT NULL UNIQUE,
    key_prefix VARCHAR(20) NOT NULL,
    scopes TEXT[] DEFAULT '{}', -- array of permitted scopes
    rate_limit_per_minute INTEGER DEFAULT 1000,
    rate_limit_per_hour INTEGER DEFAULT 10000,
    rate_limit_per_day INTEGER DEFAULT 100000,
    is_active BOOLEAN DEFAULT TRUE,
    expires_at TIMESTAMP WITH TIME ZONE,
    last_used_at TIMESTAMP WITH TIME ZONE,
    usage_count BIGINT DEFAULT 0,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for api_keys
CREATE INDEX IF NOT EXISTS idx_api_keys_organization_id ON api_keys(organization_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_application_id ON api_keys(application_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_is_active ON api_keys(is_active);
CREATE INDEX IF NOT EXISTS idx_api_keys_expires_at ON api_keys(expires_at);

-- API Usage Analytics table
CREATE TABLE IF NOT EXISTS api_usage_analytics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    api_key_id UUID REFERENCES api_keys(id) ON DELETE CASCADE,
    application_id UUID REFERENCES marketplace_applications(id) ON DELETE CASCADE,
    endpoint VARCHAR(255) NOT NULL,
    method VARCHAR(10) NOT NULL,
    status_code INTEGER NOT NULL,
    response_time_ms INTEGER,
    request_size_bytes INTEGER,
    response_size_bytes INTEGER,
    user_agent TEXT,
    ip_address INET,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    date DATE GENERATED ALWAYS AS (timestamp::DATE) STORED
);

-- Create indexes for api_usage_analytics
CREATE INDEX IF NOT EXISTS idx_api_usage_analytics_organization_id ON api_usage_analytics(organization_id);
CREATE INDEX IF NOT EXISTS idx_api_usage_analytics_api_key_id ON api_usage_analytics(api_key_id);
CREATE INDEX IF NOT EXISTS idx_api_usage_analytics_application_id ON api_usage_analytics(application_id);
CREATE INDEX IF NOT EXISTS idx_api_usage_analytics_endpoint ON api_usage_analytics(endpoint);
CREATE INDEX IF NOT EXISTS idx_api_usage_analytics_date ON api_usage_analytics(date);
CREATE INDEX IF NOT EXISTS idx_api_usage_analytics_timestamp ON api_usage_analytics(timestamp);

-- Marketplace Revenue table
CREATE TABLE IF NOT EXISTS marketplace_revenue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    application_id UUID NOT NULL REFERENCES marketplace_applications(id) ON DELETE CASCADE,
    developer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    revenue_type VARCHAR(50) NOT NULL, -- 'subscription', 'one_time', 'usage', 'commission'
    gross_amount DECIMAL(12,2) NOT NULL,
    marketplace_fee DECIMAL(12,2) NOT NULL,
    net_amount DECIMAL(12,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    billing_period_start DATE,
    billing_period_end DATE,
    transaction_id VARCHAR(255),
    payment_status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'paid', 'failed', 'refunded'
    payout_status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'processing', 'paid', 'failed'
    payout_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for marketplace_revenue
CREATE INDEX IF NOT EXISTS idx_marketplace_revenue_application_id ON marketplace_revenue(application_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_revenue_developer_id ON marketplace_revenue(developer_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_revenue_organization_id ON marketplace_revenue(organization_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_revenue_payment_status ON marketplace_revenue(payment_status);
CREATE INDEX IF NOT EXISTS idx_marketplace_revenue_payout_status ON marketplace_revenue(payout_status);
CREATE INDEX IF NOT EXISTS idx_marketplace_revenue_created_at ON marketplace_revenue(created_at);

-- Add triggers for updated_at columns
CREATE TRIGGER update_marketplace_applications_updated_at BEFORE UPDATE ON marketplace_applications FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_application_installations_updated_at BEFORE UPDATE ON application_installations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_application_reviews_updated_at BEFORE UPDATE ON application_reviews FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_developer_profiles_updated_at BEFORE UPDATE ON developer_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_webhook_endpoints_updated_at BEFORE UPDATE ON webhook_endpoints FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_api_keys_updated_at BEFORE UPDATE ON api_keys FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to update application ratings
CREATE OR REPLACE FUNCTION update_application_rating()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE marketplace_applications 
    SET 
        rating_average = (
            SELECT AVG(rating)::DECIMAL(3,2) 
            FROM application_reviews 
            WHERE application_id = NEW.application_id AND status = 'published'
        ),
        rating_count = (
            SELECT COUNT(*) 
            FROM application_reviews 
            WHERE application_id = NEW.application_id AND status = 'published'
        )
    WHERE id = NEW.application_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update ratings when reviews are added/updated
CREATE TRIGGER update_application_rating_trigger
    AFTER INSERT OR UPDATE ON application_reviews
    FOR EACH ROW
    EXECUTE FUNCTION update_application_rating();

-- Function to process webhook deliveries
CREATE OR REPLACE FUNCTION process_webhook_delivery(
    endpoint_id UUID,
    event_type VARCHAR,
    event_data JSONB
)
RETURNS UUID AS $$
DECLARE
    delivery_id UUID;
    webhook_url VARCHAR(500);
    webhook_secret VARCHAR(255);
    retry_policy JSONB;
BEGIN
    -- Get webhook details
    SELECT url, secret, retry_policy INTO webhook_url, webhook_secret, retry_policy
    FROM webhook_endpoints
    WHERE id = endpoint_id AND is_active = true;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Webhook endpoint not found or inactive';
    END IF;
    
    -- Create delivery record
    INSERT INTO webhook_deliveries (
        webhook_endpoint_id,
        event_type,
        event_id,
        payload,
        max_attempts
    ) VALUES (
        endpoint_id,
        event_type,
        gen_random_uuid(),
        event_data,
        COALESCE((retry_policy->>'max_retries')::INTEGER, 3)
    ) RETURNING id INTO delivery_id;
    
    -- Update webhook endpoint stats
    UPDATE webhook_endpoints 
    SET last_triggered_at = NOW()
    WHERE id = endpoint_id;
    
    RETURN delivery_id;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate marketplace metrics
CREATE OR REPLACE FUNCTION get_marketplace_metrics(
    start_date DATE DEFAULT CURRENT_DATE - INTERVAL '30 days',
    end_date DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB AS $$
DECLARE
    metrics JSONB := '{}';
    total_apps INTEGER;
    active_installations INTEGER;
    total_revenue DECIMAL(12,2);
    avg_rating DECIMAL(3,2);
BEGIN
    -- Total applications
    SELECT COUNT(*) INTO total_apps
    FROM marketplace_applications
    WHERE status = 'published';
    
    -- Active installations
    SELECT COUNT(*) INTO active_installations
    FROM application_installations
    WHERE installation_status = 'active'
      AND installed_at::DATE BETWEEN start_date AND end_date;
    
    -- Total revenue
    SELECT COALESCE(SUM(gross_amount), 0) INTO total_revenue
    FROM marketplace_revenue
    WHERE created_at::DATE BETWEEN start_date AND end_date;
    
    -- Average rating
    SELECT AVG(rating_average) INTO avg_rating
    FROM marketplace_applications
    WHERE status = 'published' AND rating_count > 0;
    
    -- Build metrics JSON
    metrics := jsonb_build_object(
        'total_applications', total_apps,
        'active_installations', active_installations,
        'total_revenue', total_revenue,
        'average_rating', COALESCE(avg_rating, 0),
        'period_start', start_date,
        'period_end', end_date
    );
    
    RETURN metrics;
END;
$$ LANGUAGE plpgsql;

-- Insert sample marketplace applications
INSERT INTO marketplace_applications (developer_id, name, slug, description, category, status, pricing_model, logo_url, tags) 
SELECT 
    u.id,
    'Salesforce CRM Integration',
    'salesforce-crm',
    'Seamlessly sync customer data and conversations with Salesforce CRM',
    'crm',
    'published',
    'subscription',
    'https://cdn.universalai-cs.com/apps/salesforce-logo.png',
    ARRAY['crm', 'salesforce', 'sync', 'automation']
FROM users u 
WHERE u.role = 'super_admin' 
LIMIT 1
ON CONFLICT (slug) DO NOTHING;

INSERT INTO marketplace_applications (developer_id, name, slug, description, category, status, pricing_model, logo_url, tags)
SELECT 
    u.id,
    'Shopify E-commerce Connector',
    'shopify-ecommerce',
    'Connect your Shopify store for automated order support and customer service',
    'ecommerce',
    'published',
    'free',
    'https://cdn.universalai-cs.com/apps/shopify-logo.png',
    ARRAY['ecommerce', 'shopify', 'orders', 'automation']
FROM users u 
WHERE u.role = 'super_admin' 
LIMIT 1
ON CONFLICT (slug) DO NOTHING;

INSERT INTO marketplace_applications (developer_id, name, slug, description, category, status, pricing_model, logo_url, tags)
SELECT 
    u.id,
    'Advanced Analytics Dashboard',
    'advanced-analytics',
    'Comprehensive analytics and reporting for customer service performance',
    'analytics',
    'published',
    'subscription',
    'https://cdn.universalai-cs.com/apps/analytics-logo.png',
    ARRAY['analytics', 'reporting', 'dashboard', 'insights']
FROM users u 
WHERE u.role = 'super_admin' 
LIMIT 1
ON CONFLICT (slug) DO NOTHING;
