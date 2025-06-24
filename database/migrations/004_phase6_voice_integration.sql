-- Phase 6.3: Voice & Communication Expansion Migration
-- This migration adds voice call processing, transcription, and mobile app support

-- Voice Calls table
CREATE TABLE IF NOT EXISTS voice_calls (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
    call_sid VARCHAR(255) UNIQUE NOT NULL, -- Twilio/provider call ID
    phone_number_from VARCHAR(20) NOT NULL,
    phone_number_to VARCHAR(20) NOT NULL,
    call_direction VARCHAR(20) NOT NULL, -- 'inbound', 'outbound'
    call_status VARCHAR(50) DEFAULT 'initiated', -- 'initiated', 'ringing', 'in-progress', 'completed', 'busy', 'failed', 'no-answer'
    call_duration INTEGER DEFAULT 0, -- seconds
    recording_url VARCHAR(500),
    recording_duration INTEGER DEFAULT 0,
    transcription_text TEXT,
    transcription_confidence DECIMAL(5, 4),
    transcription_status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
    speaker_segments JSONB DEFAULT '[]', -- array of speaker segments with timestamps
    call_quality_score DECIMAL(3, 2), -- 0.00 to 5.00
    call_metadata JSONB DEFAULT '{}',
    ivr_path JSONB DEFAULT '[]', -- IVR menu path taken
    agent_id UUID REFERENCES users(id) ON DELETE SET NULL,
    queue_time INTEGER DEFAULT 0, -- seconds in queue
    talk_time INTEGER DEFAULT 0, -- actual talk time
    hold_time INTEGER DEFAULT 0, -- time on hold
    transfer_count INTEGER DEFAULT 0,
    cost DECIMAL(8, 4) DEFAULT 0,
    provider VARCHAR(50) DEFAULT 'twilio', -- 'twilio', 'amazon_connect', 'google_voice'
    provider_data JSONB DEFAULT '{}',
    started_at TIMESTAMP WITH TIME ZONE,
    answered_at TIMESTAMP WITH TIME ZONE,
    ended_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for voice_calls
CREATE INDEX IF NOT EXISTS idx_voice_calls_organization_id ON voice_calls(organization_id);
CREATE INDEX IF NOT EXISTS idx_voice_calls_conversation_id ON voice_calls(conversation_id);
CREATE INDEX IF NOT EXISTS idx_voice_calls_call_sid ON voice_calls(call_sid);
CREATE INDEX IF NOT EXISTS idx_voice_calls_phone_number_from ON voice_calls(phone_number_from);
CREATE INDEX IF NOT EXISTS idx_voice_calls_call_direction ON voice_calls(call_direction);
CREATE INDEX IF NOT EXISTS idx_voice_calls_call_status ON voice_calls(call_status);
CREATE INDEX IF NOT EXISTS idx_voice_calls_agent_id ON voice_calls(agent_id);
CREATE INDEX IF NOT EXISTS idx_voice_calls_started_at ON voice_calls(started_at);
CREATE INDEX IF NOT EXISTS idx_voice_calls_provider ON voice_calls(provider);

-- Voice Call Analytics table
CREATE TABLE IF NOT EXISTS voice_call_analytics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    voice_call_id UUID NOT NULL REFERENCES voice_calls(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    sentiment_analysis JSONB DEFAULT '{}', -- overall call sentiment
    emotion_analysis JSONB DEFAULT '{}', -- emotion detection throughout call
    keywords_extracted TEXT[] DEFAULT '{}',
    topics_identified TEXT[] DEFAULT '{}',
    intent_classification VARCHAR(100),
    confidence_scores JSONB DEFAULT '{}',
    speech_analytics JSONB DEFAULT '{}', -- pace, volume, interruptions, etc.
    customer_satisfaction_score DECIMAL(3, 2), -- predicted CSAT
    agent_performance_score DECIMAL(3, 2),
    compliance_flags JSONB DEFAULT '[]', -- compliance issues detected
    coaching_opportunities JSONB DEFAULT '[]', -- areas for agent improvement
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for voice_call_analytics
CREATE INDEX IF NOT EXISTS idx_voice_call_analytics_voice_call_id ON voice_call_analytics(voice_call_id);
CREATE INDEX IF NOT EXISTS idx_voice_call_analytics_organization_id ON voice_call_analytics(organization_id);
CREATE INDEX IF NOT EXISTS idx_voice_call_analytics_intent_classification ON voice_call_analytics(intent_classification);

-- Phone Numbers table (for managing organization phone numbers)
CREATE TABLE IF NOT EXISTS phone_numbers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    phone_number VARCHAR(20) UNIQUE NOT NULL,
    phone_number_sid VARCHAR(255), -- Provider phone number ID
    friendly_name VARCHAR(255),
    country_code VARCHAR(5) DEFAULT 'US',
    number_type VARCHAR(20) DEFAULT 'local', -- 'local', 'toll_free', 'mobile'
    capabilities JSONB DEFAULT '{}', -- voice, sms, mms capabilities
    is_primary BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    routing_config JSONB DEFAULT '{}', -- IVR and routing configuration
    business_hours JSONB DEFAULT '{}',
    after_hours_config JSONB DEFAULT '{}',
    provider VARCHAR(50) DEFAULT 'twilio',
    provider_data JSONB DEFAULT '{}',
    monthly_cost DECIMAL(8, 2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for phone_numbers
CREATE INDEX IF NOT EXISTS idx_phone_numbers_organization_id ON phone_numbers(organization_id);
CREATE INDEX IF NOT EXISTS idx_phone_numbers_phone_number ON phone_numbers(phone_number);
CREATE INDEX IF NOT EXISTS idx_phone_numbers_is_primary ON phone_numbers(is_primary);
CREATE INDEX IF NOT EXISTS idx_phone_numbers_is_active ON phone_numbers(is_active);

-- IVR (Interactive Voice Response) Flows table
CREATE TABLE IF NOT EXISTS ivr_flows (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    phone_number_id UUID REFERENCES phone_numbers(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    flow_config JSONB NOT NULL DEFAULT '{}', -- complete IVR flow definition
    welcome_message TEXT,
    language VARCHAR(10) DEFAULT 'en-US',
    voice_settings JSONB DEFAULT '{}', -- voice type, speed, etc.
    business_hours_flow JSONB DEFAULT '{}',
    after_hours_flow JSONB DEFAULT '{}',
    fallback_action VARCHAR(50) DEFAULT 'voicemail', -- 'voicemail', 'transfer', 'hangup'
    max_retries INTEGER DEFAULT 3,
    timeout_seconds INTEGER DEFAULT 30,
    is_active BOOLEAN DEFAULT TRUE,
    version INTEGER DEFAULT 1,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for ivr_flows
CREATE INDEX IF NOT EXISTS idx_ivr_flows_organization_id ON ivr_flows(organization_id);
CREATE INDEX IF NOT EXISTS idx_ivr_flows_phone_number_id ON ivr_flows(phone_number_id);
CREATE INDEX IF NOT EXISTS idx_ivr_flows_is_active ON ivr_flows(is_active);

-- Voice Transcription Jobs table
CREATE TABLE IF NOT EXISTS voice_transcription_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    voice_call_id UUID NOT NULL REFERENCES voice_calls(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    audio_url VARCHAR(500) NOT NULL,
    transcription_provider VARCHAR(50) DEFAULT 'google', -- 'google', 'amazon', 'azure', 'openai'
    job_status VARCHAR(50) DEFAULT 'queued', -- 'queued', 'processing', 'completed', 'failed'
    transcription_result JSONB DEFAULT '{}',
    confidence_score DECIMAL(5, 4),
    language_detected VARCHAR(10),
    speaker_count INTEGER,
    processing_time INTEGER, -- milliseconds
    cost DECIMAL(8, 4) DEFAULT 0,
    error_message TEXT,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for voice_transcription_jobs
CREATE INDEX IF NOT EXISTS idx_voice_transcription_jobs_voice_call_id ON voice_transcription_jobs(voice_call_id);
CREATE INDEX IF NOT EXISTS idx_voice_transcription_jobs_organization_id ON voice_transcription_jobs(organization_id);
CREATE INDEX IF NOT EXISTS idx_voice_transcription_jobs_job_status ON voice_transcription_jobs(job_status);

-- Mobile App Sessions table (for tracking mobile app usage)
CREATE TABLE IF NOT EXISTS mobile_app_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    device_id VARCHAR(255) NOT NULL,
    app_version VARCHAR(50) NOT NULL,
    platform VARCHAR(20) NOT NULL, -- 'ios', 'android'
    platform_version VARCHAR(50),
    device_model VARCHAR(100),
    session_token VARCHAR(255) UNIQUE NOT NULL,
    push_token VARCHAR(500), -- for push notifications
    session_start TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    session_end TIMESTAMP WITH TIME ZONE,
    last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE,
    location_data JSONB DEFAULT '{}', -- if location permission granted
    app_settings JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for mobile_app_sessions
CREATE INDEX IF NOT EXISTS idx_mobile_app_sessions_user_id ON mobile_app_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_mobile_app_sessions_organization_id ON mobile_app_sessions(organization_id);
CREATE INDEX IF NOT EXISTS idx_mobile_app_sessions_device_id ON mobile_app_sessions(device_id);
CREATE INDEX IF NOT EXISTS idx_mobile_app_sessions_session_token ON mobile_app_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_mobile_app_sessions_is_active ON mobile_app_sessions(is_active);

-- Push Notifications table
CREATE TABLE IF NOT EXISTS push_notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    device_id VARCHAR(255),
    notification_type VARCHAR(50) NOT NULL, -- 'new_message', 'call_incoming', 'assignment', 'alert'
    title VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    data JSONB DEFAULT '{}', -- additional payload data
    priority VARCHAR(20) DEFAULT 'normal', -- 'low', 'normal', 'high'
    scheduled_for TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    sent_at TIMESTAMP WITH TIME ZONE,
    delivery_status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'sent', 'delivered', 'failed'
    error_message TEXT,
    click_action VARCHAR(255), -- deep link or action
    badge_count INTEGER DEFAULT 0,
    sound VARCHAR(100) DEFAULT 'default',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for push_notifications
CREATE INDEX IF NOT EXISTS idx_push_notifications_organization_id ON push_notifications(organization_id);
CREATE INDEX IF NOT EXISTS idx_push_notifications_user_id ON push_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_push_notifications_device_id ON push_notifications(device_id);
CREATE INDEX IF NOT EXISTS idx_push_notifications_notification_type ON push_notifications(notification_type);
CREATE INDEX IF NOT EXISTS idx_push_notifications_delivery_status ON push_notifications(delivery_status);
CREATE INDEX IF NOT EXISTS idx_push_notifications_scheduled_for ON push_notifications(scheduled_for);

-- Voice Quality Metrics table
CREATE TABLE IF NOT EXISTS voice_quality_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    voice_call_id UUID NOT NULL REFERENCES voice_calls(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    mos_score DECIMAL(3, 2), -- Mean Opinion Score (1.0-5.0)
    jitter DECIMAL(8, 4), -- milliseconds
    packet_loss DECIMAL(5, 4), -- percentage
    latency DECIMAL(8, 2), -- milliseconds
    audio_codec VARCHAR(50),
    bitrate INTEGER, -- kbps
    sample_rate INTEGER, -- Hz
    network_type VARCHAR(50), -- 'wifi', '4g', '5g', 'ethernet'
    signal_strength INTEGER, -- dBm for mobile
    quality_issues JSONB DEFAULT '[]', -- detected quality issues
    measured_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for voice_quality_metrics
CREATE INDEX IF NOT EXISTS idx_voice_quality_metrics_voice_call_id ON voice_quality_metrics(voice_call_id);
CREATE INDEX IF NOT EXISTS idx_voice_quality_metrics_organization_id ON voice_quality_metrics(organization_id);
CREATE INDEX IF NOT EXISTS idx_voice_quality_metrics_measured_at ON voice_quality_metrics(measured_at);

-- Add triggers for updated_at columns on new tables
CREATE TRIGGER update_voice_calls_updated_at BEFORE UPDATE ON voice_calls FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_phone_numbers_updated_at BEFORE UPDATE ON phone_numbers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_ivr_flows_updated_at BEFORE UPDATE ON ivr_flows FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to calculate voice call metrics
CREATE OR REPLACE FUNCTION calculate_voice_call_metrics(
    org_id UUID,
    start_date TIMESTAMP WITH TIME ZONE DEFAULT NOW() - INTERVAL '30 days',
    end_date TIMESTAMP WITH TIME ZONE DEFAULT NOW()
)
RETURNS JSONB AS $$
DECLARE
    metrics JSONB := '{}';
    total_calls INTEGER;
    answered_calls INTEGER;
    avg_duration DECIMAL(8, 2);
    avg_queue_time DECIMAL(8, 2);
    avg_quality_score DECIMAL(3, 2);
    total_cost DECIMAL(10, 2);
BEGIN
    -- Calculate basic call metrics
    SELECT 
        COUNT(*),
        COUNT(CASE WHEN call_status = 'completed' THEN 1 END),
        AVG(CASE WHEN call_status = 'completed' THEN call_duration END),
        AVG(queue_time),
        AVG(call_quality_score),
        SUM(cost)
    INTO total_calls, answered_calls, avg_duration, avg_queue_time, avg_quality_score, total_cost
    FROM voice_calls
    WHERE organization_id = org_id
      AND started_at BETWEEN start_date AND end_date;

    -- Build metrics JSON
    metrics := jsonb_build_object(
        'total_calls', COALESCE(total_calls, 0),
        'answered_calls', COALESCE(answered_calls, 0),
        'answer_rate', CASE WHEN total_calls > 0 THEN ROUND((answered_calls::DECIMAL / total_calls) * 100, 2) ELSE 0 END,
        'avg_duration_seconds', COALESCE(avg_duration, 0),
        'avg_queue_time_seconds', COALESCE(avg_queue_time, 0),
        'avg_quality_score', COALESCE(avg_quality_score, 0),
        'total_cost', COALESCE(total_cost, 0),
        'period_start', start_date,
        'period_end', end_date
    );

    RETURN metrics;
END;
$$ LANGUAGE plpgsql;

-- Function to get voice analytics summary
CREATE OR REPLACE FUNCTION get_voice_analytics_summary(
    org_id UUID,
    period_days INTEGER DEFAULT 30
)
RETURNS JSONB AS $$
DECLARE
    summary JSONB := '{}';
    sentiment_avg DECIMAL(3, 2);
    top_intents JSONB;
    coaching_opportunities JSONB;
BEGIN
    -- Calculate average sentiment
    SELECT AVG((sentiment_analysis->>'overall_score')::DECIMAL)
    INTO sentiment_avg
    FROM voice_call_analytics vca
    JOIN voice_calls vc ON vca.voice_call_id = vc.id
    WHERE vc.organization_id = org_id
      AND vc.started_at >= NOW() - (period_days || ' days')::INTERVAL;

    -- Get top intents
    SELECT jsonb_agg(intent_data)
    INTO top_intents
    FROM (
        SELECT 
            intent_classification,
            COUNT(*) as count,
            jsonb_build_object('intent', intent_classification, 'count', COUNT(*)) as intent_data
        FROM voice_call_analytics vca
        JOIN voice_calls vc ON vca.voice_call_id = vc.id
        WHERE vc.organization_id = org_id
          AND vc.started_at >= NOW() - (period_days || ' days')::INTERVAL
          AND intent_classification IS NOT NULL
        GROUP BY intent_classification
        ORDER BY COUNT(*) DESC
        LIMIT 10
    ) t;

    -- Get coaching opportunities
    SELECT jsonb_agg(DISTINCT coaching_opportunity)
    INTO coaching_opportunities
    FROM voice_call_analytics vca
    JOIN voice_calls vc ON vca.voice_call_id = vc.id,
    jsonb_array_elements_text(vca.coaching_opportunities) as coaching_opportunity
    WHERE vc.organization_id = org_id
      AND vc.started_at >= NOW() - (period_days || ' days')::INTERVAL;

    -- Build summary
    summary := jsonb_build_object(
        'avg_sentiment_score', COALESCE(sentiment_avg, 0),
        'top_intents', COALESCE(top_intents, '[]'::jsonb),
        'coaching_opportunities', COALESCE(coaching_opportunities, '[]'::jsonb),
        'period_days', period_days
    );

    RETURN summary;
END;
$$ LANGUAGE plpgsql;

-- Insert default IVR flow template
INSERT INTO ivr_flows (organization_id, name, description, flow_config, welcome_message, created_by)
SELECT 
    o.id,
    'Default Customer Service IVR',
    'Standard customer service IVR flow with options for sales, support, and billing',
    '{
        "steps": [
            {
                "id": "welcome",
                "type": "say",
                "text": "Thank you for calling. Your call is important to us.",
                "next": "main_menu"
            },
            {
                "id": "main_menu",
                "type": "gather",
                "text": "Press 1 for Sales, Press 2 for Support, Press 3 for Billing, or Press 0 to speak with an operator",
                "options": {
                    "1": "sales_queue",
                    "2": "support_queue", 
                    "3": "billing_queue",
                    "0": "operator_queue"
                },
                "timeout": 10,
                "retries": 3
            },
            {
                "id": "sales_queue",
                "type": "enqueue",
                "queue": "sales",
                "wait_music": "default"
            },
            {
                "id": "support_queue", 
                "type": "enqueue",
                "queue": "support",
                "wait_music": "default"
            },
            {
                "id": "billing_queue",
                "type": "enqueue", 
                "queue": "billing",
                "wait_music": "default"
            },
            {
                "id": "operator_queue",
                "type": "enqueue",
                "queue": "general",
                "wait_music": "default"
            }
        ]
    }',
    'Thank you for calling. Your call is important to us.',
    (SELECT id FROM users WHERE role = 'super_admin' LIMIT 1)
FROM organizations o
WHERE NOT EXISTS (
    SELECT 1 FROM ivr_flows WHERE organization_id = o.id
)
LIMIT 5;
