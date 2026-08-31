import React, { ReactNode } from 'react';
import Link from 'next/link';

export interface PageHeaderBackLink {
  href: string;
  label?: string;
}

export interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  backLink?: PageHeaderBackLink | ReactNode;
  breadcrumbs?: ReactNode;
  className?: string;
  titleClassName?: string;
  descriptionClassName?: string;
  children?: ReactNode;
}

export function PageHeader({
  title,
  description,
  actions,
  backLink,
  breadcrumbs,
  className = '',
  titleClassName = '',
  descriptionClassName = '',
  children,
}: PageHeaderProps) {
  const renderBackLink = () => {
    if (!backLink) return null;
    if (React.isValidElement(backLink)) {
      return backLink;
    }
    const { href, label = 'Back' } = backLink as PageHeaderBackLink;
    return (
      <Link
        href={href}
        className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-zinc-900 dark:text-zinc-100 mb-2 transition"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        <span>{label}</span>
      </Link>
    );
  };

  return (
    <header className={`page-header ${className}`}>
      {breadcrumbs && <div className="mb-3">{breadcrumbs}</div>}
      {backLink && <div className="mb-2">{renderBackLink()}</div>}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 sm:mb-6">
        <div>
          {typeof title === 'string' ? (
            <h1 className={`heading-page ${titleClassName}`}>{title}</h1>
          ) : (
            title
          )}
          {description && (
            typeof description === 'string' ? (
              <p className={`text-meta mt-0.5 sm:mt-1 ${descriptionClassName}`}>{description}</p>
            ) : (
              description
            )
          )}
        </div>
        {actions && <div className="flex items-center gap-2 sm:gap-3 flex-wrap">{actions}</div>}
      </div>
      {children}
    </header>
  );
}

export default PageHeader;
