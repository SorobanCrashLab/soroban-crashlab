'use client';

import Image from 'next/image';
import { useState } from 'react';

interface LinkPreviewCardProps {
  url: string;
  title?: string;
  description?: string;
  faviconUrl?: string;
}

export default function LinkPreviewCard({
  url,
  title,
  description,
  faviconUrl
}: LinkPreviewCardProps) {
  const [faviconError, setFaviconError] = useState(false);

  const domain = new URL(url).hostname.replace('www.', '');

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="block p-4 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:shadow-md dark:hover:shadow-zinc-900/50 transition-all bg-white dark:bg-zinc-950"
    >
      <div className="flex items-start gap-3">
        {/* Favicon */}
        <div className="flex-shrink-0 w-6 h-6 rounded bg-zinc-100 dark:bg-zinc-900 flex items-center justify-center">
          {faviconUrl && !faviconError ? (
            <Image
              src={faviconUrl}
              alt=""
              width={16}
              height={16}
              unoptimized
              className="w-4 h-4"
              onError={() => setFaviconError(true)}
            />
          ) : (
            <svg
              className="w-4 h-4 text-zinc-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
              />
            </svg>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {title && (
            <h4 className="font-semibold text-sm text-zinc-900 dark:text-zinc-100 truncate">
              {title}
            </h4>
          )}
          {description && (
            <p className="text-xs text-zinc-600 dark:text-zinc-400 line-clamp-2 mt-1">
              {description}
            </p>
          )}
          <p className="text-xs text-zinc-500 dark:text-zinc-500 mt-2">
            {domain}
          </p>
        </div>
      </div>
    </a>
  );
}
