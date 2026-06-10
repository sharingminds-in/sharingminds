"use client"

import type { KeyboardEvent, RefObject } from "react"
import Image from "next/image"
import { motion } from "framer-motion"
import {
  ArrowRightLeft,
  ArrowUpRight,
  Bot,
  BriefcaseBusiness,
  CalendarDays,
  CircleDollarSign,
  Code2,
  Infinity,
  MessageCircleMore,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  UsersRound,
} from "lucide-react"
import { Button } from "@/components/ui/button"

interface ChatMessage {
  id: string
  type: 'user' | 'ai'
  content: string
  timestamp: Date
}

interface LandingHeroExperienceProps {
  heroRef: RefObject<HTMLDivElement | null>
  chatContainerRef: RefObject<HTMLDivElement | null>
  textareaRef: RefObject<HTMLTextAreaElement | null>
  chatEndRef: RefObject<HTMLDivElement | null>
  inputValue: string
  currentPlaceholder: string
  currentAiMessage: string
  messages: ChatMessage[]
  isFocused: boolean
  isChatExpanded: boolean
  isAiTyping: boolean
  isSearchingMentors: boolean
  isChatLimitReached: boolean
  userMessageCount: number
  messagesRemaining: number | null
  remainingColorClass: string
  onInputChange: (value: string) => void
  onInputFocus: () => void
  onInputBlur: () => void
  onInputKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void
  onContainerClick: () => void
  onSubmit: () => void
  onResetChat: () => void
  onTopicSelect: (prompt: string) => void
}

const POPULAR_TOPICS = [
  {
    label: "Career Growth",
    prompt: "I want to accelerate my career growth. Where should I focus?",
    icon: TrendingUp,
  },
  {
    label: "Career Transition",
    prompt: "Help me plan a confident career transition.",
    icon: ArrowRightLeft,
  },
  {
    label: "Starting a Business",
    prompt: "I want guidance on starting and validating a business.",
    icon: BriefcaseBusiness,
  },
  {
    label: "Product / Tech",
    prompt: "Help me grow into a stronger product or technology leader.",
    icon: Code2,
  },
  {
    label: "Raise Funding",
    prompt: "How should I prepare to raise funding for my company?",
    icon: CircleDollarSign,
  },
  {
    label: "Leadership",
    prompt: "I want to improve my leadership and people management skills.",
    icon: UsersRound,
  },
]

const HERO_STEPS = [
  {
    title: "Talk to Infinity",
    description: "Share your challenge in a simple conversation.",
    icon: MessageCircleMore,
  },
  {
    title: "Get matched",
    description: "Infinity connects you with the right expert.",
    icon: ShieldCheck,
  },
  {
    title: "Connect & grow",
    description: "Have focused 1:1 sessions and achieve your goals.",
    icon: CalendarDays,
  },
]

const COMPANY_LOGOS = [
  { name: "Google", src: "/brand-logos/google.svg", imageWidth: 72, imageHeight: 36, frameWidth: 68, frameHeight: 24 },
  { name: "Microsoft", src: "/brand-logos/microsoft.svg", imageWidth: 100, imageHeight: 50, frameWidth: 96, frameHeight: 24 },
  { name: "Amazon", src: "/brand-logos/amazon.svg", imageWidth: 72, imageHeight: 36, frameWidth: 70, frameHeight: 22 },
  { name: "Airbnb", src: "/brand-logos/airbnb.svg", imageWidth: 70, imageHeight: 35, frameWidth: 68, frameHeight: 23 },
  { name: "Paytm", src: "/brand-logos/paytm.svg", imageWidth: 68, imageHeight: 22, frameWidth: 68, frameHeight: 22 },
  { name: "Atlassian", src: "/brand-logos/atlassian.svg", imageWidth: 104, imageHeight: 14, frameWidth: 104, frameHeight: 14 },
]

