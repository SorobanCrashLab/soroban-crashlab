'use client';

import React, { useState, useCallback } from 'react';

export type AlertSeverity = 'low' | 'medium' | 'high' | 'critical';
export type AlertChannel = 'email' | 'slack' | 'webhook' | 'sms';
export type AlertCondition = 'threshold' | 'trend' | 'anomaly' | 'consecutive';

export interface AlertRule {
  id: string;
  name: string;
  description: string;
  category: 'performance' | 'reliability' | 'security' | 'resource';
  enabled: boolean;
  severity: AlertSeverity;
  condition: AlertCondition;
  threshold: number;
  unit: string;
  channels: AlertChannel[];
  cooldown: number; // minutes
  tags: string[];
  createdAt: Date;
  lastTriggered?: Date;
}

export interface NotificationChannel {
  id: string;
  type: AlertChannel;
  name: string;
  enabled: boolean;
  config: Record<string, string | string[] | number | boolean>;
}

interface AlertingSettingsPageProps {
  className?: string;
}

const MOCK_ALERT_RULES: AlertRule[] = [
  {
    id: 'crash-rate-spike',
    name: 'Crash Rate Spike',
    description: 'Alert when the crash rate increases significantly over a short period',
    category: 'reliability',
    enabled: true,
    severity: 'high',
    condition: 'threshold',
    threshold: 15,
    unit: '%',
    channels: ['email', 'slack'],
    cooldown: 30,
    tags: ['critical', 'fuzzing'],
    createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    lastTriggered: new Date(Date.now() - 2 * 60 * 60 * 1000),
  },
  {
    id: 'resource-exhaustion',
    name: 'Resource Exhaustion',
    description: 'Alert when runs consistently hit CPU or memory limits',
    category: 'resource',
    enabled: false,
    severity: 'medium',
    condition: 'consecutive',
    threshold: 5,
    unit: 'runs',
    channels: ['email'],
    cooldown: 60,
    tags: ['performance', 'resource'],
    createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
  },
  {
    id: 'consecutive-failures',
    name: 'Consecutive Failures',
    description: 'Alert when multiple consecutive fuzzing runs fail',
    category: 'reliability',
    enabled: true,
    severity: 'critical',
    condition: 'consecutive',
    threshold: 3,
    unit: 'failures',
    channels: ['email', 'slack', 'sms'],
    cooldown: 15,
    tags: ['critical', 'reliability'],
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    lastTriggered: new Date(Date.now() - 6 * 60 * 60 * 1000),
  },
  {
    id: 'memory-anomaly',
    name: 'Memory Usage Anomaly',
    description: 'Alert when memory usage patterns deviate significantly from baseline',
    category: 'performance',
    enabled: true,
    severity: 'medium',
    condition: 'anomaly',
    threshold: 2.5,
    unit: 'std dev',
    channels: ['webhook'],
    cooldown: 120,
    tags: ['performance', 'anomaly'],
    createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
  },
  {
    id: 'security-violation',
    name: 'Security Violation Detected',
    description: 'Alert when potential security vulnerabilities are discovered',
    category: 'security',
    enabled: true,
    severity: 'critical',
    condition: 'threshold',
    threshold: 1,
    unit: 'violation',
    channels: ['email', 'slack', 'sms'],
    cooldown: 5,
    tags: ['security', 'critical'],
    createdAt: new Date(Date.now() - 12 * 60 * 60 * 1000),
  },
];

const MOCK_NOTIFICATION_CHANNELS: NotificationChannel[] = [
  {
    id: 'email-primary',
    type: 'email',
    name: 'Primary Email',
    enabled: true,
    config: { recipients: ['admin@crashlab.dev', 'alerts@crashlab.dev'] },
  },
  {
    id: 'slack-dev',
    type: 'slack',
    name: 'Dev Team Slack',
    enabled: true,
    config: { webhook: 'https://hooks.slack.com/...', channel: '#crashlab-alerts' },
  },
  {
    id: 'webhook-monitoring',
    type: 'webhook',
    name: 'Monitoring System',
    enabled: false,
    config: { url: 'https://monitoring.example.com/webhook', secret: '***' },
  },
  {
    id: 'sms-oncall',
    type: 'sms',
    name: 'On-Call SMS',
    enabled: true,
    config: { numbers: ['+1234567890'] },
  },
];

