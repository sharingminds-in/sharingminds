'use client';

import * as React from 'react';

import { cn } from '@/lib/utils';

function Message({
  from,
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  from: 'user' | 'assistant';
}) {
  return (
    <div
      className={cn(
        'flex w-full gap-3',
        from === 'user' ? 'justify-end' : 'justify-start',
        className
      )}
      data-message-from={from}
      {...props}
    >
      {children}
    </div>
  );
}

function MessageContent({
  from = 'assistant',
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  from?: 'user' | 'assistant';
}) {
  return (
    <div
      className={cn(
        'max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm',
        from === 'user'
          ? 'rounded-br-md bg-primary text-primary-foreground'
          : 'rounded-bl-md border bg-background text-foreground',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

function MessageResponse({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn('whitespace-pre-wrap break-words', className)} {...props}>
      {children}
    </p>
  );
}

export { Message, MessageContent, MessageResponse };
