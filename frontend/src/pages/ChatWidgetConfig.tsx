/**
 * Chat Widget Configuration Page
 * Interface for customizing and deploying chat widgets
 */

import React, { useState, useEffect } from 'react';
import {
  CogIcon,
  EyeIcon,
  CodeBracketIcon,
  DocumentDuplicateIcon,
  CheckIcon,
  SwatchIcon,
  GlobeAltIcon,
  DevicePhoneMobileIcon,
} from '@heroicons/react/24/outline';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Switch } from '@/components/ui/Switch';
import { ColorPicker } from '@/components/ui/ColorPicker';
import { CodeBlock } from '@/components/ui/CodeBlock';
import { ChatWidgetPreview } from '@/components/chat-widget/ChatWidgetPreview';
import { useToast } from '@/hooks/useToast';

interface WidgetConfig {
  // Basic settings
  name: string;
  welcomeMessage: string;
  placeholder: string;
  
  // Appearance
  position: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  theme: 'modern' | 'classic' | 'minimal';
  primaryColor: string;
  fontFamily: string;
  borderRadius: number;
  
  // Behavior
  autoOpen: boolean;
  showWelcomeMessage: boolean;
  typingIndicator: boolean;
  soundEnabled: boolean;
  
  // Features
  fileUpload: boolean;
  maxFileSize: number;
  allowedFileTypes: string[];
  
  // Localization
  languages: string[];
  autoDetectLanguage: boolean;
  
  // Offline mode
  offlineMode: 'hide' | 'form' | 'message';
  offlineMessage: string;
  
  // Custom fields
  customFields: Record<string, any>;
}

const DEFAULT_CONFIG: WidgetConfig = {
  name: 'Customer Support',
  welcomeMessage: 'Hi! How can I help you today?',
  placeholder: 'Type your message...',
  position: 'bottom-right',
  theme: 'modern',
  primaryColor: '#3b82f6',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  borderRadius: 12,
  autoOpen: false,
  showWelcomeMessage: true,
  typingIndicator: true,
  soundEnabled: true,
  fileUpload: true,
  maxFileSize: 10,
  allowedFileTypes: ['image/*', '.pdf', '.doc', '.docx'],
  languages: ['en'],
  autoDetectLanguage: true,
  offlineMode: 'form',
  offlineMessage: 'We\'re currently offline. Please leave a message and we\'ll get back to you.',
  customFields: {},
};

const LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'it', label: 'Italian' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'zh', label: 'Chinese' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
];

