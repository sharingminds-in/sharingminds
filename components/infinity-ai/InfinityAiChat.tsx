'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bot,
  Clock,
  ExternalLink,
  Loader2,
  MessageSquare,
  Plus,
  Sparkles,
  UserRound,
} from 'lucide-react';

import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation';
import {
  Message,
  MessageContent,
  MessageResponse,
} from '@/components/ai-elements/message';
import {
  PromptInput,
  PromptInputSubmit,
  PromptInputTextarea,
  type PromptInputMessage,
} from '@/components/ai-elements/prompt-input';
import { Suggestion, Suggestions } from '@/components/ai-elements/suggestion';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/contexts/auth-context';
import type {
  AiConversationBootstrap,
  AiConversationSummary,
  AiConversationTurn,
  AiExpertCard,
  AiResourceCard,
  AiResponseBlock,
  AiServiceMessageResponse,
} from '@/lib/infinity-ai/schemas';
import { cn } from '@/lib/utils';

const ANONYMOUS_SESSION_STORAGE_KEY = 'ai_chatbot_session_id';

const STARTER_SUGGESTIONS = [
  'Help me find a mentor',
  'I want to switch careers',
  'Prepare me for interviews',
  'Build a learning roadmap',
];

type InfinityAiChatVariant = 'hero' | 'dashboard';

interface InfinityAiChatProps {
  surface?: string;
  variant?: InfinityAiChatVariant;
  showHistory?: boolean;
  onSignInClick?: () => void;
  onMentorSelect?: (mentorProfileId: string) => void;
  className?: string;
}

