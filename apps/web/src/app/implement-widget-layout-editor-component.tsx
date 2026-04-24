'use client';

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useMaintainerMode } from './useMaintainerMode';

// Widget types and interfaces
interface Widget {
  id: string;
  type: 'chart' | 'metric' | 'table' | 'alert' | 'status' | 'custom';
  title: string;
  size: 'small' | 'medium' | 'large' | 'xlarge';
  position: { x: number; y: number };
  config: Record<string, unknown>;
  visible: boolean;
}

interface LayoutGrid {
  cols: number;
  rows: number;
  cellWidth: number;
  cellHeight: number;
}

// Sample widget templates
const WIDGET_TEMPLATES: Omit<Widget, 'id' | 'position'>[] = [
  {
    type: 'chart',
    title: 'Performance Chart',
    size: 'large',
    config: { chartType: 'line', dataSource: 'performance' },
    visible: true,
  },
  {
    type: 'metric',
    title: 'Success Rate',
    size: 'small',
    config: { metric: 'success_rate', format: 'percentage' },
    visible: true,
  },
  {
    type: 'table',
    title: 'Recent Runs',
    size: 'medium',
    config: { columns: ['id', 'status', 'duration'], limit: 10 },
    visible: true,
  },
  {
    type: 'alert',
    title: 'Active Alerts',
    size: 'medium',
    config: { severity: 'all', autoRefresh: true },
    visible: true,
  },
  {
    type: 'status',
    title: 'System Status',
    size: 'small',
    config: { components: ['api', 'database', 'queue'] },
    visible: true,
  },
];

// Widget size configurations
const WIDGET_SIZES = {
  small: { width: 1, height: 1 },
  medium: { width: 2, height: 1 },
  large: { width: 2, height: 2 },
  xlarge: { width: 3, height: 2 },
};