const FONT_OPTIONS = [
  { value: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', label: 'System Default' },
  { value: '"Inter", sans-serif', label: 'Inter' },
  { value: '"Roboto", sans-serif', label: 'Roboto' },
  { value: '"Open Sans", sans-serif', label: 'Open Sans' },
  { value: '"Lato", sans-serif', label: 'Lato' },
];

export const ChatWidgetConfig: React.FC = () => {
  const [config, setConfig] = useState<WidgetConfig>(DEFAULT_CONFIG);
  const [activeTab, setActiveTab] = useState('basic');
  const [showPreview, setShowPreview] = useState(true);
  const [isCopied, setIsCopied] = useState(false);
  const { toast } = useToast();

  // Generate embed code
  const generateEmbedCode = () => {
    const configJson = JSON.stringify({
      apiKey: 'YOUR_API_KEY', // This would be replaced with actual API key
      ...config,
      maxFileSize: config.maxFileSize * 1024 * 1024, // Convert MB to bytes
    }, null, 2);

    return `<!-- Universal AI Customer Service Chat Widget -->
<script src="https://cdn.universalai-cs.com/chat-widget/universal-chat.js"></script>
<script>
  UniversalCS.init(${configJson});
</script>`;
  };

  // Copy embed code to clipboard
  const copyEmbedCode = async () => {
    try {
      await navigator.clipboard.writeText(generateEmbedCode());
      setIsCopied(true);
      toast.success('Embed code copied to clipboard');
      setTimeout(() => setIsCopied(false), 2000);
    } catch (error) {
      toast.error('Failed to copy embed code');
    }
  };

  // Update config
  const updateConfig = (updates: Partial<WidgetConfig>) => {
    setConfig(prev => ({ ...prev, ...updates }));
  };

  // Save configuration
  const saveConfig = async () => {
    try {
      // API call to save configuration
      toast.success('Widget configuration saved');
    } catch (error) {
      toast.error('Failed to save configuration');
    }
  };

  const tabs = [
    { id: 'basic', label: 'Basic Settings', icon: CogIcon },
    { id: 'appearance', label: 'Appearance', icon: SwatchIcon },
    { id: 'features', label: 'Features', icon: DevicePhoneMobileIcon },
    { id: 'localization', label: 'Localization', icon: GlobeAltIcon },
    { id: 'embed', label: 'Embed Code', icon: CodeBracketIcon },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Chat Widget Configuration</h1>
              <p className="text-gray-600 mt-2">
                Customize your chat widget appearance and behavior
              </p>
            </div>
            <div className="flex items-center space-x-4">
              <Button
                variant="outline"
                onClick={() => setShowPreview(!showPreview)}
                className="flex items-center space-x-2"
              >
                <EyeIcon className="h-4 w-4" />
                <span>{showPreview ? 'Hide' : 'Show'} Preview</span>
              </Button>
              <Button onClick={saveConfig} className="flex items-center space-x-2">
                <CheckIcon className="h-4 w-4" />
                <span>Save Configuration</span>
              </Button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Configuration Panel */}
          <div className="lg:col-span-2">
            <Card className="p-6">
              {/* Tabs */}
              <div className="border-b border-gray-200 mb-6">
                <nav className="flex space-x-8">
                  {tabs.map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex items-center space-x-2 py-2 px-1 border-b-2 font-medium text-sm ${
                        activeTab === tab.id
                          ? 'border-blue-500 text-blue-600'
                          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      }`}
                    >
                      <tab.icon className="h-4 w-4" />
                      <span>{tab.label}</span>
                    </button>
                  ))}
                </nav>
              </div>

              {/* Tab Content */}
              {activeTab === 'basic' && (
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Widget Name
                    </label>
                    <Input
                      value={config.name}
                      onChange={(e) => updateConfig({ name: e.target.value })}
                      placeholder="Customer Support"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Welcome Message
                    </label>
                    <Input
                      value={config.welcomeMessage}
                      onChange={(e) => updateConfig({ welcomeMessage: e.target.value })}
                      placeholder="Hi! How can I help you today?"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Input Placeholder
                    </label>
                    <Input
                      value={config.placeholder}
                      onChange={(e) => updateConfig({ placeholder: e.target.value })}
                      placeholder="Type your message..."
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Position
                    </label>
                    <Select
                      value={config.position}
                      onChange={(value) => updateConfig({ position: value as any })}
                      options={[
                        { value: 'bottom-right', label: 'Bottom Right' },
                        { value: 'bottom-left', label: 'Bottom Left' },
                        { value: 'top-right', label: 'Top Right' },
                        { value: 'top-left', label: 'Top Left' },
                      ]}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-sm font-medium text-gray-700">Auto Open</label>
                      <p className="text-sm text-gray-500">Automatically open chat on page load</p>
                    </div>
                    <Switch
                      checked={config.autoOpen}
                      onChange={(checked) => updateConfig({ autoOpen: checked })}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-sm font-medium text-gray-700">Show Welcome Message</label>
                      <p className="text-sm text-gray-500">Display welcome message when chat opens</p>
                    </div>
                    <Switch
                      checked={config.showWelcomeMessage}
                      onChange={(checked) => updateConfig({ showWelcomeMessage: checked })}
                    />
                  </div>
                </div>
              )}

              {activeTab === 'appearance' && (
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Theme
                    </label>
                    <Select
                      value={config.theme}
                      onChange={(value) => updateConfig({ theme: value as any })}
                      options={[
                        { value: 'modern', label: 'Modern' },
                        { value: 'classic', label: 'Classic' },
                        { value: 'minimal', label: 'Minimal' },
                      ]}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Primary Color
                    </label>
                    <ColorPicker
                      value={config.primaryColor}
                      onChange={(color) => updateConfig({ primaryColor: color })}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Font Family
                    </label>
                    <Select
                      value={config.fontFamily}
                      onChange={(value) => updateConfig({ fontFamily: value })}
                      options={FONT_OPTIONS}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Border Radius (px)
                    </label>
                    <Input
                      type="number"
                      value={config.borderRadius}
                      onChange={(e) => updateConfig({ borderRadius: parseInt(e.target.value) })}
                      min="0"
                      max="50"
                    />
                  </div>
                </div>
              )}

              {activeTab === 'embed' && (
                <div className="space-y-6">
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-medium text-gray-900">Embed Code</h3>
                      <Button
                        variant="outline"
                        onClick={copyEmbedCode}
                        className="flex items-center space-x-2"
                      >
                        {isCopied ? (
                          <CheckIcon className="h-4 w-4 text-green-600" />
                        ) : (
                          <DocumentDuplicateIcon className="h-4 w-4" />
                        )}
                        <span>{isCopied ? 'Copied!' : 'Copy Code'}</span>
                      </Button>
                    </div>
                    <CodeBlock
                      language="html"
                      code={generateEmbedCode()}
                    />
                  </div>

                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h4 className="font-medium text-blue-900 mb-2">Installation Instructions</h4>
                    <ol className="text-sm text-blue-800 space-y-1">
                      <li>1. Copy the embed code above</li>
                      <li>2. Paste it before the closing &lt;/body&gt; tag on your website</li>
                      <li>3. Replace 'YOUR_API_KEY' with your actual API key</li>
                      <li>4. Save and publish your website</li>
                    </ol>
                  </div>
                </div>
              )}
            </Card>
          </div>

          {/* Preview Panel */}
          {showPreview && (
            <div className="lg:col-span-1">
              <Card className="p-6 sticky top-8">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Live Preview</h3>
                <ChatWidgetPreview config={config} />
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
