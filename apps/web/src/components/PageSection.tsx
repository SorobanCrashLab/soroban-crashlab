import React, { ElementType, ReactNode } from 'react';

export interface PageSectionProps {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  headerClassName?: string;
  titleClassName?: string;
  descriptionClassName?: string;
  as?: ElementType;
  id?: string;
}

export function PageSection({
  title,
  description,
  actions,
  children,
  className = '',
  headerClassName = '',
  titleClassName = '',
  descriptionClassName = '',
  as: Component = 'section',
  id,
}: PageSectionProps) {
  const hasHeader = Boolean(title || description || actions);

  return (
    <Component id={id} className={`section ${className}`}>
      {hasHeader && (
        <div className={`flex-between mb-3 ${headerClassName}`}>
          <div>
            {title && (
              typeof title === 'string' ? (
                <h2 className={`heading-section ${titleClassName}`}>{title}</h2>
              ) : (
                title
              )
            )}
            {description && (
              typeof description === 'string' ? (
                <p className={`text-meta mt-1 ${descriptionClassName}`}>{description}</p>
              ) : (
                description
              )
            )}
          </div>
          {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
        </div>
      )}
      {children}
    </Component>
  );
}

export default PageSection;
