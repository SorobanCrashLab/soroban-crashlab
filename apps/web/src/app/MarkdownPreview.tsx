'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownPreviewProps {
    content: string;
}

export default function MarkdownPreview({ content }: MarkdownPreviewProps) {
    return (
        <div className="prose dark:prose-invert max-w-none 
            bg-zinc-50/50 dark:bg-zinc-900/50 
            backdrop-blur-sm 
            border border-zinc-200 dark:border-zinc-800 
            rounded-xl p-6 md:p-8 
            shadow-inner 
            overflow-y-auto max-h-[60vh]
            scrollbar-thin scrollbar-thumb-zinc-300 dark:scrollbar-thumb-zinc-700">
            <ReactMarkdown 
                remarkPlugins={[remarkGfm]}
                components={{
                    h1: ({ children }) => (
                        <h1 className="text-2xl font-bold mb-4 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                            {children}
                        </h1>
                    ),
                    h2: ({ children }) => (
                        <h2 className="text-xl font-semibold mt-6 mb-3 border-b border-zinc-200 dark:border-zinc-800 pb-2">
                            {children}
                        </h2>
                    ),
                    h3: ({ children }) => (
                        <h3 className="text-lg font-medium mt-4 mb-2">
                            {children}
                        </h3>
                    ),
                    p: ({ children }) => (
                        <p className="text-zinc-700 dark:text-zinc-300 mb-4 leading-relaxed text-sm">
                            {children}
                        </p>
                    ),
                    ul: ({ children }) => (
                        <ul className="list-disc list-inside mb-4 space-y-1 text-sm">
                            {children}
                        </ul>
                    ),
                    li: ({ children }) => (
                        <li className="text-zinc-700 dark:text-zinc-300">
                            {children}
                        </li>
                    ),
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    code: ({ inline, className, children, ...props }: any) => {
                        return !inline ? (
                            <pre className="bg-zinc-950 dark:bg-black p-4 rounded-lg overflow-x-auto my-4 border border-zinc-800 shadow-lg">
                                <code className={`${className} text-xs text-blue-400 font-mono`} {...props}>
                                    {children}
                                </code>
                            </pre>
                        ) : (
                            <code className="bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-blue-600 dark:text-blue-400 font-mono text-xs" {...props}>
                                {children}
                            </code>
                        );
                    },
                    strong: ({ children }) => (
                        <strong className="font-semibold text-zinc-900 dark:text-zinc-100">
                            {children}
                        </strong>
                    ),
                    blockquote: ({ children }) => (
                        <blockquote className="border-l-4 border-blue-500 pl-4 italic text-zinc-600 dark:text-zinc-400 my-4">
                            {children}
                        </blockquote>
                    ),
                }}
            >
                {content}
            </ReactMarkdown>
        </div>
    );
}