export default function WidgetLayoutEditor() {
  const { isMaintainer } = useMaintainerMode();
  const [isEditing, setIsEditing] = useState(false);
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [selectedWidget, setSelectedWidget] = useState<string | null>(null);
  const [draggedWidget, setDraggedWidget] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [showWidgetPalette, setShowWidgetPalette] = useState(false);
  const [layoutMode, setLayoutMode] = useState<'grid' | 'freeform'>('grid');
  const gridRef = useRef<HTMLDivElement>(null);

  // Load saved layout on component mount
  useEffect(() => {
    const initializeDefaultLayout = () => {
      const defaultWidgets: Widget[] = WIDGET_TEMPLATES.slice(0, 4).map((template, index) => ({
        ...template,
        id: `widget-${Date.now()}-${index}`,
        position: {
          x: (index % 3) * 2,
          y: Math.floor(index / 3) * 2,
        },
      }));
      return defaultWidgets;
    };

    // Use startTransition to mark state updates as non-urgent
    const loadLayout = () => {
      const savedLayout = localStorage.getItem('dashboard-widget-layout');
      if (savedLayout) {
        try {
          const parsedLayout = JSON.parse(savedLayout);
          setWidgets(parsedLayout);
        } catch (error) {
          console.error('Failed to load saved layout:', error);
          setWidgets(initializeDefaultLayout());
        }
      } else {
        setWidgets(initializeDefaultLayout());
      }
    };

    // Schedule on next tick to avoid synchronous setState in effect
    const timeoutId = setTimeout(loadLayout, 0);
    return () => clearTimeout(timeoutId);
  }, []);

  const gridConfig: LayoutGrid = useMemo(() => ({
    cols: 6,
    rows: 8,
    cellWidth: 200,
    cellHeight: 150,
  }), []);

  const saveLayout = useCallback(() => {
    localStorage.setItem('dashboard-widget-layout', JSON.stringify(widgets));
  }, [widgets]);

  const findEmptyPosition = useCallback((): { x: number; y: number } => {
    const occupied = new Set<string>();
    widgets.forEach(widget => {
      const size = WIDGET_SIZES[widget.size];
      for (let x = widget.position.x; x < widget.position.x + size.width; x++) {
        for (let y = widget.position.y; y < widget.position.y + size.height; y++) {
          occupied.add(`${x},${y}`);
        }
      }
    });

    for (let y = 0; y < gridConfig.rows; y++) {
      for (let x = 0; x < gridConfig.cols; x++) {
        if (!occupied.has(`${x},${y}`)) {
          return { x, y };
        }
      }
    }
    return { x: 0, y: 0 };
  }, [widgets, gridConfig]);

  const addWidget = useCallback((template: Omit<Widget, 'id' | 'position'>) => {
    const newWidget: Widget = {
      ...template,
      id: `widget-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      position: findEmptyPosition(),
    };
    setWidgets(prev => [...prev, newWidget]);
  }, [findEmptyPosition]);

  const removeWidget = (widgetId: string) => {
    setWidgets(prev => prev.filter(w => w.id !== widgetId));
    if (selectedWidget === widgetId) {
      setSelectedWidget(null);
    }
  };

  const updateWidget = (widgetId: string, updates: Partial<Widget>) => {
    setWidgets(prev => prev.map(w => w.id === widgetId ? { ...w, ...updates } : w));
  };

  const handleMouseDown = (e: React.MouseEvent, widgetId: string) => {
    if (!isEditing) return;
    
    e.preventDefault();
    const widget = widgets.find(w => w.id === widgetId);
    if (!widget) return;

    const rect = e.currentTarget.getBoundingClientRect();
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
    setDraggedWidget(widgetId);
    setSelectedWidget(widgetId);
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!draggedWidget || !gridRef.current) return;

    const gridRect = gridRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(
      Math.floor((e.clientX - gridRect.left - dragOffset.x) / gridConfig.cellWidth),
      gridConfig.cols - 1
    ));
    const y = Math.max(0, Math.min(
      Math.floor((e.clientY - gridRect.top - dragOffset.y) / gridConfig.cellHeight),
      gridConfig.rows - 1
    ));

    updateWidget(draggedWidget, { position: { x, y } });
  }, [draggedWidget, dragOffset, gridConfig]);

  const handleMouseUp = useCallback(() => {
    setDraggedWidget(null);
  }, []);

  useEffect(() => {
    if (draggedWidget) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [draggedWidget, handleMouseMove, handleMouseUp]);

  const renderWidget = (widget: Widget) => {
    const size = WIDGET_SIZES[widget.size];
    const isSelected = selectedWidget === widget.id;
    const isDragging = draggedWidget === widget.id;

    return (
      <div
        key={widget.id}
        className={`
          absolute border-2 rounded-lg bg-white shadow-sm transition-all duration-200
          ${isSelected ? 'border-blue-500 shadow-lg' : 'border-gray-200'}
          ${isDragging ? 'opacity-75 z-50' : 'z-10'}
          ${isEditing ? 'cursor-move hover:shadow-md' : 'cursor-default'}
        `}
        style={{
          left: widget.position.x * gridConfig.cellWidth,
          top: widget.position.y * gridConfig.cellHeight,
          width: size.width * gridConfig.cellWidth - 8,
          height: size.height * gridConfig.cellHeight - 8,
        }}
        onMouseDown={(e) => handleMouseDown(e, widget.id)}
        onClick={() => !isEditing && setSelectedWidget(widget.id)}
      >
        {/* Widget Header */}
        <div className="flex items-center justify-between p-3 border-b border-gray-100">
          <div className="flex items-center space-x-2">
            <div className={`w-3 h-3 rounded-full ${getWidgetTypeColor(widget.type)}`} />
            <h3 className="font-medium text-sm text-gray-900">{widget.title}</h3>
          </div>
          {isEditing && (
            <div className="flex items-center space-x-1">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedWidget(widget.id);
                }}
                className="p-1 text-gray-400 hover:text-gray-600 rounded"
                title="Configure"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeWidget(widget.id);
                }}
                className="p-1 text-gray-400 hover:text-red-600 rounded"
                title="Remove"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}
        </div>

        {/* Widget Content */}
        <div className="p-3 h-full">
          {renderWidgetContent(widget)}
        </div>

        {/* Resize Handle */}
        {isEditing && isSelected && (
          <div className="absolute bottom-0 right-0 w-4 h-4 bg-blue-500 cursor-se-resize" />
        )}
      </div>
    );
  };

  const renderWidgetContent = (widget: Widget) => {
    switch (widget.type) {
      case 'chart':
        return (
          <div className="flex items-center justify-center h-full bg-gray-50 rounded">
            <div className="text-center">
              <svg className="w-8 h-8 mx-auto text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              <p className="text-xs text-gray-500">Chart Widget</p>
            </div>
          </div>
        );
      case 'metric':
        return (
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">94.2%</div>
            <div className="text-xs text-gray-500 mt-1">Success Rate</div>
          </div>
        );
      case 'table':
        return (
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-gray-500 border-b pb-1">
              <span>ID</span>
              <span>Status</span>
              <span>Duration</span>
            </div>
            {[1, 2, 3].map(i => (
              <div key={i} className="flex justify-between text-xs">
                <span>#{i}234</span>
                <span className="text-green-600">✓</span>
                <span>2.3s</span>
              </div>
            ))}
          </div>
        );
      case 'alert':
        return (
          <div className="space-y-2">
            <div className="flex items-center space-x-2 text-xs">
              <div className="w-2 h-2 bg-red-500 rounded-full"></div>
              <span>High CPU usage detected</span>
            </div>
            <div className="flex items-center space-x-2 text-xs">
              <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
              <span>Memory usage above 80%</span>
            </div>
          </div>
        );
      case 'status':
        return (
          <div className="space-y-2">
            {['API', 'Database', 'Queue'].map(service => (
              <div key={service} className="flex items-center justify-between text-xs">
                <span>{service}</span>
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              </div>
            ))}
          </div>
        );
      default:
        return (
          <div className="flex items-center justify-center h-full text-gray-400 text-xs">
            Custom Widget
          </div>
        );
    }
  };

  const getWidgetTypeColor = (type: Widget['type']) => {
    const colors = {
      chart: 'bg-blue-500',
      metric: 'bg-green-500',
      table: 'bg-purple-500',
      alert: 'bg-red-500',
      status: 'bg-yellow-500',
      custom: 'bg-gray-500',
    };
    return colors[type];
  };

  if (!isMaintainer) {
    return (
      <div className="p-6 bg-gray-50 rounded-lg">
        <div className="text-center">
          <svg className="w-12 h-12 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <h3 className="text-lg font-medium text-gray-900 mb-2">Widget Layout Editor</h3>
          <p className="text-gray-600">Enable maintainer mode to access the widget layout editor.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Widget Layout Editor</h2>
          <p className="text-gray-600">Customize your dashboard layout with drag-and-drop widgets</p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setLayoutMode(layoutMode === 'grid' ? 'freeform' : 'grid')}
            className="px-3 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
          >
            {layoutMode === 'grid' ? 'Grid Mode' : 'Freeform Mode'}
          </button>
          <button
            onClick={() => setShowWidgetPalette(!showWidgetPalette)}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Add Widget
          </button>
          <button
            onClick={() => {
              setIsEditing(!isEditing);
              if (isEditing) {
                saveLayout();
              }
            }}
            className={`px-4 py-2 rounded-md ${
              isEditing 
                ? 'bg-green-600 text-white hover:bg-green-700' 
                : 'bg-gray-600 text-white hover:bg-gray-700'
            }`}
          >
            {isEditing ? 'Save Layout' : 'Edit Layout'}
          </button>
        </div>
      </div>

      {/* Widget Palette */}
      {showWidgetPalette && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="font-medium text-gray-900 mb-3">Widget Templates</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {WIDGET_TEMPLATES.map((template, index) => (
              <button
                key={index}
                onClick={() => {
                  addWidget(template);
                  setShowWidgetPalette(false);
                }}
                className="p-3 border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 text-left"
              >
                <div className={`w-3 h-3 rounded-full ${getWidgetTypeColor(template.type)} mb-2`} />
                <div className="text-sm font-medium text-gray-900">{template.title}</div>
                <div className="text-xs text-gray-500 capitalize">{template.type} • {template.size}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Layout Grid */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div
          ref={gridRef}
          className="relative bg-gray-50"
          style={{
            width: gridConfig.cols * gridConfig.cellWidth,
            height: gridConfig.rows * gridConfig.cellHeight,
            backgroundImage: layoutMode === 'grid' 
              ? `linear-gradient(to right, #e5e7eb 1px, transparent 1px), linear-gradient(to bottom, #e5e7eb 1px, transparent 1px)`
              : 'none',
            backgroundSize: layoutMode === 'grid' 
              ? `${gridConfig.cellWidth}px ${gridConfig.cellHeight}px`
              : 'auto',
          }}
        >
          {widgets.filter(w => w.visible).map(renderWidget)}
          
          {/* Empty State */}
          {widgets.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <svg className="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
                <h3 className="text-lg font-medium text-gray-900 mb-2">No Widgets Added</h3>
                <p className="text-gray-600 mb-4">Start building your dashboard by adding widgets</p>
                <button
                  onClick={() => setShowWidgetPalette(true)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  Add Your First Widget
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Widget Properties Panel */}
      {selectedWidget && isEditing && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="font-medium text-gray-900 mb-3">Widget Properties</h3>
          {(() => {
            const widget = widgets.find(w => w.id === selectedWidget);
            if (!widget) return null;
            
            return (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                  <input
                    type="text"
                    value={widget.title}
                    onChange={(e) => updateWidget(widget.id, { title: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Size</label>
                  <select
                    value={widget.size}
                    onChange={(e) => updateWidget(widget.id, { size: e.target.value as Widget['size'] })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="small">Small (1x1)</option>
                    <option value="medium">Medium (2x1)</option>
                    <option value="large">Large (2x2)</option>
                    <option value="xlarge">X-Large (3x2)</option>
                  </select>
                </div>
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="visible"
                    checked={widget.visible}
                    onChange={(e) => updateWidget(widget.id, { visible: e.target.checked })}
                    className="mr-2"
                  />
                  <label htmlFor="visible" className="text-sm font-medium text-gray-700">Visible</label>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Layout Actions */}
      <div className="flex items-center justify-between bg-gray-50 p-4 rounded-lg">
        <div className="text-sm text-gray-600">
          {widgets.length} widget{widgets.length !== 1 ? 's' : ''} • 
          {widgets.filter(w => w.visible).length} visible
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => {
              if (confirm('Reset to default layout? This will remove all custom widgets.')) {
                const defaultWidgets: Widget[] = WIDGET_TEMPLATES.slice(0, 4).map((template, index) => ({
                  ...template,
                  id: `widget-${Date.now()}-${index}`,
                  position: {
                    x: (index % 3) * 2,
                    y: Math.floor(index / 3) * 2,
                  },
                }));
                setWidgets(defaultWidgets);
              }
            }}
            className="px-3 py-2 text-sm text-gray-600 hover:text-gray-800"
          >
            Reset to Default
          </button>
          <button
            onClick={() => {
              const layout = JSON.stringify(widgets, null, 2);
              navigator.clipboard.writeText(layout);
              alert('Layout copied to clipboard!');
            }}
            className="px-3 py-2 text-sm text-blue-600 hover:text-blue-800"
          >
            Export Layout
          </button>
        </div>
      </div>
    </div>
  );
}