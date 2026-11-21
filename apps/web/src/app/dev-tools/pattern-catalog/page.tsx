'use client';

import { useState, useMemo } from 'react';
import { Card, Input, Badge, Button } from '@/components';
import { PageHeader } from '@/components/PageHeader';
import { codePatterns, categories, type CategoryId } from '@/lib/pattern-catalog';
import { ChartBarIcon, CogIcon, LightBulbIcon, Square2StackIcon, ShieldCheckIcon, LinkIcon, CodeBracketIcon, DatabaseIcon, GlobeIcon, UserGroupIcon } from '@heroicons/react/24/outline';

const iconMap: Record<string, React.ElementType> = {
  UI: ChartBarIcon,
  Backend: CogIcon,
  Logic: LightBulbIcon,
  Testing: Square2StackIcon,
  Security: ShieldCheckIcon,
  Integration: LinkIcon,
};

export default function PatternCatalogPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  const filteredPatterns = useMemo(() => {
    return codePatterns.filter((pattern) => {
      const matchesSearch = pattern.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        pattern.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        pattern.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()));
      
      const matchesCategory = selectedCategory === 'All' || pattern.category === selectedCategory;
      
      return matchesSearch && matchesCategory;
    });
  }, [searchTerm, selectedCategory]);

  return (
    <div className="container-full page-padding">
      <PageHeader
        title="Developer Pattern Catalog"
        description="Searchable catalog of existing code patterns, utilities, and conventions"
        actions={
          <>
            <Button
              onClick={() => window.open('docs/contributors/generator-guide.md', '_blank')}
              className="btn-outline"
              size="sm"
            >
              Generator Guide
            </Button>
            <Button
              onClick={() => window.open('docs/contributors/cli-guide.md', '_blank')}
              className="btn-outline"
              size="sm"
            >
              CLI Guide
            </Button>
          </>
        }
      />

      {/* Search and Filters */}
      <div className="mb-6">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <Input
              type="search"
              placeholder="Search patterns..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full"
              prefix={
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.355-4.355m0 0A7.5 7.5 0 1116.65 16.65" />
                </svg>
              }
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {(['All', ...categories.map(c => c.name)] as string[]).map((cat) => (
              <Button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`${selectedCategory === cat ? 'btn-primary' : 'btn-outline'}`}
                size="sm"
              >
                {cat}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="mb-4 text-sm text-gray-600 dark:text-gray-400">
            Displaying {filteredPatterns.length} of {codePatterns.length} patterns
      </div>

      {/* Pattern Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredPatterns.map((pattern) => {
          const Icon = iconMap[pattern.category as keyof typeof iconMap] || CodeBracketIcon;
          return (
          <Card key={pattern.id} className="p-4 flex flex-col h-full">
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">
                  {pattern.name}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                  {pattern.description}
                </p>
              </div>
              <div className="ml-3">
                <Icon className="w-5 h-5 text-gray-400" />
              </div>
            </div>
            <div className="flex flex-wrap gap-1 mb-4">
              {pattern.tags.map((tag) => (
                <Badge key={tag} variant="outline" size="sm" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
            <div className="mt-auto pt-3 border-t border-gray-200 dark:border-gray-700">
              <code className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded break-all">
                {pattern.filePath}
              </code>
            </div>
          </Card>
          );
        })}
      </div>

      {filteredPatterns.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500 dark:text-gray-400">
            No patterns match your search. Try adjusting your filters.
          </p>
          <Button
            onClick={() => {
              setSearchTerm('');
              setSelectedCategory('All');
            }}
            className="btn-outline mt-4"
            size="sm"
          >
            Clear filters
          </Button>
        </div>
      )}
    </div>
  );
}