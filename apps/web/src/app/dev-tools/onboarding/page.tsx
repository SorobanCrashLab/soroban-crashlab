'use client';

import { useState } from 'react';
import { Card, Button, Badge, Tooltip } from '@/components';
import { PageHeader } from '@/components/PageHeader';
import { CheckCircleIcon, LightBulbIcon, CodeBracketIcon, CogIcon, DatabaseIcon, ShieldCheckIcon, Square2StackIcon } from '@heroicons/react/24/outline';

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'completed' | 'skipped';
  action?: () => void | Promise<void>;
  result?: string;
  icon: React.ElementType;
}

const onboardingSteps: OnboardingStep[] = [
  {
    id: 'environment',
    title: 'Environment Check',
    description: 'Verify Node.js, pnpm, Rust, and other tools are installed.',
    status: 'pending',
    icon: ShieldCheckIcon,
    action: async () => {
      console.log('Environment check would run here');
      return new Promise((resolve) => {
        setTimeout(() => resolve(), 1000);
      });
    },
  },
  {
    id: 'dependencies',
    title: 'Dependencies',
    description: 'Install project dependencies with pnpm install.',
    status: 'pending',
    icon: DatabaseIcon,
  },
  {
    id: 'tests',
    title: 'Run Tests',
    description: 'Execute the test suite to verify the setup.',
    status: 'pending',
    icon: CodeBracketIcon,
  },
  {
    id: 'first-issue',
    title: 'Find Your First Issue',
    description: 'Browse good first issues to start contributing.',
    status: 'pending',
    icon: LightBulbIcon,
  },
];

const goodFirstIssues = [
  { id: 1, title: 'Add unit tests for a utility function', labels: ['type:task', 'good first issue'], difficulty: 'Beginner' },
  { id: 2, title: 'Improve documentation for a module', labels: ['documentation', 'good first issue'], difficulty: 'Beginner' },
  { id: 3, title: 'Create a new component following conventions', labels: ['component', 'good first issue'], difficulty: 'Beginner' },
  { id: 4, title: 'Add example to the pattern catalog', labels: ['documentation', 'good first issue'], difficulty: 'Beginner' },
  { id: 5, title: 'Write integration tests for an API route', labels: ['tests', 'medium'], difficulty: 'Intermediate' },
];

const quickLinks = [
  { title: 'CLI Guide', href: 'docs/contributors/cli-guide.md', icon: CodeBracketIcon, description: 'Learn to use the crashlab CLI' },
  { title: 'Generator Guide', href: 'docs/contributors/generator-guide.md', icon: Square2StackIcon, description: 'How to use code generators' },
  { title: 'Architecture Guide', href: 'docs/contributors/architecture.md', icon: CogIcon, description: 'Understand the system architecture' },
  { title: 'Where to Start', href: 'docs/contributors/where-to-start.md', icon: LightBulbIcon, description: 'Find issues to work on' },
];

export default function OnboardingPage() {
  const [steps] = useState<OnboardingStep[]>(onboardingSteps);
  const completedCount = steps.filter(s => s.status === 'completed').length;
  const progress = (completedCount / steps.length) * 100;

  return (
    <div className="container-full page-padding">
      <PageHeader
        title="Developer Onboarding"
        description="Welcome to CrashLab! Follow this guide to get started as a contributor."
        actions={
          <Tooltip content="Open CLI docs">
            <Button
              onClick={() => window.open('docs/contributors/cli-guide.md', '_blank')}
              className="btn-outline"
              size="sm"
            >
              CLI Guide
            </Button>
          </Tooltip>
        }
      />

      {/* Overview */}
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Your Progress
        </h2>
        <div className="mb-4">
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
            <div 
              className="bg-blue-600 h-2.5 rounded-full" 
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400 mt-2">
            <span>{completedCount} of {steps.length} steps completed</span>
            <span>{progress.toFixed(0)}%</span>
          </div>
        </div>
      </div>

      {/* Quick Start */}
      <div className="mb-6">
        <Card className="p-4 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20">
          <div className="flex items-start gap-4">
            <div className="mt-1">
              <SparklesIcon className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">
                Quick Start
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                Run <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">crashlab doctor</code> to check your environment.
              </p>
              <div className="flex gap-2">
                <Button
                  onClick={() => {/* Open terminal and run crashlab doctor */}}
                  size="sm"
                >
                  Check Environment
                </Button>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Onboarding Steps */}
      <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
        Onboarding Checklist
      </h2>
      
      <div className="space-y-3 mb-8">
        {steps.map((step, index) => (
          <Card key={step.id} className={`p-4 ${step.status === 'completed' ? 'border-green-200 bg-green-50/50' : ''}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  step.status === 'completed' ? 'bg-green-100 text-green-600' :
                  'bg-gray-100 text-gray-600'
                }`}>
                  {step.status === 'completed' ? (
                    <CheckCircleIcon className="w-5 h-5" />
                  ) : (
                    index + 1
                  )}
                </div>
                <div>
                  <h3 className="font-medium text-gray-900 dark:text-gray-100">
                    {step.title}
                    {step.result && (
                      <span className={`ml-2 text-xs ${step.result === 'Success' ? 'text-green-600' : 'text-red-600'}`}>
                        ({step.result})
                      </span>
                    )}
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {step.description}
                  </p>
                </div>
              </div>
              
              {step.action && step.status !== 'completed' && (
                <Button
                  onClick={() => {/* handleStepAction(step.id) */}}
                  disabled={false}
                  size="sm"
                >
                  Run
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>

      {/* Good First Issues */}
      <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
        Good First Issues
      </h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {goodFirstIssues.map((issue) => (
          <Card key={issue.id} className="p-4 flex flex-col h-full">
            <div className="flex items-start justify-between mb-3">
              <h3 className="font-medium text-gray-900 dark:text-gray-100">{issue.title}</h3>
              <Badge variant={issue.difficulty === 'Beginner' ? 'outline' : 'default'}>
                {issue.difficulty}
              </Badge>
            </div>
            <div className="flex flex-wrap gap-1 mb-4">
              {issue.labels.map((label) => (
                <Badge key={label} variant="outline" size="sm" className="text-xs">
                  {label}
                </Badge>
              ))}
            </div>
            <div className="mt-auto">
              <Button
                onClick={() => window.open(`https://github.com/SorobanCrashLab/soroban-crashlab/issues/${issue.id}`, '_blank')}
                className="w-full btn-outline"
                size="sm"
              >
                View Issue
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {/* Quick Links */}
      <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
        Helpful Resources
      </h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        {quickLinks.map((link) => {
          const Icon = link.icon;
          return (
          <Card key={link.title} className="p-4">
            <a href={link.href} className="block">
              <div className="flex items-start gap-3">
                <div className="mt-1">
                  <Icon className="w-5 h-5 text-gray-400" />
                </div>
                <div>
                  <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-1">{link.title}</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{link.description}</p>
                </div>
              </div>
            </a>
          </Card>
          );
        })}
      </div>
    </div>
  );
}

function SparklesIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v8m0 8v-8m-4 4h8M4 12h16" />
    </svg>
  );
}