export default function AlertingSettingsPage({ className = '' }: AlertingSettingsPageProps) {
  const [alertRules, setAlertRules] = useState<AlertRule[]>(MOCK_ALERT_RULES);
  const [channels, setChannels] = useState<NotificationChannel[]>(MOCK_NOTIFICATION_CHANNELS);
  const [activeTab, setActiveTab] = useState<'rules' | 'channels' | 'history'>('rules');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const toggleAlertRule = useCallback((id: string) => {
    setAlertRules(prev => 
      prev.map(rule => 
        rule.id === id ? { ...rule, enabled: !rule.enabled } : rule
      )
    );
  }, []);

  const toggleChannel = useCallback((id: string) => {
    setChannels(prev => 
      prev.map(channel => 
        channel.id === id ? { ...channel, enabled: !channel.enabled } : channel
      )
    );
  }, []);

  const filteredRules = alertRules.filter(rule => 
    selectedCategory === 'all' || rule.category === selectedCategory
  );

  const getSeverityColor = (severity: AlertSeverity) => {
    switch (severity) {
      case 'low': return 'text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30';
      case 'medium': return 'text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30';
      case 'high': return 'text-orange-600 dark:text-orange-400 bg-orange-100 dark:bg-orange-900/30';
      case 'critical': return 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30';
      default: return 'text-zinc-600 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800';
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'performance': return '⚡';
      case 'reliability': return '🛡️';
      case 'security': return '🔒';
      case 'resource': return '💾';
      default: return '📊';
    }
  };

  const getChannelIcon = (type: AlertChannel) => {
    switch (type) {
      case 'email': return '📧';
      case 'slack': return '💬';
      case 'webhook': return '🔗';
      case 'sms': return '📱';
      default: return '📢';
    }
  };

  const formatLastTriggered = (date?: Date) => {
    if (!date) return 'Never';
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    return 'Recently';
  };

  return (
    <div className={`w-full ${className}`}>
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm">
        {/* Header */}
        <div className="p-8 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-rose-600 dark:bg-rose-500 flex items-center justify-center text-white">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">Alerting Settings</h1>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  Configure alerts, notification channels, and monitoring rules
                </p>
              </div>
            </div>
            
            <button
              onClick={() => console.log('Create new alert rule')}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Alert Rule
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-zinc-200 dark:border-zinc-800">
          <nav className="flex px-8" aria-label="Tabs">
            {[
              { id: 'rules', label: 'Alert Rules', count: alertRules.length },
              { id: 'channels', label: 'Notification Channels', count: channels.length },
              { id: 'history', label: 'Alert History', count: 12 },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`flex items-center gap-2 px-4 py-4 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
                }`}
              >
                {tab.label}
                <span className={`px-2 py-0.5 text-xs rounded-full ${
                  activeTab === tab.id
                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                    : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400'
                }`}>
                  {tab.count}
                </span>
              </button>
            ))}
          </nav>
        </div>
        {/* Tab Content */}
        <div className="p-8">
          {activeTab === 'rules' && (
            <div>
              {/* Filters */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                  <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Category:
                  </label>
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="px-3 py-1.5 text-sm bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="all">All Categories</option>
                    <option value="performance">Performance</option>
                    <option value="reliability">Reliability</option>
                    <option value="security">Security</option>
                    <option value="resource">Resource</option>
                  </select>
                </div>
                
                <div className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
                  <span>{filteredRules.filter(r => r.enabled).length} active</span>
                  <span>•</span>
                  <span>{filteredRules.length} total rules</span>
                </div>
              </div>

              {/* Alert Rules List */}
              <div className="space-y-4">
                {filteredRules.map((rule) => (
                  <div
                    key={rule.id}
                    className="border border-zinc-200 dark:border-zinc-700 rounded-xl p-6 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between gap-6">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <span className="text-lg" aria-hidden="true">
                            {getCategoryIcon(rule.category)}
                          </span>
                          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                            {rule.name}
                          </h3>
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${getSeverityColor(rule.severity)}`}>
                            {rule.severity.toUpperCase()}
                          </span>
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                            rule.enabled 
                              ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                              : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400'
                          }`}>
                            {rule.enabled ? 'ACTIVE' : 'INACTIVE'}
                          </span>
                        </div>
                        
                        <p className="text-zinc-600 dark:text-zinc-400 mb-4">
                          {rule.description}
                        </p>
                        
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div>
                            <span className="text-zinc-500 dark:text-zinc-400">Threshold:</span>
                            <div className="font-medium">
                              {rule.threshold} {rule.unit}
                            </div>
                          </div>
                          <div>
                            <span className="text-zinc-500 dark:text-zinc-400">Condition:</span>
                            <div className="font-medium capitalize">{rule.condition}</div>
                          </div>
                          <div>
                            <span className="text-zinc-500 dark:text-zinc-400">Cooldown:</span>
                            <div className="font-medium">{rule.cooldown}m</div>
                          </div>
                          <div>
                            <span className="text-zinc-500 dark:text-zinc-400">Last Triggered:</span>
                            <div className="font-medium">{formatLastTriggered(rule.lastTriggered)}</div>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2 mt-4">
                          <span className="text-xs text-zinc-500 dark:text-zinc-400">Channels:</span>
                          {rule.channels.map((channel) => (
                            <span
                              key={channel}
                              className="flex items-center gap-1 px-2 py-1 text-xs bg-zinc-100 dark:bg-zinc-800 rounded-full"
                            >
                              {getChannelIcon(channel)}
                              {channel}
                            </span>
                          ))}
                        </div>
                        
                        <div className="flex items-center gap-2 mt-2">
                          <span className="text-xs text-zinc-500 dark:text-zinc-400">Tags:</span>
                          {rule.tags.map((tag) => (
                            <span
                              key={tag}
                              className="px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-full"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => console.log('Edit rule:', rule.id)}
                          className="p-2 text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                          title="Edit rule"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        
                        <button
                          onClick={() => toggleAlertRule(rule.id)}
                          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-zinc-900 ${
                            rule.enabled ? 'bg-blue-600' : 'bg-zinc-200 dark:bg-zinc-700'
                          }`}
                          aria-pressed={rule.enabled}
                        >
                          <span
                            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                              rule.enabled ? 'translate-x-5' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'channels' && (
            <div>
              <div className="mb-6">
                <h2 className="text-lg font-semibold mb-2">Notification Channels</h2>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  Configure how and where you receive alert notifications
                </p>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {channels.map((channel) => (
                  <div
                    key={channel.id}
                    className="border border-zinc-200 dark:border-zinc-700 rounded-xl p-6"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl" aria-hidden="true">
                          {getChannelIcon(channel.type)}
                        </span>
                        <div>
                          <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">
                            {channel.name}
                          </h3>
                          <p className="text-sm text-zinc-500 dark:text-zinc-400 capitalize">
                            {channel.type} notifications
                          </p>
                        </div>
                      </div>
                      
                      <button
                        onClick={() => toggleChannel(channel.id)}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-zinc-900 ${
                          channel.enabled ? 'bg-blue-600' : 'bg-zinc-200 dark:bg-zinc-700'
                        }`}
                        aria-pressed={channel.enabled}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                            channel.enabled ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>
                    
                    <div className="space-y-2 text-sm">
                      {Object.entries(channel.config).map(([key, value]) => (
                        <div key={key} className="flex justify-between">
                          <span className="text-zinc-500 dark:text-zinc-400 capitalize">
                            {key}:
                          </span>
                          <span className="font-medium text-zinc-900 dark:text-zinc-100">
                            {Array.isArray(value) ? value.join(', ') : 
                             typeof value === 'string' && value.includes('***') ? value :
                             typeof value === 'string' && value.length > 30 ? `${value.substring(0, 30)}...` :
                             String(value)}
                          </span>
                        </div>
                      ))}
                    </div>
                    
                    <button className="mt-4 w-full py-2 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 font-medium transition-colors">
                      Configure Channel
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'history' && (
            <div>
              <div className="mb-6">
                <h2 className="text-lg font-semibold mb-2">Alert History</h2>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  Recent alert notifications and their status
                </p>
              </div>
              
              <div className="bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-xl p-8 text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center">
                  <svg className="w-8 h-8 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
                  Alert History Coming Soon
                </h3>
                <p className="text-zinc-600 dark:text-zinc-400">
                  View detailed logs of triggered alerts, delivery status, and response times.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-8 py-6 bg-zinc-50/50 dark:bg-zinc-900/30 border-t border-zinc-200 dark:border-zinc-800 flex justify-between items-center">
          <div className="text-sm text-zinc-500 dark:text-zinc-400">
            Last updated: {new Date().toLocaleDateString()}
          </div>
          
          <div className="flex gap-3">
            <button className="px-4 py-2 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 font-medium transition-colors">
              Reset to Defaults
            </button>
            <button className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors">
              Save All Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}