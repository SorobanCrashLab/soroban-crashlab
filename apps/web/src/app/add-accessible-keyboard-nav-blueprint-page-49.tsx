'use client';

import { useState } from 'react';

/**
 * Accessible Keyboard Navigation Blueprint Page
 * 
 * This page is designed to enforce keyboard-first navigation testing.
 * All controls should be accessible with Tab flow.
 * 
 * Issue: #49 - Add accessible keyboard nav blueprint page
 */

interface FormData {
  username: string;
  email: string;
  role: string;
  notifications: boolean;
  newsletter: boolean;
  theme: string;
}

const initialFormData: FormData = {
  username: '',
  email: '',
  role: 'developer',
  notifications: true,
  newsletter: false,
  theme: 'light',
};

export default function AccessibleKeyboardNavPage() {
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [focusedElement, setFocusedElement] = useState<string | null>(null);
  const [tabOrder, setTabOrder] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleInputChange = (field: keyof FormData, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleFocus = (elementId: string) => {
    setFocusedElement(elementId);
    setTabOrder((prev) => {
      if (prev.includes(elementId)) return prev;
      return [...prev, elementId];
    });
  };

  const handleBlur = () => {
    setFocusedElement(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setIsSuccess(false);

    try {
      // Simulate network request
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      console.log('Form submitted:', formData);
      setIsSuccess(true);
    } catch {
      setError('Form submission failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setFormData(initialFormData);
    setTabOrder([]);
    setFocusedElement(null);
    setIsSuccess(false);
    setError(null);
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-50 mb-2">
            Keyboard Navigation Blueprint
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            This page tests keyboard-first navigation. All controls should be accessible with Tab flow.
          </p>
        </div>

        {/* Status Indicators */}
        {(isSuccess || error) && (
          <div className={`mb-8 p-4 rounded-lg flex items-center gap-3 animate-in fade-in slide-in-from-top-4 ${
            isSuccess ? 'bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 text-green-800 dark:text-green-200' : 'bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200'
          }`}>
            <div className={`w-2 h-2 rounded-full ${isSuccess ? 'bg-green-500' : 'bg-red-500'}`}></div>
            <p className="text-sm font-medium">
              {isSuccess ? 'Form submitted successfully!' : error}
            </p>
          </div>
        )}

        {/* Tab Order Tracker */}
        <div className="mb-8 p-4 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
          <h2 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">
            Tab Order Tracker
          </h2>
          <p className="text-xs text-blue-800 dark:text-blue-200 mb-2">
            Focus elements in order to test the tab flow:
          </p>
          <div className="flex flex-wrap gap-2">
            {tabOrder.length === 0 ? (
              <span className="text-sm text-blue-600 dark:text-blue-400">No elements focused yet</span>
            ) : (
              tabOrder.map((el, index) => (
                <span
                  key={`${el}-${index}`}
                  className="inline-flex items-center px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 text-xs rounded"
                >
                  {index + 1}. {el}
                </span>
              ))
            )}
          </div>
          {focusedElement && (
            <p className="mt-2 text-xs text-blue-600 dark:text-blue-400">
              Currently focused: <strong>{focusedElement}</strong>
            </p>
          )}
        </div>

        {/* Form Section */}
        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Text Inputs */}
          <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-6">
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50 mb-4">
              Text Inputs
            </h2>
            <div className="space-y-4">
              <div>
                <label htmlFor="username" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Username <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  id="username"
                  name="username"
                  autoComplete="username"
                  value={formData.username}
                  onChange={(e) => handleInputChange('username', e.target.value)}
                  onFocus={() => handleFocus('username-input')}
                  onBlur={handleBlur}
                  required
                  className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Enter your username"
                />
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Email Address <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  autoComplete="email"
                  value={formData.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  onFocus={() => handleFocus('email-input')}
                  onBlur={handleBlur}
                  required
                  className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="you@example.com"
                />
              </div>
            </div>
          </section>

          {/* Select Dropdown */}
          <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-6">
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50 mb-4">
              Select Dropdowns
            </h2>
            <div className="space-y-4">
              <div>
                <label htmlFor="role" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Role
                </label>
                <select
                  id="role"
                  name="role"
                  value={formData.role}
                  onChange={(e) => handleInputChange('role', e.target.value)}
                  onFocus={() => handleFocus('role-select')}
                  onBlur={handleBlur}
                  className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="developer">Developer</option>
                  <option value="auditor">Security Auditor</option>
                  <option value="researcher">Researcher</option>
                  <option value="maintainer">Project Maintainer</option>
                </select>
              </div>

              <div>
                <label htmlFor="theme" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Theme
                </label>
                <select
                  id="theme"
                  name="theme"
                  value={formData.theme}
                  onChange={(e) => handleInputChange('theme', e.target.value)}
                  onFocus={() => handleFocus('theme-select')}
                  onBlur={handleBlur}
                  className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                  <option value="system">System</option>
                </select>
              </div>
            </div>
          </section>

          {/* Checkboxes */}
          <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-6">
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50 mb-4">
              Checkboxes
            </h2>
            <div className="space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  id="notifications"
                  name="notifications"
                  checked={formData.notifications}
                  onChange={(e) => handleInputChange('notifications', e.target.checked)}
                  onFocus={() => handleFocus('notifications-checkbox')}
                  onBlur={handleBlur}
                  className="w-4 h-4 text-blue-600 border-zinc-300 dark:border-zinc-600 rounded focus:ring-blue-500 focus:ring-2"
                />
                <span className="text-sm text-zinc-700 dark:text-zinc-300">
                  Enable push notifications
                </span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  id="newsletter"
                  name="newsletter"
                  checked={formData.newsletter}
                  onChange={(e) => handleInputChange('newsletter', e.target.checked)}
                  onFocus={() => handleFocus('newsletter-checkbox')}
                  onBlur={handleBlur}
                  className="w-4 h-4 text-blue-600 border-zinc-300 dark:border-zinc-600 rounded focus:ring-blue-500 focus:ring-2"
                />
                <span className="text-sm text-zinc-700 dark:text-zinc-300">
                  Subscribe to newsletter
                </span>
              </label>
            </div>
          </section>

          {/* Buttons */}
          <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-6">
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50 mb-4">
              Buttons
            </h2>
            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={isLoading}
                onFocus={() => handleFocus('submit-button')}
                onBlur={handleBlur}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-zinc-900 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    Submitting...
                  </>
                ) : (
                  'Submit Form'
                )}
              </button>

              <button
                type="button"
                onClick={handleReset}
                onFocus={() => handleFocus('reset-button')}
                onBlur={handleBlur}
                className="px-4 py-2 bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 text-zinc-900 dark:text-zinc-50 font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-zinc-500 focus:ring-offset-2 dark:focus:ring-offset-zinc-900"
              >
                Reset Form
              </button>

              <button
                type="button"
                onFocus={() => handleFocus('cancel-button')}
                onBlur={handleBlur}
                className="px-4 py-2 border border-zinc-300 dark:border-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-zinc-500 focus:ring-offset-2 dark:focus:ring-offset-zinc-900"
              >
                Cancel
              </button>

              <button
                type="button"
                onFocus={() => handleFocus('help-button')}
                onBlur={handleBlur}
                className="px-4 py-2 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-zinc-900"
              >
                Get Help
              </button>
            </div>
          </section>

          {/* Links */}
          <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-6">
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50 mb-4">
              Links
            </h2>
            <div className="flex flex-wrap gap-4">
              <a
                href="#"
                onFocus={() => handleFocus('docs-link')}
                onBlur={handleBlur}
                className="text-blue-600 dark:text-blue-400 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
              >
                Documentation
              </a>
              <a
                href="#"
                onFocus={() => handleFocus('guide-link')}
                onBlur={handleBlur}
                className="text-blue-600 dark:text-blue-400 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
              >
                Keyboard Guide
              </a>
              <a
                href="#"
                onFocus={() => handleFocus('accessibility-link')}
                onBlur={handleBlur}
                className="text-blue-600 dark:text-blue-400 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
              >
                Accessibility Statement
              </a>
            </div>
          </section>

          {/* Radio Buttons */}
          <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-6">
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50 mb-4">
              Radio Buttons
            </h2>
            <fieldset>
              <legend className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3">
                Priority Level
              </legend>
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="priority"
                    id="priority-low"
                    value="low"
                    defaultChecked
                    onFocus={() => handleFocus('priority-low')}
                    onBlur={handleBlur}
                    className="w-4 h-4 text-blue-600 border-zinc-300 dark:border-zinc-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-zinc-700 dark:text-zinc-300">Low</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="priority"
                    id="priority-medium"
                    value="medium"
                    onFocus={() => handleFocus('priority-medium')}
                    onBlur={handleBlur}
                    className="w-4 h-4 text-blue-600 border-zinc-300 dark:border-zinc-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-zinc-700 dark:text-zinc-300">Medium</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="priority"
                    id="priority-high"
                    value="high"
                    onFocus={() => handleFocus('priority-high')}
                    onBlur={handleBlur}
                    className="w-4 h-4 text-blue-600 border-zinc-300 dark:border-zinc-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-zinc-700 dark:text-zinc-300">High</span>
                </label>
              </div>
            </fieldset>
          </section>

          {/* Interactive Cards */}
          <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-6">
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50 mb-4">
              Interactive Cards
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <button
                type="button"
                onFocus={() => handleFocus('card-1')}
                onBlur={handleBlur}
                className="p-4 border border-zinc-200 dark:border-zinc-700 rounded-lg text-left hover:bg-zinc-50 dark:hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <h3 className="font-medium text-zinc-900 dark:text-zinc-50">Card One</h3>
                <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">Click to select</p>
              </button>
              <button
                type="button"
                onFocus={() => handleFocus('card-2')}
                onBlur={handleBlur}
                className="p-4 border border-zinc-200 dark:border-zinc-700 rounded-lg text-left hover:bg-zinc-50 dark:hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <h3 className="font-medium text-zinc-900 dark:text-zinc-50">Card Two</h3>
                <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">Click to select</p>
              </button>
              <button
                type="button"
                onFocus={() => handleFocus('card-3')}
                onBlur={handleBlur}
                className="p-4 border border-zinc-200 dark:border-zinc-700 rounded-lg text-left hover:bg-zinc-50 dark:hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <h3 className="font-medium text-zinc-900 dark:text-zinc-50">Card Three</h3>
                <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">Click to select</p>
              </button>
            </div>
          </section>
        </form>

        {/* Keyboard Shortcuts Reference */}
        <section className="mt-8 p-4 bg-zinc-100 dark:bg-zinc-800 rounded-lg">
          <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">
            Keyboard Shortcuts Reference
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs text-zinc-600 dark:text-zinc-400">
            <div>
              <kbd className="px-1.5 py-0.5 bg-white dark:bg-zinc-700 border border-zinc-300 dark:border-zinc-600 rounded">Tab</kbd>
              <span className="ml-2">Next focus</span>
            </div>
            <div>
              <kbd className="px-1.5 py-0.5 bg-white dark:bg-zinc-700 border border-zinc-300 dark:border-zinc-600 rounded">Shift+Tab</kbd>
              <span className="ml-2">Previous</span>
            </div>
            <div>
              <kbd className="px-1.5 py-0.5 bg-white dark:bg-zinc-700 border border-zinc-300 dark:border-zinc-600 rounded">Enter</kbd>
              <span className="ml-2">Activate</span>
            </div>
            <div>
              <kbd className="px-1.5 py-0.5 bg-white dark:bg-zinc-700 border border-zinc-300 dark:border-zinc-600 rounded">Space</kbd>
              <span className="ml-2">Toggle</span>
            </div>
            <div>
              <kbd className="px-1.5 py-0.5 bg-white dark:bg-zinc-700 border border-zinc-300 dark:border-zinc-600 rounded">↑</kbd>
              <kbd className="px-1.5 py-0.5 bg-white dark:bg-zinc-700 border border-zinc-300 dark:border-zinc-600 rounded">↓</kbd>
              <span className="ml-2">Navigate</span>
            </div>
            <div>
              <kbd className="px-1.5 py-0.5 bg-white dark:bg-zinc-700 border border-zinc-300 dark:border-zinc-600 rounded">Esc</kbd>
              <span className="ml-2">Cancel</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
