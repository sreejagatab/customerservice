import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { Card, CardHeader, CardTitle, CardContent, Button, Input, Badge } from '@/components/ui';
import { useAuthStore } from '@/store/authStore';

const organizationSchema = z.object({
  name: z.string().min(2, 'Organization name must be at least 2 characters'),
  website: z.string().url('Please enter a valid URL').optional().or(z.literal('')),
  industry: z.string().min(1, 'Please select an industry'),
  size: z.string().min(1, 'Please select organization size'),
  timezone: z.string().min(1, 'Please select a timezone'),
});

const aiConfigSchema = z.object({
  primaryProvider: z.string().min(1, 'Please select a primary AI provider'),
  fallbackProvider: z.string().optional(),
  temperature: z.number().min(0).max(2),
  maxTokens: z.number().min(1).max(4000),
  enableFallback: z.boolean(),
  confidenceThreshold: z.number().min(0).max(1),
});

const notificationSchema = z.object({
  emailNotifications: z.boolean(),
  slackNotifications: z.boolean(),
  webhookUrl: z.string().url('Please enter a valid webhook URL').optional().or(z.literal('')),
  notifyOnNewMessage: z.boolean(),
  notifyOnEscalation: z.boolean(),
  notifyOnError: z.boolean(),
});

type OrganizationFormData = z.infer<typeof organizationSchema>;
type AIConfigFormData = z.infer<typeof aiConfigSchema>;
type NotificationFormData = z.infer<typeof notificationSchema>;

