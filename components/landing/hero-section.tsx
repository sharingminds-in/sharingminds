"use client"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { ArrowRight, Send, Bot, Sparkles, Search, ArrowLeftCircle, ArrowRightCircle, MapPin, Star, Users, CheckCircle2, Play, Zap } from "lucide-react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { v4 as uuidv4 } from 'uuid';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog"
import { MentorDetailView } from "@/components/mentee/mentor-detail-view"
import { useAuth } from "@/contexts/auth-context"
import { SignInPopup } from "@/components/auth/sign-in-popup"
import { useTRPCClient } from "@/lib/trpc/react"

interface Message {
  id: string
  type: 'user' | 'ai'
  content: string
  timestamp: Date
}

interface SuggestedCourse {
  id: string
  title: string | null
  description: string | null
  difficulty: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | null
  duration: number | null
  price: string | null
  currency: string | null
  thumbnailUrl: string | null
  category: string | null
  enrollmentCount: number | null
  avgRating: number
  reviewCount: number
  mentor: {
    id: string | null
    name: string | null
    image: string | null
    title: string | null
    company: string | null
  } | null
}

interface DbMentor {
  id: string
  userId: string
  title: string | null
  company: string | null
  industry: string | null
  expertise: string | null
  experience: number | null
  hourlyRate: string | null
  currency: string | null
  headline: string | null
  about: string | null
  linkedinUrl: string | null
  githubUrl?: string | null
  websiteUrl?: string | null
  verificationStatus: string | null
  isAvailable: boolean | null
  name: string | null
  email: string | null
  image: string | null
}