export function LandingHeroExperience({
  heroRef,
  chatContainerRef,
  textareaRef,
  chatEndRef,
  inputValue,
  currentPlaceholder,
  currentAiMessage,
  messages,
  isFocused,
  isChatExpanded,
  isAiTyping,
  isSearchingMentors,
  isChatLimitReached,
  userMessageCount,
  messagesRemaining,
  remainingColorClass,
  onInputChange,
  onInputFocus,
  onInputBlur,
  onInputKeyDown,
  onContainerClick,
  onSubmit,
  onResetChat,
  onTopicSelect,
}: LandingHeroExperienceProps) {
  return (
    <section
      id="landing-hero"
      ref={heroRef}
      className="relative overflow-hidden bg-[#fbfbfe] pt-[76px] text-[#091533]"
    >
      <div className="pointer-events-none absolute inset-x-0 top-[76px] hidden h-[690px] lg:block">
        <div className="absolute inset-y-0 right-0 w-[67%]">
          <Image
            src="/landing-hero-workspace.png"
            alt=""
            fill
            priority
            sizes="67vw"
            className="object-cover object-center"
          />
        </div>
        <div className="absolute inset-0 bg-[linear-gradient(90deg,#fbfbfe_0%,#fbfbfe_30%,rgba(251,251,254,0.92)_42%,rgba(251,251,254,0.32)_72%,rgba(251,251,254,0.12)_100%)]" />
        <div className="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-[#fbfbfe] to-transparent" />
      </div>
      <div className="pointer-events-none absolute left-[39%] top-32 h-72 w-72 rounded-full bg-indigo-200/30 blur-[100px]" />
      <div className="pointer-events-none absolute right-[18%] top-[38rem] h-56 w-56 rounded-full bg-violet-200/35 blur-[90px]" />

      <div className="relative z-10 mx-auto max-w-[1480px] px-5 sm:px-8 lg:px-10 xl:px-12">
        <div className="grid min-h-[650px] items-center gap-12 py-12 lg:grid-cols-[0.88fr_1.12fr] lg:gap-10 lg:py-14 xl:min-h-[680px]">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="mx-auto max-w-[590px] text-center lg:mx-0 lg:text-left"
          >
            <h1 className="text-[clamp(3.25rem,5.3vw,5.6rem)] font-semibold leading-[0.99] tracking-[-0.055em] text-[#071331]">
              <span className="block">You don&apos;t have</span>
              <span className="block">to figure it out</span>
              <span className="relative mt-2 inline-block bg-gradient-to-r from-[#2f45ff] via-[#4930f2] to-[#7732ed] bg-clip-text pb-2 text-transparent">
                all alone.
                <span className="absolute bottom-0 left-[28%] h-[5px] w-[43%] -rotate-2 rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 opacity-80" />
              </span>
            </h1>

            <p className="mx-auto mt-8 max-w-[500px] text-lg leading-8 text-[#45506c] sm:text-xl lg:mx-0">
              Connect with the right experts, at the right time for real guidance that creates real growth.
            </p>

            <div className="mt-9 flex flex-wrap items-center justify-center gap-4 lg:justify-start">
              <div className="flex -space-x-3">
                {[
                  ['AM', 'from-amber-300 to-orange-500'],
                  ['JS', 'from-sky-300 to-blue-600'],
                  ['RK', 'from-rose-300 to-pink-600'],
                  ['TM', 'from-emerald-300 to-teal-600'],
                ].map(([initials, gradient]) => (
                  <div
                    key={initials}
                    className={`flex h-11 w-11 items-center justify-center rounded-full border-[3px] border-[#fbfbfe] bg-gradient-to-br ${gradient} text-[11px] font-bold text-white shadow-sm`}
                  >
                    {initials}
                  </div>
                ))}
                <div className="flex h-11 w-11 items-center justify-center rounded-full border-[3px] border-[#fbfbfe] bg-indigo-100 text-indigo-600">
                  <Sparkles className="h-4 w-4" />
                </div>
              </div>
              <span className="text-[15px] font-medium text-[#4f5871]">
                Trusted by 2,500+ professionals
              </span>
            </div>

            <motion.div
              id="professionals"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.28 }}
              className="mt-11 border-t border-indigo-100/80 pt-7"
            >
              <p className="text-xs font-semibold tracking-[0.16em] text-[#69728a]">
                TRUSTED BY PROFESSIONALS FROM
              </p>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-3 lg:flex-nowrap lg:justify-start">
                {COMPANY_LOGOS.map((company) => (
                  <div
                    key={company.name}
                    className="relative shrink-0 overflow-hidden"
                    style={{ width: company.frameWidth, height: company.frameHeight }}
                  >
                    <Image
                      src={company.src}
                      alt={`${company.name} logo`}
                      width={company.imageWidth}
                      height={company.imageHeight}
                      className="absolute left-1/2 top-1/2 max-w-none -translate-x-1/2 -translate-y-1/2"
                    />
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>

          <motion.div
            id="infinity-chat"
            initial={{ opacity: 0, y: 30, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.75, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
            className="mx-auto w-full max-w-[590px] scroll-mt-28 lg:mr-0"
          >
            <div
              ref={chatContainerRef}
              onClick={onContainerClick}
              className={`relative overflow-hidden rounded-[28px] border bg-white/95 shadow-[0_30px_90px_rgba(54,45,126,0.16)] backdrop-blur-xl transition-all duration-500 ${
                isChatExpanded ? 'h-[600px]' : 'min-h-[535px]'
              } ${
                isFocused
                  ? 'border-indigo-300 ring-4 ring-indigo-100/80'
                  : 'border-white/80'
              }`}
            >
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white via-white/85 to-indigo-50/55" />

              <div className="relative flex items-start justify-between px-7 pb-4 pt-7 sm:px-9 sm:pt-8">
                <div className="flex items-center gap-3">
                  <Infinity className="h-12 w-16 stroke-[2.5] text-indigo-600" />
                  <div>
                    <h2 className="text-[31px] font-bold leading-none tracking-[-0.04em] text-indigo-700">
                      infinity
                    </h2>
                    <p className="mt-2 text-sm font-medium text-[#5b6580]">AI Guidance Partner</p>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-2 text-sm font-semibold text-emerald-600">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-[0_0_0_5px_rgba(16,185,129,0.1)]" />
                  Live
                </div>
              </div>

              {isChatExpanded ? (
                <div className="relative h-[392px] space-y-4 overflow-y-auto px-5 py-4 sm:px-8">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex gap-3 ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      {message.type === 'ai' && (
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600">
                          <Bot className="h-4 w-4" />
                        </div>
                      )}
                      <div
                        className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                          message.type === 'user'
                            ? 'rounded-br-md bg-gradient-to-r from-indigo-600 to-violet-600 text-white'
                            : 'rounded-bl-md bg-[#f1f2f8] text-[#27314d]'
                        }`}
                      >
                        {message.content}
                      </div>
                    </div>
                  ))}

                  {isAiTyping && !currentAiMessage && (
                    <div className="flex gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600">
                        <Bot className="h-4 w-4" />
                      </div>
                      <div className="flex items-center gap-2 rounded-2xl rounded-bl-md bg-[#f1f2f8] px-4 py-3 text-sm text-[#43506d]">
                        Thinking
                        <span className="flex gap-1">
                          {[0, 1, 2].map((index) => (
                            <span
                              key={index}
                              className="h-1.5 w-1.5 animate-bounce rounded-full bg-indigo-500"
                              style={{ animationDelay: `${index * 150}ms` }}
                            />
                          ))}
                        </span>
                      </div>
                    </div>
                  )}

                  {isAiTyping && currentAiMessage && (
                    <div className="flex gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600">
                        <Bot className="h-4 w-4" />
                      </div>
                      <div className="max-w-[82%] rounded-2xl rounded-bl-md bg-[#f1f2f8] px-4 py-3 text-sm leading-relaxed text-[#27314d]">
                        {currentAiMessage}
                        <span className="animate-pulse text-indigo-600">|</span>
                      </div>
                    </div>
                  )}

                  {isSearchingMentors && (
                    <div className="flex gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-600">
                        <Search className="h-4 w-4 animate-pulse" />
                      </div>
                      <div className="rounded-2xl rounded-bl-md bg-[#f1f2f8] px-4 py-3 text-sm text-[#43506d]">
                        Finding the right experts for you...
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
              ) : (
                <div className="relative px-7 pt-5 sm:px-9">
                  <p className="text-[25px] font-semibold tracking-[-0.025em] text-[#101a39]">
                    Hi, I&apos;m <span className="text-indigo-600">Infinity</span>{' '}
                    <span aria-hidden="true">👋</span>
                  </p>
                  <p className="mt-1 text-xl text-[#18223f]">How can I help you today?</p>
                </div>
              )}

              <div
                className={`relative px-5 sm:px-9 ${
                  isChatExpanded
                    ? 'border-t border-slate-100 bg-white/80 py-4'
                    : 'pt-8'
                }`}
              >
                <div className="flex items-center gap-3 rounded-2xl border border-[#e1e3ee] bg-white px-3 py-2 shadow-[0_8px_24px_rgba(46,38,98,0.05)] transition focus-within:border-indigo-300 focus-within:ring-4 focus-within:ring-indigo-100/70">
                  <div className="relative min-w-0 flex-1">
                    <textarea
                      ref={textareaRef}
                      placeholder=""
                      value={inputValue}
                      onChange={(event) => onInputChange(event.target.value)}
                      onFocus={onInputFocus}
                      onBlur={onInputBlur}
                      onKeyDown={onInputKeyDown}
                      rows={1}
                      disabled={isAiTyping || isSearchingMentors || isChatLimitReached}
                      className="block min-h-12 w-full resize-none bg-transparent px-2 py-3 text-base text-[#111b38] outline-none disabled:opacity-50 sm:text-lg"
                      style={{ scrollbarWidth: 'none' }}
                    />
                    {!inputValue && !isFocused && !isChatLimitReached && (
                      <div className="pointer-events-none absolute inset-0 flex items-center px-2">
                        <span className="truncate text-base text-[#838aa0] sm:text-lg">
                          {isChatExpanded
                            ? 'Ask a follow-up question...'
                            : currentPlaceholder || 'Describe your challenge...'}
                          <span className="animate-pulse text-indigo-500">|</span>
                        </span>
                      </div>
                    )}
                    {isChatLimitReached && (
                      <div className="pointer-events-none absolute inset-0 flex items-center px-2">
                        <span className="truncate text-sm text-[#838aa0]">
                          Connect with a mentor to continue your journey
                        </span>
                      </div>
                    )}
                  </div>

                  {isChatLimitReached ? (
                    <Button
                      onClick={(event) => {
                        event.stopPropagation()
                        onResetChat()
                      }}
                      className="h-12 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 text-sm font-semibold text-white"
                    >
                      New chat
                    </Button>
                  ) : (
                    <Button
                      onClick={(event) => {
                        event.stopPropagation()
                        onSubmit()
                      }}
                      disabled={!inputValue.trim() || isAiTyping || isSearchingMentors}
                      aria-label="Send message"
                      className={`h-12 w-12 shrink-0 rounded-full p-0 transition-all ${
                        inputValue.trim() && !isAiTyping && !isSearchingMentors
                          ? 'bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-[0_10px_25px_rgba(79,70,229,0.3)] hover:-translate-y-0.5'
                          : 'bg-indigo-100 text-indigo-300'
                      }`}
                    >
                      <Send className="h-5 w-5" />
                    </Button>
                  )}
                </div>
              </div>

              {!isChatExpanded && (
                <div className="relative px-5 pb-6 pt-6 sm:px-9">
                  <div className="mb-4 flex items-center gap-4">
                    <span className="h-px flex-1 bg-[#e8e9f2]" />
                    <span className="text-xs font-medium text-[#747c93]">Popular topics</span>
                    <span className="h-px flex-1 bg-[#e8e9f2]" />
                  </div>
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                    {POPULAR_TOPICS.map((topic) => {
                      const TopicIcon = topic.icon
                      return (
                        <button
                          key={topic.label}
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            onTopicSelect(topic.prompt)
                          }}
                          className="group flex min-h-[52px] items-center gap-2 rounded-xl border border-indigo-100/70 bg-gradient-to-br from-indigo-50 to-violet-50/80 px-3 py-3 text-left text-[12px] font-semibold text-indigo-700 transition-all duration-200 hover:-translate-y-0.5 hover:border-indigo-200 hover:bg-indigo-100 hover:shadow-sm"
                        >
                          <TopicIcon className="h-4 w-4 shrink-0 transition-transform group-hover:scale-110" />
                          <span className="leading-tight">{topic.label}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {isChatExpanded && userMessageCount > 0 && !isChatLimitReached && (
                <div className={`absolute right-8 top-[88px] text-xs font-semibold ${remainingColorClass}`}>
                  {messagesRemaining !== null
                    ? `${messagesRemaining} message${messagesRemaining !== 1 ? 's' : ''} left`
                    : `${userMessageCount} sent`}
                </div>
              )}
            </div>
          </motion.div>
        </div>

        <div
          id="how-it-works"
          className="border-t border-indigo-100/80 py-8"
        >
          <div className="grid w-full gap-4 sm:grid-cols-3 lg:gap-5">
            {HERO_STEPS.map((step, index) => {
              const StepIcon = step.icon
              return (
                <motion.article
                  key={step.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.35 }}
                  transition={{ duration: 0.5, delay: index * 0.08 }}
                  whileHover={{ y: -5 }}
                  className="group relative flex min-h-[150px] items-start gap-5 rounded-[22px] border border-white bg-white/90 p-6 shadow-[0_18px_45px_rgba(59,49,127,0.09)] backdrop-blur sm:flex-col sm:gap-0 lg:min-h-[158px] lg:flex-row lg:gap-5"
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
                    <StepIcon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 pr-7">
                    <h3 className="font-semibold leading-5 text-[#111a37] sm:mt-4 lg:mt-1">
                      {step.title}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-[#5f687f]">{step.description}</p>
                  </div>
                  <ArrowUpRight className="absolute bottom-6 right-6 h-4 w-4 text-[#111a37] transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                </motion.article>
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}
