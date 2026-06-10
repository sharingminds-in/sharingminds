'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Brain, Clock, Lock, RefreshCw, Trash2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  aiUserMemoryResponseSchema,
  type AiUserMemoryItem,
} from '@/lib/infinity-ai/schemas';

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function formatConfidence(value: number) {
  return `${Math.round(value * 100)}% confidence`;
}

export function AiMemorySettings() {
  const [memories, setMemories] = useState<AiUserMemoryItem[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'unauthorized' | 'error'>(
    'loading'
  );
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadMemory() {
      setStatus('loading');

      try {
        const response = await fetch('/api/infinity-ai/memory', {
          method: 'GET',
          cache: 'no-store',
        });

        if (response.status === 401) {
          if (!cancelled) {
            setStatus('unauthorized');
            setMemories([]);
          }
          return;
        }

        if (!response.ok) {
          throw new Error('Failed to load AI memory');
        }

        const parsed = aiUserMemoryResponseSchema.parse(await response.json());

        if (!cancelled) {
          setMemories(parsed.memories);
          setStatus('ready');
        }
      } catch {
        if (!cancelled) {
          setStatus('error');
          setMemories([]);
        }
      }
    }

    void loadMemory();

    return () => {
      cancelled = true;
    };
  }, []);

  const groupedMemories = useMemo(() => {
    return memories.reduce<Record<string, AiUserMemoryItem[]>>((groups, memory) => {
      const key = memory.memoryType;
      groups[key] = groups[key] ?? [];
      groups[key].push(memory);
      return groups;
    }, {});
  }, [memories]);

  async function handleDelete(memoryId: string) {
    setDeletingId(memoryId);
    setDeleteError(null);

    try {
      const response = await fetch(`/api/infinity-ai/memory/${memoryId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to clear memory');
      }

      setMemories((current) => current.filter((memory) => memory.id !== memoryId));
    } catch {
      setDeleteError('That memory could not be cleared. Please try again.');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className='mx-auto w-full max-w-5xl space-y-6'>
      <div>
        <div className='flex items-center gap-2 text-sm font-medium text-primary'>
          <Brain className='h-4 w-4' />
          Settings
        </div>
        <h1 className='mt-2 text-2xl font-semibold text-foreground'>
          Memories
        </h1>
        <p className='mt-2 max-w-2xl text-sm text-muted-foreground'>
          Review and clear the cross-chat memories Infinity AI has saved for your account.
        </p>
      </div>

      {deleteError ? (
        <Card className='border-destructive/40 bg-destructive/5 hover:translate-y-0'>
          <CardContent className='p-4 text-sm text-destructive'>
            {deleteError}
          </CardContent>
        </Card>
      ) : null}

      {status === 'loading' ? (
        <Card>
          <CardContent className='flex min-h-44 items-center justify-center gap-3 text-sm text-muted-foreground'>
            <RefreshCw className='h-4 w-4 animate-spin' />
            Loading saved memory...
          </CardContent>
        </Card>
      ) : null}

      {status === 'unauthorized' ? (
        <Card>
          <CardHeader>
            <div className='flex items-center gap-2'>
              <Lock className='h-4 w-4 text-muted-foreground' />
              <CardTitle className='text-lg'>Sign in required</CardTitle>
            </div>
            <CardDescription>
              AI memory is only available for authenticated accounts.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href='/auth?callbackUrl=/dashboard?section=settings'>
                Sign in
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {status === 'error' ? (
        <Card>
          <CardHeader>
            <CardTitle className='text-lg'>Memory could not be loaded</CardTitle>
            <CardDescription>
              Try again later or refresh the dashboard.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {status === 'ready' && memories.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className='text-lg'>No saved memory yet</CardTitle>
            <CardDescription>
              Memory appears here after authenticated Infinity AI conversations.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {status === 'ready' && memories.length > 0 ? (
        <div className='space-y-5'>
          {Object.entries(groupedMemories).map(([memoryType, items]) => (
            <section key={memoryType} className='space-y-3'>
              <div className='flex items-center justify-between gap-3'>
                <h2 className='text-sm font-semibold uppercase tracking-wide text-muted-foreground'>
                  {memoryType.replace(/_/g, ' ')}
                </h2>
                <Badge variant='outline'>{items.length}</Badge>
              </div>

              <div className='grid gap-3'>
                {items.map((memory) => (
                  <Card key={memory.id} className='hover:translate-y-0'>
                    <CardHeader className='space-y-3'>
                      <div className='flex flex-wrap items-center gap-2'>
                        <Badge variant='secondary'>
                          {formatConfidence(memory.confidence)}
                        </Badge>
                        <span className='inline-flex items-center gap-1 text-xs text-muted-foreground'>
                          <Clock className='h-3.5 w-3.5' />
                          Updated {formatDate(memory.updatedAt)}
                        </span>
                      </div>
                      <CardTitle className='text-base leading-6'>
                        {memory.content}
                      </CardTitle>
                      {memory.provenanceSummary ? (
                        <CardDescription>{memory.provenanceSummary}</CardDescription>
                      ) : null}
                    </CardHeader>
                    <CardContent className='pt-0'>
                      <Button
                        type='button'
                        variant='outline'
                        size='sm'
                        className='text-destructive hover:text-destructive'
                        disabled={deletingId === memory.id}
                        onClick={() => void handleDelete(memory.id)}
                      >
                        {deletingId === memory.id ? (
                          <RefreshCw className='h-4 w-4 animate-spin' />
                        ) : (
                          <Trash2 className='h-4 w-4' />
                        )}
                        Clear memory
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : null}
    </div>
  );
}
