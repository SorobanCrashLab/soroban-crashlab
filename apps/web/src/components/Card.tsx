import type { HTMLAttributes, ReactNode } from 'react';

export interface CardProps extends HTMLAttributes<HTMLElement> {
  interactive?: boolean;
  as?: 'article' | 'section' | 'div';
}

export function Card({
  as: Component = 'div',
  interactive = false,
  className = '',
  ...props
}: CardProps) {
  return (
    <Component
      className={`ds-card ${interactive ? 'ds-card-interactive' : ''} ${className}`}
      {...props}
    />
  );
}

export function CardHeader({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`ds-card-header ${className}`} {...props} />;
}

export function CardTitle({ className = '', ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={`ds-card-title ${className}`} {...props} />;
}

export interface CardDescriptionProps extends HTMLAttributes<HTMLParagraphElement> {
  children?: ReactNode;
}

export function CardDescription({ className = '', ...props }: CardDescriptionProps) {
  return <p className={`ds-card-description ${className}`} {...props} />;
}

export function CardContent({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`ds-card-content ${className}`} {...props} />;
}

export function CardFooter({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`ds-card-footer ${className}`} {...props} />;
}