function createFallbackId() {
  return `anon_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function getOrCreateAnonymousSessionId() {
  if (typeof window === 'undefined') {
    return createFallbackId();
  }

  const existing = window.localStorage.getItem(ANONYMOUS_SESSION_STORAGE_KEY);
  if (existing) {
    return existing;
  }

  const next =
    typeof window.crypto?.randomUUID === 'function'
      ? window.crypto.randomUUID()
      : createFallbackId();
  window.localStorage.setItem(ANONYMOUS_SESSION_STORAGE_KEY, next);
  return next;
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      payload && typeof payload === 'object' && 'error' in payload
        ? String((payload as { error?: unknown }).error)
        : 'Infinity AI request failed';
    throw new Error(message);
  }

  return payload as T;
}

function buildConversationQuery(surface: string, anonymousSessionId: string) {
  const params = new URLSearchParams({
    surface,
    anonymousSessionId,
  });
  return params.toString();
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function getInitials(name: string | null | undefined) {
  const parts = (name ?? 'AI')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  return parts.map((part) => part[0]?.toUpperCase()).join('') || 'AI';
}

function formatPrice(value: number | null | undefined, currency: string | null | undefined) {
  if (value == null) {
    return null;
  }

  return `${currency ?? 'USD'} ${value.toFixed(0)}`;
}

function getMetadataSections(block: AiResponseBlock) {
  const sections = block.metadata?.sections;
  if (!Array.isArray(sections)) {
    return [];
  }

  return sections
    .map((section) => {
      if (!section || typeof section !== 'object') {
        return null;
      }

      const typed = section as { title?: unknown; items?: unknown };
      const items = Array.isArray(typed.items)
        ? typed.items.filter((item): item is string => typeof item === 'string')
        : [];

      return {
        title: typeof typed.title === 'string' ? typed.title : 'Readiness',
        items,
      };
    })
    .filter((section): section is { title: string; items: string[] } => Boolean(section));
}

function blockToText(block: AiResponseBlock) {
  const parts = [
    block.title,
    block.content,
    block.question,
    block.suggestedReply,
    ...(block.items?.flatMap((item) => [item.title, item.body]) ?? []),
    ...(block.experts?.map((expert) => expert.reasonSummary ?? expert.headline ?? expert.name) ?? []),
    ...(block.resources?.map((resource) => resource.description ?? resource.title) ?? []),
  ];

  return parts.filter(Boolean).join('\n');
}

function getConversationTitle(conversation: AiConversationSummary) {
  const phase = conversation.phase.replace(/_/g, ' ');
  return `${phase.charAt(0).toUpperCase()}${phase.slice(1)} chat`;
}

function ExpertCard({
  expert,
  authenticated,
  onClick,
  compact = false,
}: {
  expert: AiExpertCard;
  authenticated: boolean;
  onClick: () => void;
  compact?: boolean;
}) {
  const price = formatPrice(expert.hourlyRate, expert.currency);

  return (
    <Card className='overflow-hidden border-border/80 bg-card/95 shadow-sm'>
      <CardContent className={cn(compact ? 'p-3' : 'p-4')}>
        <div className='flex items-start gap-3'>
          <Avatar className={cn('rounded-xl', compact ? 'h-10 w-10' : 'h-12 w-12')}>
            <AvatarImage src={expert.image ?? undefined} alt={expert.name} />
            <AvatarFallback className='rounded-xl'>{getInitials(expert.name)}</AvatarFallback>
          </Avatar>
          <div className='min-w-0 flex-1'>
            <h4 className='truncate text-sm font-semibold'>{expert.name}</h4>
            <p className='truncate text-xs text-muted-foreground'>
              {[expert.title, expert.company].filter(Boolean).join(' at ') || 'Mentor'}
            </p>
            {expert.location && !compact ? (
              <p className='mt-0.5 truncate text-xs text-muted-foreground'>{expert.location}</p>
            ) : null}
          </div>
          {price && !compact ? <Badge variant='secondary'>{price}</Badge> : null}
        </div>

        {expert.reasonSummary || expert.headline ? (
          <p
            className={cn(
              'mt-3 leading-relaxed text-muted-foreground',
              compact ? 'line-clamp-2 text-xs' : 'text-sm'
            )}
          >
            {expert.reasonSummary ?? expert.headline}
          </p>
        ) : null}

        {expert.expertise.length > 0 ? (
          <div className={cn('flex flex-wrap gap-1.5', compact ? 'mt-2' : 'mt-3')}>
            {expert.expertise.slice(0, compact ? 3 : 4).map((item) => (
              <Badge key={item} variant='outline' className='text-[11px]'>
                {item}
              </Badge>
            ))}
          </div>
        ) : null}

        <Button className={cn('w-full', compact ? 'mt-3 h-8 text-xs' : 'mt-4')} size='sm' onClick={onClick}>
          {authenticated ? 'View mentor' : 'Sign in to view mentor'}
        </Button>
      </CardContent>
    </Card>
  );
}

function ResourceCard({
  resource,
  compact = false,
}: {
  resource: AiResourceCard;
  compact?: boolean;
}) {
  const price = formatPrice(resource.price, resource.currency);

  return (
    <a
      href={resource.href}
      className={cn(
        'block rounded-xl border bg-card text-card-foreground shadow-sm transition-colors hover:bg-accent/40',
        compact ? 'p-3' : 'p-4'
      )}
    >
      <div className='flex items-start justify-between gap-3'>
        <div className='min-w-0'>
          <h4 className='text-sm font-semibold leading-snug'>{resource.title}</h4>
          <p className='mt-1 text-xs text-muted-foreground'>
            {[resource.providerName, resource.category].filter(Boolean).join(' - ') ||
              resource.resourceType}
          </p>
        </div>
        <ExternalLink className='h-4 w-4 shrink-0 text-muted-foreground' />
      </div>

      {resource.description ? (
        <p
          className={cn(
            'mt-3 leading-relaxed text-muted-foreground',
            compact ? 'line-clamp-2 text-xs' : 'text-sm'
          )}
        >
          {resource.description}
        </p>
      ) : null}

      <div className='mt-3 flex flex-wrap gap-1.5'>
        {resource.difficulty ? (
          <Badge variant='outline' className='text-[11px]'>
            {resource.difficulty}
          </Badge>
        ) : null}
        {resource.durationMinutes ? (
          <Badge variant='outline' className='text-[11px]'>
            {resource.durationMinutes} min
          </Badge>
        ) : null}
        {price ? (
          <Badge variant='secondary' className='text-[11px]'>
            {price}
          </Badge>
        ) : null}
      </div>
    </a>
  );
}

function ResponseBlock({
  block,
  authenticated,
  onSuggestedReply,
  onSignIn,
  onExpertClick,
  compact = false,
}: {
  block: AiResponseBlock;
  authenticated: boolean;
  onSuggestedReply: (message: string) => void;
  onSignIn: () => void;
  onExpertClick: (expert: AiExpertCard) => void;
  compact?: boolean;
}) {
  const sections = getMetadataSections(block);
  const hasText = Boolean(block.title || block.content || block.question);

  if (block.type === 'expert_cards' && block.experts?.length) {
    return (
      <div className={cn('grid gap-3', compact ? 'grid-cols-1' : 'sm:grid-cols-2 xl:grid-cols-3')}>
        {block.experts.map((expert) => (
          <ExpertCard
            key={expert.mentorProfileId}
            expert={expert}
            authenticated={authenticated}
            onClick={() => onExpertClick(expert)}
            compact={compact}
          />
        ))}
      </div>
    );
  }

  if (block.type === 'resource_cards' && block.resources?.length) {
    return (
      <div className={cn('grid gap-3', compact ? 'grid-cols-1' : 'sm:grid-cols-2 xl:grid-cols-3')}>
        {block.resources.map((resource) => (
          <ResourceCard key={resource.resourceId} resource={resource} compact={compact} />
        ))}
      </div>
    );
  }

  if (block.type === 'sign_in_cta') {
    return (
      <Card className='border-primary/20 bg-primary/5'>
        <CardContent className={cn(
          'flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between',
          compact ? 'p-3' : 'p-4'
        )}>
          <div>
            <h4 className='text-sm font-semibold'>Keep this chat with your account</h4>
            <p className={cn('mt-1 text-muted-foreground', compact ? 'text-xs' : 'text-sm')}>
              Sign in as a mentee to keep the thread, view matched mentors, and continue from your dashboard.
            </p>
          </div>
          <Button className={cn('shrink-0', compact && 'h-8 text-xs')} onClick={onSignIn}>
            Sign in
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={cn(compact ? 'space-y-2' : 'space-y-3')}>
      {hasText ? (
        <div className={cn(compact ? 'space-y-1.5' : 'space-y-2')}>
          {block.title ? <h4 className='text-sm font-semibold'>{block.title}</h4> : null}
          {block.content ? (
            <MessageResponse className={cn(compact && 'text-[13px] leading-relaxed')}>
              {block.content}
            </MessageResponse>
          ) : null}
          {block.question ? (
            <p className={cn('font-medium leading-relaxed', compact ? 'text-[13px]' : 'text-sm')}>
              {block.question}
            </p>
          ) : null}
        </div>
      ) : null}

      {block.items?.length ? (
        <div className='grid gap-2'>
          {block.items.map((item) => (
            <div key={`${item.title}-${item.body}`} className={cn('rounded-lg border bg-muted/30', compact ? 'p-2.5' : 'p-3')}>
              <h5 className='text-sm font-semibold'>{item.title}</h5>
              <p className={cn('mt-1 leading-relaxed text-muted-foreground', compact ? 'text-xs' : 'text-sm')}>
                {item.body}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      {sections.length ? (
        <div className='grid gap-2'>
          {sections.map((section) => (
            <div key={section.title} className={cn('rounded-lg border bg-muted/30', compact ? 'p-2.5' : 'p-3')}>
              <h5 className='text-sm font-semibold'>{section.title}</h5>
              <ul className={cn('mt-2 space-y-1 text-muted-foreground', compact ? 'text-xs' : 'text-sm')}>
                {section.items.map((item) => (
                  <li key={item}>- {item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}

      {block.suggestedReply ? (
        <Suggestions>
          <Suggestion
            suggestion={block.suggestedReply}
            onClick={onSuggestedReply}
            className={cn('bg-background', compact && 'h-7 max-w-full text-xs')}
          />
        </Suggestions>
      ) : null}
    </div>
  );
}

export function InfinityAiChat({
  surface = 'landing_page',
  variant = 'dashboard',
  showHistory = variant === 'dashboard',
  onSignInClick,
  onMentorSelect,
  className,
}: InfinityAiChatProps) {
  const router = useRouter();
  const { isAuthenticated, session } = useAuth();
  const [anonymousSessionId, setAnonymousSessionId] = useState<string | null>(null);
  const [conversation, setConversation] = useState<AiConversationSummary | null>(null);
  const [conversations, setConversations] = useState<AiConversationSummary[]>([]);
  const [turns, setTurns] = useState<AiConversationTurn[]>([]);
  const [input, setInput] = useState('');
  const [status, setStatus] = useState<'loading' | 'idle' | 'submitted' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);

  const isHero = variant === 'hero';
  const isSubmitting = status === 'submitted';
  const isLoading = status === 'loading';

  const fetchBootstrap = useCallback(
    async (sessionId: string, forceNew = false) => {
      const response = await fetch('/api/infinity-ai/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          surface,
          anonymousSessionId: sessionId,
          forceNew,
        }),
      });

      return readJsonResponse<AiConversationBootstrap>(response);
    },
    [surface]
  );

  const fetchConversationList = useCallback(
    async (sessionId: string) => {
      const response = await fetch(
        `/api/infinity-ai/conversations?${buildConversationQuery(surface, sessionId)}`,
        { cache: 'no-store' }
      );
      return readJsonResponse<{ conversations: AiConversationSummary[] }>(response);
    },
    [surface]
  );

  const fetchConversation = useCallback(
    async (conversationId: string, sessionId: string) => {
      const response = await fetch(
        `/api/infinity-ai/conversations/${conversationId}?${buildConversationQuery(surface, sessionId)}`,
        { cache: 'no-store' }
      );
      return readJsonResponse<AiConversationBootstrap>(response);
    },
    [surface]
  );

  const applyBootstrap = useCallback((bootstrap: AiConversationBootstrap) => {
    setConversation(bootstrap.conversation);
    setTurns(bootstrap.turns);
  }, []);

  const refreshConversationList = useCallback(
    async (sessionId: string) => {
      const list = await fetchConversationList(sessionId);
      setConversations(list.conversations);
    },
    [fetchConversationList]
  );

  useEffect(() => {
    let ignore = false;
    const sessionId = getOrCreateAnonymousSessionId();
    setAnonymousSessionId(sessionId);
    setStatus('loading');
    setError(null);

    Promise.all([fetchBootstrap(sessionId), fetchConversationList(sessionId)])
      .then(([bootstrap, list]) => {
        if (ignore) return;
        applyBootstrap(bootstrap);
        setConversations(list.conversations);
        setStatus('idle');
      })
      .catch((loadError) => {
        if (ignore) return;
        setError(loadError instanceof Error ? loadError.message : 'Unable to load AI chat');
        setStatus('error');
      });

    return () => {
      ignore = true;
    };
  }, [
    applyBootstrap,
    fetchBootstrap,
    fetchConversationList,
    isAuthenticated,
    session?.user?.id,
  ]);

  const handleAuthRequired = useCallback(() => {
    if (isAuthenticated) {
      router.push('/dashboard?section=chat');
      return;
    }

    if (onSignInClick) {
      onSignInClick();
      return;
    }

    const callbackUrl = encodeURIComponent('/dashboard?section=chat');
    router.push(`/auth/signin?callbackUrl=${callbackUrl}`);
  }, [isAuthenticated, onSignInClick, router]);

  const handleExpertClick = useCallback(
    (expert: AiExpertCard) => {
      if (!isAuthenticated) {
        handleAuthRequired();
        return;
      }

      if (onMentorSelect) {
        onMentorSelect(expert.mentorProfileId);
        return;
      }

      router.push(
        `/dashboard?section=mentor-detail&mentor=${expert.mentorProfileId}&from=chat`
      );
    },
    [handleAuthRequired, isAuthenticated, onMentorSelect, router]
  );

  const handleNewChat = useCallback(async () => {
    const sessionId = anonymousSessionId ?? getOrCreateAnonymousSessionId();
    setAnonymousSessionId(sessionId);
    setStatus('loading');
    setError(null);

    try {
      const bootstrap = await fetchBootstrap(sessionId, true);
      applyBootstrap(bootstrap);
      await refreshConversationList(sessionId);
      setStatus('idle');
    } catch (newChatError) {
      setError(
        newChatError instanceof Error ? newChatError.message : 'Unable to start a new chat'
      );
      setStatus('error');
    }
  }, [anonymousSessionId, applyBootstrap, fetchBootstrap, refreshConversationList]);

  const handleSelectConversation = useCallback(
    async (conversationId: string) => {
      const sessionId = anonymousSessionId ?? getOrCreateAnonymousSessionId();
      setAnonymousSessionId(sessionId);
      setStatus('loading');
      setError(null);

      try {
        const bootstrap = await fetchConversation(conversationId, sessionId);
        applyBootstrap(bootstrap);
        setStatus('idle');
      } catch (selectError) {
        setError(selectError instanceof Error ? selectError.message : 'Unable to load chat');
        setStatus('error');
      }
    },
    [anonymousSessionId, applyBootstrap, fetchConversation]
  );

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isSubmitting) {
        return;
      }

      const sessionId = anonymousSessionId ?? getOrCreateAnonymousSessionId();
      setAnonymousSessionId(sessionId);
      setInput('');
      setError(null);
      setStatus('submitted');

      let activeConversation = conversation;
      try {
        if (!activeConversation) {
          const bootstrap = await fetchBootstrap(sessionId);
          activeConversation = bootstrap.conversation;
          applyBootstrap(bootstrap);
        }

        const optimisticTurn: AiConversationTurn = {
          id: `optimistic-${Date.now()}`,
          actor: 'user',
          inputText: trimmed,
          responseBlocks: null,
          traceMetadata: null,
          createdAt: new Date().toISOString(),
        };
        setTurns((currentTurns) => [...currentTurns, optimisticTurn]);

        const response = await fetch(
          `/api/infinity-ai/conversations/${activeConversation.id}/message`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: trimmed,
              anonymousSessionId: sessionId,
            }),
          }
        );
        const messageResponse = await readJsonResponse<AiServiceMessageResponse>(response);

        if (messageResponse.persistedConversation) {
          setConversation(messageResponse.persistedConversation);
        }

        const assistantTurn =
          messageResponse.persistedAssistantTurn ??
          ({
            id: `assistant-${Date.now()}`,
            actor: 'assistant',
            inputText: null,
            responseBlocks: messageResponse.responseBlocks,
            traceMetadata: messageResponse.traceMetadata,
            createdAt: new Date().toISOString(),
          } satisfies AiConversationTurn);

        setTurns((currentTurns) => [...currentTurns, assistantTurn]);

        const refreshed = await fetchConversation(activeConversation.id, sessionId);
        applyBootstrap(refreshed);
        await refreshConversationList(sessionId);
        setStatus('idle');
      } catch (sendError) {
        setError(
          sendError instanceof Error ? sendError.message : 'Unable to send your message'
        );
        setStatus('error');
      }
    },
    [
      anonymousSessionId,
      applyBootstrap,
      conversation,
      fetchBootstrap,
      fetchConversation,
      isSubmitting,
      refreshConversationList,
    ]
  );

  const handleSubmit = useCallback(
    (message: PromptInputMessage) => {
      void sendMessage(message.text);
    },
    [sendMessage]
  );

  const activeConversationId = conversation?.id ?? null;
  const displayTurns = useMemo(
    () => turns.filter((turn) => turn.inputText || turn.responseBlocks?.length),
    [turns]
  );

  return (
    <div
      className={cn(
        'flex min-h-0 overflow-hidden border',
        isHero
          ? 'h-[430px] rounded-2xl border-white/15 bg-white text-slate-950 shadow-2xl shadow-blue-950/25 sm:h-[470px] lg:h-[min(540px,calc(100svh-9rem))]'
          : 'h-full min-h-[680px] rounded-xl bg-background shadow-xl',
        className
      )}
    >
      {showHistory ? (
        <aside className='hidden w-72 shrink-0 border-r bg-muted/30 p-3 md:flex md:flex-col'>
          <div className='flex items-center justify-between gap-2'>
            <div>
              <h2 className='text-sm font-semibold'>AI chats</h2>
              <p className='text-xs text-muted-foreground'>Mentee workspace</p>
            </div>
            <Button size='icon' variant='outline' className='h-8 w-8' onClick={handleNewChat}>
              <Plus className='h-4 w-4' />
              <span className='sr-only'>New chat</span>
            </Button>
          </div>

          <div className='mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto'>
            {conversations.map((item) => {
              const active = item.id === activeConversationId;
              return (
                <button
                  key={item.id}
                  type='button'
                  onClick={() => void handleSelectConversation(item.id)}
                  className={cn(
                    'w-full rounded-lg border px-3 py-2 text-left transition-colors',
                    active
                      ? 'border-primary/30 bg-primary/10'
                      : 'border-transparent bg-background/60 hover:bg-background'
                  )}
                >
                  <span className='block truncate text-sm font-medium'>
                    {getConversationTitle(item)}
                  </span>
                  <span className='mt-1 flex items-center gap-1 text-xs text-muted-foreground'>
                    <Clock className='h-3 w-3' />
                    {formatDateTime(item.updatedAt)}
                  </span>
                </button>
              );
            })}
          </div>
        </aside>
      ) : null}

      <section className='flex min-w-0 flex-1 flex-col'>
        <header
          className={cn(
            'flex items-center border-b',
            isHero
              ? 'gap-2.5 border-slate-200 bg-white/95 px-3.5 py-2.5'
              : 'gap-3 bg-background/95 px-4 py-3'
          )}
        >
          <div
            className={cn(
              'flex items-center justify-center rounded-xl bg-primary text-primary-foreground',
              isHero ? 'h-9 w-9' : 'h-10 w-10'
            )}
          >
            <Sparkles className={cn(isHero ? 'h-4 w-4' : 'h-5 w-5')} />
          </div>
          <div className='min-w-0 flex-1'>
            <h3 className='truncate text-sm font-semibold'>AI Career Advisor</h3>
            <p className={cn('truncate text-xs text-muted-foreground', isHero && 'max-w-[15rem]')}>
              {isHero ? 'Find the right mentor faster' : 'Python-backed mentor discovery assistant'}
            </p>
          </div>
          <Badge
            variant='secondary'
            className={cn('hidden shrink-0 sm:inline-flex', isHero && 'h-6 px-2 text-[11px]')}
          >
            Online
          </Badge>
          {showHistory ? (
            <Button
              variant='outline'
              size='sm'
              className='shrink-0 md:hidden'
              onClick={handleNewChat}
            >
              <Plus className='mr-1.5 h-3.5 w-3.5' />
              New
            </Button>
          ) : isHero ? null : (
            <Button
              variant='outline'
              size='sm'
              className='hidden shrink-0 sm:inline-flex'
              onClick={handleNewChat}
            >
              <Plus className='mr-1.5 h-3.5 w-3.5' />
              New
            </Button>
          )}
        </header>

        {showHistory && conversations.length > 0 ? (
          <div className='border-b bg-muted/20 px-3 py-2 md:hidden'>
            <div className='flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'>
              {conversations.map((item) => {
                const active = item.id === activeConversationId;
                return (
                  <button
                    key={item.id}
                    type='button'
                    onClick={() => void handleSelectConversation(item.id)}
                    className={cn(
                      'min-w-44 rounded-lg border px-3 py-2 text-left',
                      active
                        ? 'border-primary/30 bg-primary/10'
                        : 'border-border bg-background'
                    )}
                  >
                    <span className='block truncate text-xs font-medium'>
                      {getConversationTitle(item)}
                    </span>
                    <span className='mt-1 block text-[11px] text-muted-foreground'>
                      {formatDateTime(item.updatedAt)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        <Conversation>
          <ConversationContent className={cn(isHero ? 'space-y-3 px-3 py-3' : 'space-y-4')}>
            {isLoading ? (
              <ConversationEmptyState
                className={cn(isHero && 'min-h-[220px] px-4')}
                icon={<Loader2 className={cn('animate-spin', isHero ? 'h-6 w-6' : 'h-8 w-8')} />}
                title={isHero ? 'Loading advisor' : 'Loading your AI chat'}
                description={isHero ? 'Restoring your last question.' : 'Restoring the latest conversation for this browser.'}
              />
            ) : displayTurns.length === 0 ? (
              <ConversationEmptyState
                className={cn(isHero && 'min-h-[230px] items-start px-2 text-left')}
                icon={<MessageSquare className={cn(isHero ? 'h-8 w-8' : 'h-10 w-10')} />}
                title={isHero ? 'What are you trying to figure out?' : 'Start with a goal'}
                description={
                  isHero
                    ? 'Ask a career question and get matched with a useful next step.'
                    : 'Ask about a career decision, learning path, interview prep, or the kind of mentor you want.'
                }
              >
                <Suggestions className={cn('mt-3', isHero ? 'w-full justify-start' : 'justify-center')}>
                  {STARTER_SUGGESTIONS.map((suggestion) => (
                    <Suggestion
                      key={suggestion}
                      suggestion={suggestion}
                      onClick={sendMessage}
                      className={cn(isHero && 'h-8 text-xs')}
                    />
                  ))}
                </Suggestions>
              </ConversationEmptyState>
            ) : (
              displayTurns.map((turn) => {
                const from = turn.actor === 'user' ? 'user' : 'assistant';
                const text = turn.inputText;
                const responseBlocks = turn.responseBlocks ?? [];

                return (
                  <Message key={turn.id} from={from}>
                    {from === 'assistant' ? (
                      <div
                        className={cn(
                          'mt-1 flex shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground',
                          isHero ? 'h-7 w-7' : 'h-8 w-8'
                        )}
                      >
                        <Bot className={cn(isHero ? 'h-3.5 w-3.5' : 'h-4 w-4')} />
                      </div>
                    ) : null}
                    <MessageContent
                      from={from}
                      className={cn(
                        'select-text',
                        isHero && 'px-3 py-2 text-[13px]',
                        from === 'assistant' && responseBlocks.length > 0
                          ? cn('w-full', isHero ? 'max-w-[90%] space-y-3' : 'max-w-[92%] space-y-4')
                          : isHero
                            ? 'max-w-[86%]'
                            : null
                      )}
                    >
                      {from === 'user' ? (
                        <div className='flex items-start gap-2'>
                          <UserRound className='mt-0.5 h-4 w-4 shrink-0 opacity-80' />
                          <MessageResponse>{text ?? ''}</MessageResponse>
                        </div>
                      ) : responseBlocks.length > 0 ? (
                        responseBlocks.map((block, index) => (
                          <ResponseBlock
                            key={`${turn.id}-${block.type}-${index}-${blockToText(block).slice(0, 18)}`}
                            block={block}
                            authenticated={isAuthenticated}
                            onSuggestedReply={sendMessage}
                            onSignIn={handleAuthRequired}
                            onExpertClick={handleExpertClick}
                            compact={isHero}
                          />
                        ))
                      ) : (
                        <MessageResponse>{text ?? ''}</MessageResponse>
                      )}
                    </MessageContent>
                  </Message>
                );
              })
            )}

            {isSubmitting ? (
              <Message from='assistant'>
                <div
                  className={cn(
                    'mt-1 flex shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground',
                    isHero ? 'h-7 w-7' : 'h-8 w-8'
                  )}
                >
                  <Bot className={cn(isHero ? 'h-3.5 w-3.5' : 'h-4 w-4')} />
                </div>
                <MessageContent
                  from='assistant'
                  className={cn('flex items-center gap-2', isHero && 'px-3 py-2 text-[13px]')}
                >
                  <Loader2 className='h-4 w-4 animate-spin text-muted-foreground' />
                  <span className={cn('text-muted-foreground', isHero ? 'text-xs' : 'text-sm')}>
                    Thinking through that...
                  </span>
                </MessageContent>
              </Message>
            ) : null}
          </ConversationContent>
          <ConversationScrollButton
            className={cn(isHero ? 'bottom-3 right-3 h-8 w-8' : 'bottom-4 right-4')}
          />
        </Conversation>

        <div className={cn('border-t', isHero ? 'bg-white/95 p-2.5' : 'bg-background p-3')}>
          {error ? (
            <div className={cn('mb-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-destructive', isHero ? 'text-xs' : 'text-sm')}>
              {error}
            </div>
          ) : null}
          <PromptInput
            onSubmit={handleSubmit}
            className={cn('relative', isHero && 'rounded-xl p-1.5 shadow-sm')}
          >
            <PromptInputTextarea
              value={input}
              placeholder={isHero ? 'Ask what mentor fits your goal...' : 'Ask about mentors, careers, interviews, or learning paths...'}
              onChange={(event) => setInput(event.currentTarget.value)}
              disabled={isLoading || isSubmitting}
              className={cn('pr-12', isHero && 'min-h-9 px-2 py-1.5 text-sm')}
            />
            <PromptInputSubmit
              disabled={!input.trim() || isLoading || isSubmitting}
              className={cn('absolute', isHero ? 'bottom-1.5 right-1.5 h-8 w-8 rounded-lg' : 'bottom-2 right-2')}
            />
          </PromptInput>
          <div className={cn('flex items-center justify-between gap-3 px-1 text-muted-foreground', isHero ? 'mt-1.5 text-[11px]' : 'mt-2 text-xs')}>
            <span>{isHero ? 'Continue this chat after sign in.' : 'Anonymous chats are kept for sign-in handoff.'}</span>
            <span className='hidden sm:inline'>Enter to send</span>
          </div>
        </div>
      </section>
    </div>
  );
}
