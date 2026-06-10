'use client';

import * as React from 'react';
import { ArrowDown } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const ConversationContext = React.createContext<{
  contentRef: React.RefObject<HTMLDivElement | null>;
} | null>(null);

function Conversation({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  const contentRef = React.useRef<HTMLDivElement>(null);

  return (
    <ConversationContext.Provider value={{ contentRef }}>
      <div className={cn('relative flex min-h-0 flex-1 flex-col', className)} {...props}>
        {children}
      </div>
    </ConversationContext.Provider>
  );
}

function ConversationContent({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  const context = React.useContext(ConversationContext);

  React.useEffect(() => {
    const element = context?.contentRef.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
  }, [children, context?.contentRef]);

  return (
    <div
      ref={context?.contentRef}
      className={cn('min-h-0 flex-1 overflow-y-auto px-4 py-5', className)}
      {...props}
    >
      {children}
    </div>
  );
}

function ConversationEmptyState({
  className,
  icon,
  title,
  description,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  icon?: React.ReactNode;
  title?: string;
  description?: string;
}) {
  return (
    <div
      className={cn(
        'flex min-h-[260px] flex-col items-center justify-center gap-2 text-center text-muted-foreground',
        className
      )}
      {...props}
    >
      {icon ? <div className='mb-1 text-muted-foreground/70'>{icon}</div> : null}
      {title ? <h3 className='text-base font-semibold text-foreground'>{title}</h3> : null}
      {description ? <p className='max-w-sm text-sm'>{description}</p> : null}
      {children}
    </div>
  );
}

function ConversationScrollButton({
  className,
  ...props
}: React.ComponentProps<typeof Button>) {
  const context = React.useContext(ConversationContext);

  return (
    <Button
      type='button'
      size='icon'
      variant='secondary'
      className={cn('absolute bottom-4 right-4 h-9 w-9 rounded-full shadow-lg', className)}
      onClick={() => {
        const element = context?.contentRef.current;
        if (!element) return;
        element.scrollTo({ top: element.scrollHeight, behavior: 'smooth' });
      }}
      {...props}
    >
      <ArrowDown className='h-4 w-4' />
      <span className='sr-only'>Scroll to latest message</span>
    </Button>
  );
}

export {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
};