export const SettingsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState('organization');
  const [isLoading, setIsLoading] = useState(false);
  const { organization } = useAuthStore();

  const organizationForm = useForm<OrganizationFormData>({
    resolver: zodResolver(organizationSchema),
    defaultValues: {
      name: organization?.name || '',
      website: organization?.website || '',
      industry: organization?.industry || '',
      size: organization?.size || '',
      timezone: organization?.timezone || 'UTC',
    },
  });

  const aiConfigForm = useForm<AIConfigFormData>({
    resolver: zodResolver(aiConfigSchema),
    defaultValues: {
      primaryProvider: 'openai',
      fallbackProvider: 'anthropic',
      temperature: 0.7,
      maxTokens: 1000,
      enableFallback: true,
      confidenceThreshold: 0.8,
    },
  });

  const notificationForm = useForm<NotificationFormData>({
    resolver: zodResolver(notificationSchema),
    defaultValues: {
      emailNotifications: true,
      slackNotifications: false,
      webhookUrl: '',
      notifyOnNewMessage: true,
      notifyOnEscalation: true,
      notifyOnError: true,
    },
  });

  const onSubmitOrganization = async (data: OrganizationFormData) => {
    setIsLoading(true);
    try {
      // TODO: Implement organization update API call
      console.log('Updating organization:', data);
      toast.success('Organization settings updated successfully!');
    } catch (error) {
      toast.error('Failed to update organization settings');
    } finally {
      setIsLoading(false);
    }
  };

  const onSubmitAIConfig = async (data: AIConfigFormData) => {
    setIsLoading(true);
    try {
      // TODO: Implement AI config update API call
      console.log('Updating AI config:', data);
      toast.success('AI configuration updated successfully!');
    } catch (error) {
      toast.error('Failed to update AI configuration');
    } finally {
      setIsLoading(false);
    }
  };

  const onSubmitNotifications = async (data: NotificationFormData) => {
    setIsLoading(true);
    try {
      // TODO: Implement notification settings update API call
      console.log('Updating notifications:', data);
      toast.success('Notification settings updated successfully!');
    } catch (error) {
      toast.error('Failed to update notification settings');
    } finally {
      setIsLoading(false);
    }
  };

  const tabs = [
    { id: 'organization', name: 'Organization', icon: '🏢' },
    { id: 'ai', name: 'AI Configuration', icon: '🤖' },
    { id: 'notifications', name: 'Notifications', icon: '🔔' },
    { id: 'billing', name: 'Billing', icon: '💳' },
    { id: 'security', name: 'Security', icon: '🔒' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Settings
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Manage your organization settings and preferences
        </p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Sidebar */}
        <div className="lg:w-64">
          <Card>
            <CardContent className="p-4">
              <nav className="space-y-2">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full flex items-center space-x-3 px-3 py-2 text-left rounded-md transition-colors ${
                      activeTab === tab.id
                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200'
                        : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
                    }`}
                  >
                    <span className="text-lg">{tab.icon}</span>
                    <span className="font-medium">{tab.name}</span>
                  </button>
                ))}
              </nav>
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        <div className="flex-1">
          {activeTab === 'organization' && (
            <Card>
              <CardHeader>
                <CardTitle>Organization Settings</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={organizationForm.handleSubmit(onSubmitOrganization)} className="space-y-6">
                  <Input
                    label="Organization Name"
                    {...organizationForm.register('name')}
                    error={organizationForm.formState.errors.name?.message}
                  />

                  <Input
                    label="Website"
                    type="url"
                    placeholder="https://your-website.com"
                    {...organizationForm.register('website')}
                    error={organizationForm.formState.errors.website?.message}
                  />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Industry
                      </label>
                      <select
                        {...organizationForm.register('industry')}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white dark:bg-gray-800 dark:border-gray-600 text-sm"
                      >
                        <option value="">Select Industry</option>
                        <option value="ecommerce">E-commerce</option>
                        <option value="saas">SaaS</option>
                        <option value="healthcare">Healthcare</option>
                        <option value="finance">Finance</option>
                        <option value="education">Education</option>
                        <option value="other">Other</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Organization Size
                      </label>
                      <select
                        {...organizationForm.register('size')}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white dark:bg-gray-800 dark:border-gray-600 text-sm"
                      >
                        <option value="">Select Size</option>
                        <option value="1-10">1-10 employees</option>
                        <option value="11-50">11-50 employees</option>
                        <option value="51-200">51-200 employees</option>
                        <option value="201-1000">201-1000 employees</option>
                        <option value="1000+">1000+ employees</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Timezone
                    </label>
                    <select
                      {...organizationForm.register('timezone')}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white dark:bg-gray-800 dark:border-gray-600 text-sm"
                    >
                      <option value="UTC">UTC</option>
                      <option value="America/New_York">Eastern Time</option>
                      <option value="America/Chicago">Central Time</option>
                      <option value="America/Denver">Mountain Time</option>
                      <option value="America/Los_Angeles">Pacific Time</option>
                      <option value="Europe/London">London</option>
                      <option value="Europe/Paris">Paris</option>
                      <option value="Asia/Tokyo">Tokyo</option>
                    </select>
                  </div>

                  <Button type="submit" loading={isLoading}>
                    Save Organization Settings
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}

          {activeTab === 'ai' && (
            <Card>
              <CardHeader>
                <CardTitle>AI Configuration</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={aiConfigForm.handleSubmit(onSubmitAIConfig)} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Primary AI Provider
                      </label>
                      <select
                        {...aiConfigForm.register('primaryProvider')}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white dark:bg-gray-800 dark:border-gray-600 text-sm"
                      >
                        <option value="openai">OpenAI GPT-4</option>
                        <option value="anthropic">Anthropic Claude</option>
                        <option value="google">Google Gemini</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Fallback Provider
                      </label>
                      <select
                        {...aiConfigForm.register('fallbackProvider')}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white dark:bg-gray-800 dark:border-gray-600 text-sm"
                      >
                        <option value="">None</option>
                        <option value="openai">OpenAI GPT-4</option>
                        <option value="anthropic">Anthropic Claude</option>
                        <option value="google">Google Gemini</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Temperature (0-2)
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="2"
                        {...aiConfigForm.register('temperature', { valueAsNumber: true })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white dark:bg-gray-800 dark:border-gray-600 text-sm"
                      />
                      <p className="text-xs text-gray-500 mt-1">Higher values make output more random</p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Max Tokens
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="4000"
                        {...aiConfigForm.register('maxTokens', { valueAsNumber: true })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white dark:bg-gray-800 dark:border-gray-600 text-sm"
                      />
                      <p className="text-xs text-gray-500 mt-1">Maximum response length</p>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Confidence Threshold
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="1"
                      {...aiConfigForm.register('confidenceThreshold', { valueAsNumber: true })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white dark:bg-gray-800 dark:border-gray-600 text-sm"
                    />
                    <p className="text-xs text-gray-500 mt-1">Minimum confidence required for auto-response</p>
                  </div>

                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="enableFallback"
                      {...aiConfigForm.register('enableFallback')}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <label htmlFor="enableFallback" className="text-sm text-gray-700 dark:text-gray-300">
                      Enable automatic fallback to secondary provider
                    </label>
                  </div>

                  <Button type="submit" loading={isLoading}>
                    Save AI Configuration
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}

          {activeTab === 'notifications' && (
            <Card>
              <CardHeader>
                <CardTitle>Notification Settings</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={notificationForm.handleSubmit(onSubmitNotifications)} className="space-y-6">
                  <div className="space-y-4">
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                      Notification Channels
                    </h3>
                    
                    <div className="space-y-3">
                      <div className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id="emailNotifications"
                          {...notificationForm.register('emailNotifications')}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                        <label htmlFor="emailNotifications" className="text-sm text-gray-700 dark:text-gray-300">
                          Email notifications
                        </label>
                      </div>

                      <div className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id="slackNotifications"
                          {...notificationForm.register('slackNotifications')}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                        <label htmlFor="slackNotifications" className="text-sm text-gray-700 dark:text-gray-300">
                          Slack notifications
                        </label>
                      </div>
                    </div>

                    <Input
                      label="Webhook URL (Optional)"
                      type="url"
                      placeholder="https://your-webhook-url.com"
                      {...notificationForm.register('webhookUrl')}
                      error={notificationForm.formState.errors.webhookUrl?.message}
                    />
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                      Notification Events
                    </h3>
                    
                    <div className="space-y-3">
                      <div className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id="notifyOnNewMessage"
                          {...notificationForm.register('notifyOnNewMessage')}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                        <label htmlFor="notifyOnNewMessage" className="text-sm text-gray-700 dark:text-gray-300">
                          New message received
                        </label>
                      </div>

                      <div className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id="notifyOnEscalation"
                          {...notificationForm.register('notifyOnEscalation')}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                        <label htmlFor="notifyOnEscalation" className="text-sm text-gray-700 dark:text-gray-300">
                          Conversation escalated
                        </label>
                      </div>

                      <div className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id="notifyOnError"
                          {...notificationForm.register('notifyOnError')}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                        <label htmlFor="notifyOnError" className="text-sm text-gray-700 dark:text-gray-300">
                          System errors
                        </label>
                      </div>
                    </div>
                  </div>

                  <Button type="submit" loading={isLoading}>
                    Save Notification Settings
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}

          {activeTab === 'billing' && (
            <Card>
              <CardHeader>
                <CardTitle>Billing & Subscription</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-blue-900 dark:text-blue-100">
                        Professional Plan
                      </h3>
                      <p className="text-blue-700 dark:text-blue-300">
                        $149/month • 5,000 AI-processed messages
                      </p>
                    </div>
                    <Badge variant="success">Active</Badge>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="text-center p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">3,247</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Messages Used</p>
                  </div>
                  <div className="text-center p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">1,753</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Messages Remaining</p>
                  </div>
                  <div className="text-center p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">12</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Days Until Renewal</p>
                  </div>
                </div>

                <div className="flex space-x-4">
                  <Button variant="outline">
                    Change Plan
                  </Button>
                  <Button variant="outline">
                    Update Payment Method
                  </Button>
                  <Button variant="outline">
                    Download Invoice
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === 'security' && (
            <Card>
              <CardHeader>
                <CardTitle>Security Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                    Two-Factor Authentication
                  </h3>
                  <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">
                        2FA Status
                      </p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Add an extra layer of security to your account
                      </p>
                    </div>
                    <Badge variant="warning">Disabled</Badge>
                  </div>
                  <Button variant="outline">
                    Enable 2FA
                  </Button>
                </div>

                <div className="space-y-4">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                    API Keys
                  </h3>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">
                          Production API Key
                        </p>
                        <p className="text-sm text-gray-600 dark:text-gray-400 font-mono">
                          uai_prod_••••••••••••••••
                        </p>
                      </div>
                      <Button variant="outline" size="sm">
                        Regenerate
                      </Button>
                    </div>
                  </div>
                  <Button variant="outline">
                    Create New API Key
                  </Button>
                </div>

                <div className="space-y-4">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                    Session Management
                  </h3>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">
                          Current Session
                        </p>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          Chrome on Windows • Active now
                        </p>
                      </div>
                      <Badge variant="success">Current</Badge>
                    </div>
                  </div>
                  <Button variant="danger">
                    Sign Out All Other Sessions
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};
