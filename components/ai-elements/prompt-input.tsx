'use client';

import * as React from 'react';
import { Send } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

export type PromptInputMessage = {
  text: string;
};

function PromptInput({
  className,
  children,
  onSubmit,
  ...props
}: Omit<React.FormHTMLAttributes<HTMLFormElement>, 'onSubmit'> & {
  onSubmit: (message: PromptInputMessage) => void;
}) {
  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const text = String(formData.get('message') ?? '');
    onSubmit({ text });
  };

  return (
    <form
      className={cn('flex items-end gap-2 rounded-xl border bg-background p-2 shadow-sm', className)}
      onSubmit={handleSubmit}
      {...props}
    >
      {children}
    </form>
  );
}

function PromptInputTextarea({
  className,
  onKeyDown,
  ...props
}: React.ComponentProps<typeof Textarea>) {
  return (
    <Textarea
      name='message'
      rows={1}
      className={cn(
        'max-h-36 min-h-11 flex-1 resize-none border-0 bg-transparent px-3 py-2 shadow-none focus-visible:ring-0',
        className
      )}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          event.currentTarget.form?.requestSubmit();
          return;
        }

        onKeyDown?.(event);
      }}
      {...props}
    />
  );
}

function PromptInputSubmit({
  className,
  children,
  ...props
}: React.ComponentProps<typeof Button>) {
  return (
    <Button
      type='submit'
      size='icon'
      className={cn('h-10 w-10 shrink-0 rounded-lg', className)}
      {...props}
    >
      {children ?? <Send className='h-4 w-4' />}
      <span className='sr-only'>Send message</span>
    </Button>
  );
}

export { PromptInput, PromptInputTextarea, PromptInputSubmit };