export function HeroSection() {
  const [inputValue, setInputValue] = useState("")
  const [isFocused, setIsFocused] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const [selectedMentorIdForModal, setSelectedMentorIdForModal] = useState<string | null>(null)
  const [isMentorModalOpen, setIsMentorModalOpen] = useState(false)
  const [currentPlaceholder, setCurrentPlaceholder] = useState("")
  const [currentQueryIndex, setCurrentQueryIndex] = useState(0)
  const [charIndex, setCharIndex] = useState(0)
  const [isTyping, setIsTyping] = useState(true)
  const [isChatExpanded, setIsChatExpanded] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [isAiTyping, setIsAiTyping] = useState(false)
  const [currentAiMessage, setCurrentAiMessage] = useState("")
  const [isSearchingMentors, setIsSearchingMentors] = useState(false)
  const [isChatLimitReached, setIsChatLimitReached] = useState(false)
  const [suggestedContent, setSuggestedContent] = useState<SuggestedCourse[]>([])
  const [showContent, setShowContent] = useState(false)

  const [dbMentors, setDbMentors] = useState<DbMentor[]>([])
  const [showMentors, setShowMentors] = useState(false)
  const [currentMentorIndex, setCurrentMentorIndex] = useState(0)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const chatContainerRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const heroRef = useRef<HTMLDivElement>(null)
  const mentorsSectionRef = useRef<HTMLDivElement>(null)
  const trpcClient = useTRPCClient()

  const [chatSessionId, setChatSessionId] = useState<string | null>(null);

  const { isAuthenticated } = useAuth()
  const [showSignInPopup, setShowSignInPopup] = useState(false)

  const handleBookIntroCall = (mentorId: string) => {
    if (isAuthenticated) {
      setSelectedMentorIdForModal(mentorId)
      setIsMentorModalOpen(true)
    } else {
      setShowSignInPopup(true)
    }
  }

  useEffect(() => {
    let sessionId = localStorage.getItem('ai_chatbot_session_id');
    if (!sessionId) {
      sessionId = uuidv4();
      localStorage.setItem('ai_chatbot_session_id', sessionId);
    }
    setChatSessionId(sessionId);
  }, []);

  const saveMessageToDB = async (
    senderType: 'user' | 'ai' | 'system',
    content: string,
    responseToMessageId: string | null = null,
    metadata: Record<string, any> = {}
  ) => {
    if (!chatSessionId) return;
    await trpcClient.chatbot.saveMessage.mutate({
        chatSessionId,
        senderType,
        content,
        responseToMessageId,
        metadata,
    });
  };

  const logMentorExposure = async (mentorIds: string[]) => {
    try {
      await saveMessageToDB('ai', 'Mentor recommendations shown', null, {
        eventType: 'mentors_shown',
        mentorIds,
      });
    } catch (error) {
      console.error('Failed to log mentor exposure:', error);
    }
  };

  const placeholderQueries = [
    "How do I transition into product management?",
    "What skills do I need for AI/ML roles?",
    "Should I pursue an MBA or start working?",
    "How to break into tech from a non-CS background?",
    "What's the best career path in data science?",
    "How can I prepare for FAANG interviews?",
  ]

  // Typewriter placeholder effect
  useEffect(() => {
    if (isFocused || inputValue || isChatExpanded) return
    const currentQuery = placeholderQueries[currentQueryIndex]
    const typewriterTimer = setTimeout(() => {
      if (isTyping) {
        if (charIndex < currentQuery.length) {
          setCurrentPlaceholder(currentQuery.slice(0, charIndex + 1))
          setCharIndex(charIndex + 1)
        } else {
          setTimeout(() => setIsTyping(false), 1200)
        }
      } else {
        if (charIndex > 0) {
          setCurrentPlaceholder(currentQuery.slice(0, charIndex - 1))
          setCharIndex(charIndex - 1)
        } else {
          setCurrentQueryIndex((prevIndex) => (prevIndex + 1) % placeholderQueries.length)
          setIsTyping(true)
        }
      }
    }, isTyping ? 40 + Math.random() * 30 : 20)
    return () => clearTimeout(typewriterTimer)
  }, [charIndex, isTyping, currentQueryIndex, isFocused, inputValue, placeholderQueries, isChatExpanded])

  useEffect(() => {
    if (chatEndRef.current && isChatExpanded) {
      const chatContainer = chatEndRef.current.closest('.overflow-y-auto')
      if (chatContainer) {
        chatContainer.scrollTop = chatContainer.scrollHeight
      }
    }
  }, [messages, isAiTyping, isChatExpanded, isSearchingMentors])

  const simulateAiResponse = async (userMessage: string, userMessageId: string) => {
    setIsAiTyping(true)
    setCurrentAiMessage("")
    let fullResponseText = "";
    let toolCallDetected = false;
    let toolCallQuery = "";
    let contentToolCallDetected = false;
    let contentToolCallQuery = "";
    let contentToolCallDifficulty: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | undefined;

    try {
      const body = JSON.stringify({
        userMessage,
        history: messages.map(m => ({ type: m.type, content: m.content })),
      });

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });

      if (!res.ok || !res.body) {
        let errorMessage = "Unable to reach AI chat right now.";
        if (res.status === 401) {
          errorMessage = "Please log in to use the AI assistant.";
        } else if (res.status === 403) {
          const backendText = await res.text().catch(() => "");
          errorMessage = backendText || "AI assistant access is not included in your plan.";
        } else if (res.status >= 500) {
          errorMessage = "AI service is unavailable. Please try again shortly.";
        }

        setMessages(prev => [
          ...prev,
          {
            id: uuidv4(),
            type: "ai",
            content: errorMessage,
            timestamp: new Date(),
          },
        ]);
        setIsAiTyping(false);
        return;
      }

      const contentType = res.headers.get('content-type') ?? '';
      let partialJson = "";

      if (contentType.includes('application/json')) {
        const deflectionResponse = await res.json();
        fullResponseText = deflectionResponse.text || "";
        if (deflectionResponse.tool_call?.name === 'find_mentors') {
          toolCallDetected = true;
          toolCallQuery = deflectionResponse.tool_call.arguments?.query ?? "";
        }
        if (deflectionResponse.content_tool_call?.name === 'suggest_content') {
          contentToolCallDetected = true;
          contentToolCallQuery = deflectionResponse.content_tool_call.arguments?.query ?? "";
          contentToolCallDifficulty = deflectionResponse.content_tool_call.arguments?.difficulty;
        }
        setIsChatLimitReached(true);
      } else {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          partialJson += decoder.decode(value, { stream: true });

          try {
            const textMatch = partialJson.match(/"text"\s*:\s*"((?:[^"\\]|\\.)*)"/);
            if (textMatch && textMatch[1]) {
              const streamingText = textMatch[1].replace(/\\n/g, "\n").replace(/\\"/g, '"');
              setCurrentAiMessage(streamingText);
            }

            const finalJson = JSON.parse(partialJson);
            if (finalJson.tool_call?.name === 'find_mentors') {
              toolCallDetected = true;
              toolCallQuery = finalJson.tool_call.arguments?.query ?? "";
            }
            if (finalJson.content_tool_call?.name === 'suggest_content') {
              contentToolCallDetected = true;
              contentToolCallQuery = finalJson.content_tool_call.arguments?.query ?? "";
              contentToolCallDifficulty = finalJson.content_tool_call.arguments?.difficulty;
            }
          } catch (e) {
            // JSON parsing in progress
          }
        }

        try {
          const finalResponse = JSON.parse(partialJson);
          fullResponseText = finalResponse.text || "";
          // Re-check tool calls in final parse in case stream loop missed them
          if (!toolCallDetected && finalResponse.tool_call?.name === 'find_mentors') {
            toolCallDetected = true;
            toolCallQuery = finalResponse.tool_call.arguments?.query ?? "";
          }
          if (!contentToolCallDetected && finalResponse.content_tool_call?.name === 'suggest_content') {
            contentToolCallDetected = true;
            contentToolCallQuery = finalResponse.content_tool_call.arguments?.query ?? "";
            contentToolCallDifficulty = finalResponse.content_tool_call.arguments?.difficulty;
          }
        } catch (e) {
          fullResponseText = currentAiMessage;
        }
      }

      const aiMessage: Message = {
        id: uuidv4(),
        type: 'ai',
        content: fullResponseText,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, aiMessage]);
      await saveMessageToDB('ai', aiMessage.content, userMessageId);

      if (toolCallDetected) {
        const mentors = await fetchMentorsFromApi(true, toolCallQuery);
        if (mentors && mentors.length) {
          await logMentorExposure(mentors.map((mentor) => mentor.id));
        }
      }

      if (contentToolCallDetected) {
        await fetchContentFromApi(contentToolCallQuery || toolCallQuery, contentToolCallDifficulty);
      }

    } catch (err) {
      console.error("AI stream error:", err);
      setCurrentAiMessage("");
      setMessages(prev => [...prev, {
        id: uuidv4(),
        type: 'ai',
        content: 'Sorry, I could not get a response right now.',
        timestamp: new Date()
      }]);
    } finally {
      setIsAiTyping(false)
      setCurrentAiMessage("")
    }
  };

  // Fetch real mentors from your public route
  const fetchMentorsFromApi = async (useAiSearch = false, query?: string): Promise<DbMentor[] | null> => {
    try {
      setIsSearchingMentors(true)
      const requestMentors = async (aiEnabled: boolean) => {
        return trpcClient.public.listMentors.query({
          page: 1,
          pageSize: 12,
          availableOnly: true,
          aiFilterOnly: aiEnabled || undefined,
          q: query || undefined,
        });
      };

      const payload = await requestMentors(useAiSearch);
      const list: DbMentor[] = payload.mentors ?? []
      setDbMentors(list)
      setShowMentors(true)
      setCurrentMentorIndex(0)
      return list
    } catch (e) {
      console.error('Error fetching mentors:', e)
      setMessages(prev => [
        ...prev,
        {
          id: uuidv4(),
          type: 'ai',
          content: 'I couldn\'t load mentors right now. Please try again in a moment.',
          timestamp: new Date(),
        },
      ])
      return null
    } finally {
      setIsSearchingMentors(false)
    }
  }

  const resetChat = () => {
    const newSessionId = uuidv4();
    localStorage.setItem('ai_chatbot_session_id', newSessionId);
    setChatSessionId(newSessionId);
    setMessages([]);
    setInputValue('');
    setIsChatLimitReached(false);
    setDbMentors([]);
    setShowMentors(false);
    setSuggestedContent([]);
    setShowContent(false);
    setCurrentMentorIndex(0);
  };

  const fetchContentFromApi = async (query?: string, difficulty?: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED') => {
    try {
      const baseParams = { limit: 3, sortBy: 'enrollment_count' as const, sortOrder: 'desc' as const };
      const payload = await trpcClient.public.listCourses.query({
        ...baseParams,
        search: query || undefined,
        difficulty: difficulty || undefined,
      });
      const list = (payload?.courses ?? []) as SuggestedCourse[];
      // Only surface courses when relevant results were actually found
      if (list.length > 0) {
        setSuggestedContent(list);
        setShowContent(true);
      }
      return list;
    } catch (e) {
      console.error('Error fetching content:', e);
      return null;
    }
  }

  const handleSubmit = async () => {
    if (inputValue.trim() && !isAiTyping && !isSearchingMentors) {
      if (!isChatExpanded) {
        setIsChatExpanded(true)
        await new Promise(resolve => setTimeout(resolve, 300))
      }

      const currentInput = inputValue.trim()
      const userMessage: Message = {
        id: uuidv4(),
        type: 'user',
        content: currentInput,
        timestamp: new Date()
      }

      setMessages(prev => [...prev, userMessage])
      setInputValue("")

      try {
        await saveMessageToDB('user', currentInput)
      } catch (err: any) {
        const isLimitError = err?.data?.httpStatus === 403;
        const errorContent = isLimitError
          ? "You've reached your chat limit! Let me find the best mentor matches for you instead. 🚀"
          : "Unable to send your message right now. Please try again.";

        setMessages(prev => [...prev, { id: uuidv4(), type: 'ai', content: errorContent, timestamp: new Date() }]);

        if (isLimitError) {
          setIsChatLimitReached(true);
          const mentors = await fetchMentorsFromApi(true, currentInput);
          if (mentors?.length) await logMentorExposure(mentors.map(m => m.id));
          await fetchContentFromApi(currentInput);
        }
        return;
      }

      await simulateAiResponse(currentInput, userMessage.id)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (e.shiftKey) return
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleContainerClick = () => {
    if (!isAiTyping && !isSearchingMentors) {
      textareaRef.current?.focus()
    }
  }

  const nextMentors = () => {
    setCurrentMentorIndex((prev) => Math.min(prev + 3, Math.max(dbMentors.length - 3, 0)))
  }

  const prevMentors = () => {
    setCurrentMentorIndex((prev) => Math.max(prev - 3, 0))
  }

  useEffect(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      const scrollHeight = textarea.scrollHeight
      const maxHeight = 120
      const newHeight = Math.min(Math.max(56, scrollHeight), maxHeight)
      textarea.style.height = newHeight + 'px'
      textarea.style.overflowY = scrollHeight > maxHeight ? 'auto' : 'hidden'
    }
  }, [inputValue])

  const visibleMentors = dbMentors.slice(currentMentorIndex, currentMentorIndex + 3)
  const canGoNext = currentMentorIndex + 3 < dbMentors.length
  const canGoPrev = currentMentorIndex > 0

  useEffect(() => {
    if (showMentors && mentorsSectionRef.current) {
      mentorsSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [showMentors])

  useEffect(() => {
    if (isChatExpanded && chatContainerRef.current) {
      setTimeout(() => {
        chatContainerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 100)
    }
  }, [isChatExpanded])

  const parseExpertise = (exp: string | null) =>
    (exp ?? "")
      .split(/[,;]\s*/g)
      .map(s => s.trim())
      .filter(Boolean)
      .slice(0, 4)

  const formatRate = (rate: string | null, curr: string | null) => {
    if (!rate) return null
    const n = Number(rate)
    if (Number.isNaN(n)) return null
    return `${curr ?? 'USD'} ${n.toFixed(0)}/hr`
  }

  const getInitials = (name?: string | null) => {
    if (!name) return "?"
    const parts = name.trim().split(/\s+/)
    const first = parts[0]?.[0] ?? ""
    const last = parts.length > 1 ? parts[parts.length - 1][0] : ""
    return (first + last).toUpperCase() || "?"
  }

  return (
    <>
      {/* Hero Section */}
      <section ref={heroRef} className="relative min-h-[90vh] flex items-center overflow-hidden">
        {/* Gradient Background */}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
          {/* Animated gradient orbs */}
          <div className="absolute top-1/4 -left-20 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl animate-pulse" />
          <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-purple-600/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-indigo-600/10 rounded-full blur-3xl" />

          {/* Grid pattern overlay */}
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0wIDBoNDB2NDBoLTQweiIvPjxwYXRoIGQ9Ik00MCAwdjQwIiBzdHJva2U9InJnYmEoMjU1LDI1NSwyNTUsMC4wMykiIHN0cm9rZS13aWR0aD0iMSIvPjxwYXRoIGQ9Ik0wIDQwaDQwIiBzdHJva2U9InJnYmEoMjU1LDI1NSwyNTUsMC4wMykiIHN0cm9rZS13aWR0aD0iMSIvPjwvZz48L3N2Zz4=')] opacity-40" />
        </div>

        <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-20">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">

            {/* Left Content */}
            <div className="text-center lg:text-left">
              {/* Badge */}
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 backdrop-blur-sm mb-8">
                <Sparkles className="w-4 h-4 text-yellow-400" />
                <span className="text-sm font-medium text-slate-300">AI-Powered Mentorship Platform</span>
              </div>

              {/* Headline */}
              <h1 className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-bold text-white mb-6 leading-tight tracking-tight">
                Transform Your{' '}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400">
                  Career
                </span>
                <br />
                With Expert Mentors
              </h1>

              {/* Subheadline */}
              <p className="text-lg sm:text-xl text-slate-400 mb-8 max-w-xl mx-auto lg:mx-0 leading-relaxed">
                Connect with industry leaders, get personalized guidance, and accelerate your professional growth with 1-on-1 mentorship.
              </p>

              {/* Trust Badges */}
              <div className="flex flex-wrap items-center justify-center lg:justify-start gap-6 mb-10">
                <div className="flex items-center gap-2">
                  <div className="flex -space-x-2">
                    {[1, 2, 3, 4].map((i) => (
                      <div key={i} className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 border-2 border-slate-900 flex items-center justify-center text-xs text-white font-medium">
                        {i}K
                      </div>
                    ))}
                  </div>
                  <span className="text-sm text-slate-400">10,000+ Professionals</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Star key={i} className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                    ))}
                  </div>
                  <span className="text-sm text-slate-400">4.9/5 Rating</span>
                </div>
              </div>

              {/* CTA Buttons */}
              <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4">
                <Button
                  size="lg"
                  className="w-full sm:w-auto bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold px-8 py-6 rounded-xl shadow-lg shadow-blue-500/25 hover:shadow-xl hover:shadow-blue-500/30 transition-all duration-300 group"
                  onClick={() => router.push('/auth?mode=signup')}
                >
                  Get Started Free
                  <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  className="w-full sm:w-auto border-white/20 text-white hover:bg-white/10 px-8 py-6 rounded-xl backdrop-blur-sm"
                  onClick={() => router.push('/auth?mode=signin')}
                >
                  <Play className="w-5 h-5 mr-2" />
                  Watch Demo
                </Button>
              </div>
            </div>

            {/* Right Content - AI Chat */}
            <div className="w-full max-w-xl mx-auto lg:mx-0">
              <div
                ref={chatContainerRef}
                className={`relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl shadow-2xl transition-all duration-500 ${isChatExpanded ? 'h-[500px]' : 'h-auto'
                  } ${isFocused ? 'ring-2 ring-blue-500/50 border-blue-500/30' : ''}`}
                onClick={handleContainerClick}
              >
                {/* Glow effect */}
                <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 via-transparent to-purple-500/10 pointer-events-none" />

                {/* Chat Header */}
                <div className="relative flex items-center gap-3 px-6 py-4 border-b border-white/10 bg-white/5">
                  <div className="relative">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg">
                      <Sparkles className="w-5 h-5 text-white" />
                    </div>
                    <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-slate-900" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">AI Career Advisor</h3>
                    <p className="text-xs text-slate-400">Online • Ready to help</p>
                  </div>
                  <div className="ml-auto">
                    <Badge variant="secondary" className="bg-green-500/20 text-green-400 border-green-500/30 text-xs">
                      <Zap className="w-3 h-3 mr-1" />
                      Powered by AI
                    </Badge>
                  </div>
                </div>

                {/* Chat Messages Area */}
                {isChatExpanded && (
                  <div className="h-[340px] overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                    {messages.map((message) => (
                      <div key={message.id} className={`flex gap-3 ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}>
                        {message.type === 'ai' && (
                          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center flex-shrink-0">
                            <Bot className="w-4 h-4 text-white" />
                          </div>
                        )}
                        <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${message.type === 'user'
                            ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-br-md'
                            : 'bg-white/10 text-slate-200 rounded-bl-md'
                          }`}>
                          <p className="text-sm leading-relaxed">{message.content}</p>
                        </div>
                      </div>
                    ))}

                    {/* AI Thinking */}
                    {isAiTyping && !currentAiMessage && (
                      <div className="flex gap-3 justify-start">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center flex-shrink-0">
                          <Bot className="w-4 h-4 text-white" />
                        </div>
                        <div className="bg-white/10 text-slate-200 rounded-2xl rounded-bl-md px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="text-sm">Thinking</span>
                            <div className="flex gap-1">
                              {[0, 1, 2].map((i) => (
                                <div key={i} className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Streaming text */}
                    {isAiTyping && currentAiMessage && (
                      <div className="flex gap-3 justify-start">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center flex-shrink-0">
                          <Bot className="w-4 h-4 text-white" />
                        </div>
                        <div className="max-w-[80%] bg-white/10 text-slate-200 rounded-2xl rounded-bl-md px-4 py-3">
                          <p className="text-sm leading-relaxed">
                            {currentAiMessage}
                            <span className="animate-pulse text-blue-400">|</span>
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Searching mentors */}
                    {isSearchingMentors && (
                      <div className="flex gap-3 justify-start">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center flex-shrink-0">
                          <Search className="w-4 h-4 text-white animate-pulse" />
                        </div>
                        <div className="bg-white/10 text-slate-200 rounded-2xl rounded-bl-md px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="text-sm">Finding mentors for you</span>
                            <div className="flex gap-1">
                              {[0, 1, 2].map((i) => (
                                <div key={i} className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    <div ref={chatEndRef} />
                  </div>
                )}

                {/* Chat Input */}
                <div className={`relative p-4 ${isChatExpanded ? 'border-t border-white/10 bg-white/5' : ''}`}>
                  <div className="relative flex items-end gap-3">
                    <div className="flex-1 relative">
                      <textarea
                        ref={textareaRef}
                        placeholder=""
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onFocus={() => setIsFocused(true)}
                        onBlur={() => setIsFocused(false)}
                        onKeyDown={handleKeyPress}
                        rows={1}
                        disabled={isAiTyping || isSearchingMentors || isChatLimitReached}
                        className={`w-full bg-white/5 border border-white/10 text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 rounded-xl px-4 py-3.5 text-base resize-none transition-all ${isChatExpanded ? 'min-h-[44px]' : 'min-h-[56px] text-lg'
                          } disabled:opacity-50`}
                        style={{ scrollbarWidth: 'none' }}
                      />
                      {/* Animated placeholder */}
                      {!inputValue && !isFocused && !isChatLimitReached && (
                        <div className="absolute inset-0 flex items-center px-4 pointer-events-none">
                          <span className={`text-slate-500 ${isChatExpanded ? 'text-base' : 'text-lg'}`}>
                            {currentPlaceholder}
                            <span className="animate-pulse text-blue-400">|</span>
                          </span>
                        </div>
                      )}
                      {isChatLimitReached && (
                        <div className="absolute inset-0 flex items-center px-4 pointer-events-none">
                          <span className="text-slate-500 text-sm">Connect with a mentor to continue your journey</span>
                        </div>
                      )}
                    </div>
                    {isChatLimitReached ? (
                      <Button
                        onClick={resetChat}
                        className="h-12 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white text-sm shadow-lg shadow-blue-500/25 whitespace-nowrap"
                      >
                        New Chat
                      </Button>
                    ) : (
                      <Button
                        onClick={handleSubmit}
                        disabled={!inputValue.trim() || isAiTyping || isSearchingMentors}
                        className={`h-12 w-12 rounded-xl transition-all duration-300 ${inputValue.trim() && !isAiTyping && !isSearchingMentors
                            ? 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-lg shadow-blue-500/25'
                            : 'bg-white/10 text-slate-500'
                          }`}
                      >
                        <Send className="w-5 h-5" />
                      </Button>
                    )}
                  </div>

                  {/* Hints */}
                  {!isChatExpanded && (
                    <div className="flex items-center justify-between mt-3 px-1">
                      <span className="text-xs text-slate-500">Ask anything about your career</span>
                      <span className="text-xs text-slate-500">Press Enter ↵</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Feature pills below chat */}
              {!isChatExpanded && (
                <div className="flex flex-wrap items-center justify-center lg:justify-start gap-3 mt-6">
                  {['Career Advice', 'Resume Review', 'Interview Prep', 'Skill Roadmaps'].map((feature) => (
                    <span key={feature} className="px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs text-slate-400">
                      {feature}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Mentor Recommendations */}
      {showMentors && (
        <section ref={mentorsSectionRef} className="w-full px-4 sm:px-6 lg:px-8 py-12 bg-slate-900/50 border-t border-white/5">
          <div className="max-w-7xl mx-auto">
            <Card className="bg-white/5 backdrop-blur-xl rounded-2xl p-6 border border-white/10">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-6">
                <div>
                  <h2 className="text-xl font-semibold text-white">Recommended Mentors</h2>
                  <p className="text-sm text-slate-400">Based on your interests</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    onClick={prevMentors}
                    disabled={!canGoPrev}
                    className={`rounded-full p-2 text-white hover:bg-white/10 ${!canGoPrev ? 'opacity-30 cursor-not-allowed' : ''}`}
                  >
                    <ArrowLeftCircle className="h-6 w-6" />
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={nextMentors}
                    disabled={!canGoNext}
                    className={`rounded-full p-2 text-white hover:bg-white/10 ${!canGoNext ? 'opacity-30 cursor-not-allowed' : ''}`}
                  >
                    <ArrowRightCircle className="h-6 w-6" />
                  </Button>
                </div>
              </div>

              {dbMentors.length === 0 ? (
                <div className="text-center text-slate-400 py-12">
                  No mentors found right now.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {visibleMentors.map((m) => {
                    const chips = parseExpertise(m.expertise)
                    const rate = formatRate(m.hourlyRate, m.currency)

                    return (
                      <div
                        key={m.id}
                        className="group rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 overflow-hidden transition-all duration-300 cursor-pointer hover:border-blue-500/30"
                        onClick={() => handleBookIntroCall(m.id)}
                      >
                        <div className="p-5 flex flex-col gap-4">
                          <div className="flex items-start gap-4">
                            <div className="relative">
                              {m.image ? (
                                <img
                                  src={m.image}
                                  alt={m.name ?? 'Mentor'}
                                  className="w-14 h-14 rounded-xl object-cover border-2 border-white/10"
                                />
                              ) : (
                                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold text-lg">
                                  {getInitials(m.name)}
                                </div>
                              )}
                              <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-slate-900" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <h3 className="font-semibold text-white truncate">{m.name ?? 'Mentor'}</h3>
                              <p className="text-sm text-slate-400 truncate">{m.title || 'Expert Mentor'}</p>
                              {m.company && <p className="text-xs text-slate-500 truncate">@ {m.company}</p>}
                            </div>
                          </div>

                          {chips.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                              {chips.map((chip, i) => (
                                <span key={i} className="px-2 py-1 rounded-md bg-blue-500/10 text-blue-400 text-xs border border-blue-500/20">
                                  {chip}
                                </span>
                              ))}
                            </div>
                          )}

                          <div className="flex items-center justify-between pt-3 border-t border-white/10">
                            <div className="flex items-center gap-2 text-sm text-slate-400">
                              <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                              <span>5.0</span>
                              <span className="text-slate-600">•</span>
                              <span>{m.experience || 0}+ yrs</span>
                            </div>
                            {rate && (
                              <span className="text-sm font-semibold text-white">{rate}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </Card>
          </div>
        </section>
      )}

      {showContent && suggestedContent.length > 0 && (
        <section className="w-full px-4 sm:px-6 lg:px-8 py-12 bg-slate-900/50 border-t border-white/5">
          <div className="max-w-7xl mx-auto">
            <Card className="bg-white/5 backdrop-blur-xl rounded-2xl p-6 border border-white/10">
              <div className="flex items-center gap-3 mb-6">
                <Sparkles className="w-5 h-5 text-purple-400" />
                <div>
                  <h2 className="text-xl font-semibold text-white">Recommended Resources</h2>
                  <p className="text-sm text-slate-400">Courses and content matched to your goal</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {suggestedContent.map((course) => {
                  const difficultyColors: Record<string, string> = {
                    BEGINNER: 'text-green-400 border-green-500/20 bg-green-500/10',
                    INTERMEDIATE: 'text-yellow-400 border-yellow-500/20 bg-yellow-500/10',
                    ADVANCED: 'text-red-400 border-red-500/20 bg-red-500/10',
                  }
                  const difficultyClass = course.difficulty ? difficultyColors[course.difficulty] : 'text-slate-400 border-white/10 bg-white/5'
                  const price = course.price && parseFloat(course.price) > 0
                    ? `${course.currency ?? 'USD'} ${parseFloat(course.price).toFixed(0)}`
                    : 'Free'

                  return (
                    <a
                      key={course.id}
                      href={`/courses/${course.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 overflow-hidden transition-all duration-300 hover:border-purple-500/30 flex flex-col cursor-pointer"
                    >
                      {course.thumbnailUrl ? (
                        <img
                          src={course.thumbnailUrl}
                          alt={course.title ?? ''}
                          className="w-full h-36 object-cover"
                        />
                      ) : (
                        <div className="w-full h-36 bg-gradient-to-br from-purple-600/30 to-blue-600/30 flex items-center justify-center">
                          <Sparkles className="w-8 h-8 text-purple-400 opacity-50" />
                        </div>
                      )}

                      <div className="p-4 flex flex-col gap-3 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-semibold text-white text-sm leading-snug line-clamp-2">
                            {course.title ?? 'Untitled Course'}
                          </h3>
                          {course.difficulty && (
                            <span className={`shrink-0 px-2 py-0.5 rounded-md text-xs border ${difficultyClass}`}>
                              {course.difficulty}
                            </span>
                          )}
                        </div>

                        {course.description && (
                          <p className="text-xs text-slate-400 line-clamp-2">{course.description}</p>
                        )}

                        {course.mentor?.name && (
                          <p className="text-xs text-slate-500">By {course.mentor.name}</p>
                        )}

                        <div className="flex items-center justify-between pt-3 border-t border-white/10 mt-auto">
                          <div className="flex items-center gap-1.5 text-xs text-slate-400">
                            <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />
                            <span>{Number(course.avgRating).toFixed(1)}</span>
                            {course.enrollmentCount ? (
                              <>
                                <span className="text-slate-600">•</span>
                                <span>{course.enrollmentCount} enrolled</span>
                              </>
                            ) : null}
                          </div>
                          <span className="text-sm font-semibold text-white">{price}</span>
                        </div>
                      </div>
                    </a>
                  )
                })}
              </div>
            </Card>
          </div>
        </section>
      )}

      {/* Mentor Detail Modal */}
      <Dialog open={isMentorModalOpen} onOpenChange={setIsMentorModalOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-4xl max-h-[90vh] overflow-y-auto p-0">
          {selectedMentorIdForModal && (
            <div className="pl-8 pr-12 pt-0 w-full mx-auto">
              <MentorDetailView
                mentorId={selectedMentorIdForModal}
                bookingSource="ai"
                onBack={() => {
                  setIsMentorModalOpen(false)
                  setSelectedMentorIdForModal(null)
                }}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Sign In Popup */}
      <SignInPopup
        isOpen={showSignInPopup}
        onClose={() => setShowSignInPopup(false)}
      />
    </>
  )
}
