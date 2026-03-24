'use client';

import { useState, useEffect, useRef } from 'react';
import RunHistoryTable from './RunHistoryTable';
import Pagination from './Pagination';
import { FuzzingRun, RunStatus } from './types';

// Mock data for demonstration
const MOCK_RUNS: FuzzingRun[] = Array.from({ length: 25 }, (_, i) => ({
  id: `run-${1000 + i}`,
  status: (['completed', 'failed', 'running', 'cancelled'][i % 4]) as RunStatus,
  duration: 120000 + (Math.random() * 3600000), // 2m to 1h
  seedCount: Math.floor(10000 + Math.random() * 90000),
})).reverse();

const ITEMS_PER_PAGE = 10;

export default function Home() {
  const [selectedCardIndex, setSelectedCardIndex] = useState(0);
  const [showDetailView, setShowDetailView] = useState(false);
  const [showHelp, setShowHelp] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const cardsContainerRef = useRef<HTMLDivElement>(null);

  const totalPages = Math.ceil(MOCK_RUNS.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedRuns = MOCK_RUNS.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    // Focus the table container when page changes for accessibility
    cardsContainerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const cards = [
    {
      title: 'Intelligent Mutation',
      description: 'Automatically mutate transaction envelopes and inputs to explore complex state transitions specific to Soroban.',
      icon: 'M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z',
      color: 'blue',
      details: 'Our intelligent mutation engine uses advanced algorithms to systematically explore the state space of your Soroban contracts. It generates meaningful test cases by mutating transaction parameters, account states, and contract inputs in ways that are likely to expose edge cases and vulnerabilities.'
    },
    {
      title: 'Invariant Testing',
      description: 'Define robust invariants and property assertions. We run permutations to ensure they hold up under stress.',
      icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
      color: 'purple',
      details: 'Property-based testing for Soroban contracts. Define invariants that should always hold true, and our fuzzer will attempt to break them through millions of randomized test cases. When an invariant is violated, we provide a minimal reproducible example.'
    },
    {
      title: 'Actionable Reports',
      description: 'Get actionable, detailed execution traces when our fuzzer detects a crash, panic, or invariant breach.',
      icon: 'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
      color: 'green',
      details: 'When issues are found, CrashLab generates comprehensive reports including full execution traces, contract state at the time of failure, and suggested fixes. Reports are formatted for easy integration into your CI/CD pipeline.'
    }
  ];

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle if modal is open and it's not Escape
      if (showDetailView && e.key !== 'Escape') return;

      switch (e.key) {
        case 'ArrowDown':
        case 'ArrowRight':
          e.preventDefault();
          setSelectedCardIndex((prev) => (prev + 1) % cards.length);
          break;
        case 'ArrowUp':
        case 'ArrowLeft':
          e.preventDefault();
          setSelectedCardIndex((prev) => (prev - 1 + cards.length) % cards.length);
          break;
        case 'Enter':
          e.preventDefault();
          setShowDetailView(true);
          break;
        case 'Escape':
          e.preventDefault();
          if (showDetailView) {
            setShowDetailView(false);
          }
          break;
        case '?':
          e.preventDefault();
          setShowHelp((prev) => !prev);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showDetailView, cards.length]);

  const handleCardClick = (index: number) => {
    setSelectedCardIndex(index);
    setShowDetailView(true);
  };

  return (
    <div className="flex flex-col items-center justify-center py-20 px-8 max-w-5xl mx-auto w-full">
      <div className="text-center max-w-3xl mb-16">
        <h1 className="text-5xl font-bold tracking-tight mb-6 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
          Bulletproof Your Soroban Smart Contracts
        </h1>
        <p className="text-xl leading-8 text-zinc-600 dark:text-zinc-400">
          An advanced fuzzing and mutation testing framework designed to discover elusive edge cases in Stellar&apos;s Soroban ecosystem.
        </p>
      </div>

      {/* Help Panel */}
      {showHelp && (
        <div className="mb-8 w-full max-w-3xl border border-blue-200 dark:border-blue-800 rounded-lg p-4 bg-blue-50 dark:bg-blue-950/30">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">Keyboard Shortcuts</h3>
              <div className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
                <div><kbd className="px-2 py-1 bg-white dark:bg-zinc-800 rounded border border-blue-300 dark:border-blue-700 text-xs">↑</kbd> / <kbd className="px-2 py-1 bg-white dark:bg-zinc-800 rounded border border-blue-300 dark:border-blue-700 text-xs">↓</kbd> Navigate cards</div>
                <div><kbd className="px-2 py-1 bg-white dark:bg-zinc-800 rounded border border-blue-300 dark:border-blue-700 text-xs">Enter</kbd> Open details</div>
                <div><kbd className="px-2 py-1 bg-white dark:bg-zinc-800 rounded border border-blue-300 dark:border-blue-700 text-xs">Esc</kbd> Close details</div>
                <div><kbd className="px-2 py-1 bg-white dark:bg-zinc-800 rounded border border-blue-300 dark:border-blue-700 text-xs">?</kbd> Toggle this help</div>
              </div>
            </div>
            <button
              onClick={() => setShowHelp(false)}
              className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200"
              aria-label="Close help"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      <div
        ref={cardsContainerRef}
        className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full mb-20"
        role="list"
        aria-label="Features"
      >
        {cards.map((card, index) => {
          const isSelected = index === selectedCardIndex;
          const colorClasses = {
            blue: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
            purple: 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400',
            green: 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
          };

          return (
            <div
              key={index}
              role="listitem"
              tabIndex={0}
              onClick={() => handleCardClick(index)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleCardClick(index);
                }
              }}
              className={`border rounded-xl p-8 bg-white dark:bg-zinc-950 shadow-sm transition-all hover:shadow-md cursor-pointer ${isSelected
                ? 'border-blue-500 dark:border-blue-400 ring-2 ring-blue-500 dark:ring-blue-400 ring-offset-2 dark:ring-offset-zinc-900'
                : 'border-black/[.08] dark:border-white/[.145]'
                }`}
            >
              <div className={`h-12 w-12 rounded-lg flex items-center justify-center mb-6 ${colorClasses[card.color as keyof typeof colorClasses]}`}>
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={card.icon} />
                </svg>
              </div>
              <h3 className="text-xl font-semibold mb-3">{card.title}</h3>
              <p className="text-zinc-600 dark:text-zinc-400">
                {card.description}
              </p>
            </div>
          );
        })}
      </div>

      {/* Run History Section */}
      <div className="w-full mb-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">Recent Fuzzing Runs</h2>
          <div className="px-3 py-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg text-xs font-medium text-zinc-500">
            {MOCK_RUNS.length} Total Runs
          </div>
        </div>
        <RunHistoryTable runs={paginatedRuns} />
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={handlePageChange}
        />
      </div>

      {/* Detail View Modal */}
      {showDetailView && (
        <div
          className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50 p-4"
          onClick={() => setShowDetailView(false)}
        >
          <div
            className="bg-white dark:bg-zinc-900 rounded-xl max-w-2xl w-full p-8 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="detail-title"
          >
            <div className="flex items-start justify-between mb-6">
              <div className="flex items-center gap-4">
                <div className={`h-12 w-12 rounded-lg flex items-center justify-center ${cards[selectedCardIndex].color === 'blue' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' :
                  cards[selectedCardIndex].color === 'purple' ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400' :
                    'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                  }`}>
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={cards[selectedCardIndex].icon} />
                  </svg>
                </div>
                <h2 id="detail-title" className="text-2xl font-bold">{cards[selectedCardIndex].title}</h2>
              </div>
              <button
                onClick={() => setShowDetailView(false)}
                className="text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                aria-label="Close detail view"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <p className="text-zinc-600 dark:text-zinc-300 leading-relaxed mb-4">
              {cards[selectedCardIndex].description}
            </p>
            <div className="border-t border-zinc-200 dark:border-zinc-700 pt-4 mt-4">
              <h3 className="font-semibold mb-2">More Details</h3>
              <p className="text-zinc-600 dark:text-zinc-400">
                {cards[selectedCardIndex].details}
              </p>
            </div>
            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setShowDetailView(false)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
              >
                Close (Esc)
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mt-16 text-center border-t border-black/[.08] dark:border-white/[.145] pt-12 w-full">
        <h2 className="text-2xl font-bold mb-4">Stellar Wave 3 is Open!</h2>
        <p className="text-zinc-600 dark:text-zinc-400 mb-8 max-w-2xl mx-auto">
          We are actively looking for contributors. Check out our open issues to build the future of Soroban dev tooling with us.
        </p>
        <div className="flex justify-center gap-4">
          <a
            href="https://github.com/SorobanCrashLab/soroban-crashlab/issues?q=is%3Aissue+is%3Aopen+label%3Awave3"
            className="flex items-center justify-center h-12 px-6 rounded-full bg-blue-600 text-white font-medium hover:bg-blue-700 transition"
            target="_blank"
            rel="noopener noreferrer"
          >
            Browse Wave 3 Issues
          </a>
          <a
            href="https://github.com/SorobanCrashLab/soroban-crashlab"
            className="flex items-center justify-center h-12 px-6 rounded-full border border-black/[.15] dark:border-white/[.15] font-medium hover:bg-black/[.04] dark:hover:bg-white/[.04] transition dark:hover:text-black dark:text-white"
            target="_blank"
            rel="noopener noreferrer"
          >
            Star the Repo
          </a>
        </div>
      </div>
    </div>
  );
}
