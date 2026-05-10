"use client"

import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"
import {
  ArrowLeft,
  MapPin,
  Clock,
  Briefcase,
  Linkedin,
  Github,
  Globe,
  Share2,
  MessageSquare,
  Sparkles,
  Award,
  CheckCircle,
  MoreHorizontal,
  Star,
  Quote,
  Medal,
  Calendar,
  Trophy,
  Zap,
  ExternalLink,
  Mail,
  ChevronRight,
  FileText,
  Link2,
  BookOpen,
  Download,
  GraduationCap,
  Users,
  PlayCircle
} from "lucide-react"
import { useMentorDetail } from "@/hooks/use-mentor-detail"
import { BookingModal } from "@/components/booking/booking-modal"
import { MessageRequestModal } from "@/components/messaging/message-request-modal"
import { useAuth } from "@/contexts/auth-context"
import { toast } from "sonner"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { ContentDetailDialog } from "@/components/mentee/content-detail-dialog"
import { useTRPCClient } from "@/lib/trpc/react"
import {
  getMessagingAccessDecision,
  MESSAGING_ACCESS_INTENTS,
} from "@/lib/messaging/access-policy"

interface MentorDetailViewProps {
  mentorId: string | null
  onBack: () => void
  bookingSource?: 'explore' | 'ai' | 'default'
}

type TabType = "overview" | "content" | "reviews" | "achievements" | "mentoring_style"

export function MentorDetailView({ mentorId, onBack, bookingSource = 'default' }: MentorDetailViewProps) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const urlSource = searchParams.get('from')
  const resolvedSource = bookingSource === 'default' && urlSource === 'explore' ? 'explore' : bookingSource
  const { mentor, loading, error } = useMentorDetail(mentorId)
  const { session, isAdmin, mentorAccess, menteeAccess, primaryRole } = useAuth()
  const trpcClient = useTRPCClient()
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false)
  const [isMessageModalOpen, setIsMessageModalOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<TabType>("overview")
  const [selectedContentItem, setSelectedContentItem] = useState<any>(null)
  const [isContentDetailOpen, setIsContentDetailOpen] = useState(false)

  const { data: mentorContentItems, isLoading: isContentLoading } = useQuery({
    queryKey: ['public', 'mentor-content', mentor?.id],
    queryFn: () => trpcClient.public.getMentorPublicContent.query({ mentorId: mentor!.id }),
    enabled: !!mentor?.id,
    staleTime: 5 * 60 * 1000,
  })
  const preferredAudience =
    primaryRole?.name === 'mentor' || primaryRole?.name === 'mentee'
      ? primaryRole.name
      : null
  const messageMentorAccess = getMessagingAccessDecision(
    {
      isAdmin,
      mentorAccess,
      menteeAccess,
      preferredAudience,
    },
    MESSAGING_ACCESS_INTENTS.messageRequests,
    'mentee'
  )
  const isMessageMentorEnabled = Boolean(session?.user?.id && messageMentorAccess.allowed)

  const handleBookSession = () => {
    if (!session) {
      toast.error("Please log in to book a session")
      return
    }
    setIsBookingModalOpen(true)
  }

  const handleSendMessage = () => {
    if (!session) {
      toast.error("Please log in to send a message")
      return
    }
    setIsMessageModalOpen(true)
  }

  const handleMessageSuccess = () => {
    toast.success("Message request sent successfully! The mentor will be notified.")
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
        <div className="h-64 bg-slate-900 animate-pulse relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-slate-900 to-slate-800" />
        </div>
        <div className="max-w-7xl mx-auto px-4 mt-8">
          <div className="flex flex-col md:flex-row gap-8">
            <div className="md:w-2/3 space-y-6">
              <Skeleton className="w-1/2 h-10" />
              <Skeleton className="w-full h-8" />
              <div className="space-y-4 mt-8">
                <Skeleton className="w-full h-40 rounded-xl" />
                <Skeleton className="w-full h-40 rounded-xl" />
              </div>
            </div>
            <div className="md:w-1/3">
              <Skeleton className="w-full h-80 rounded-xl" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (error || !mentor) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center px-4">
        <div className="bg-red-50 p-4 rounded-full mb-4">
          <Zap className="w-8 h-8 text-red-500" />
        </div>
        <p className="text-xl font-medium text-gray-900 mb-2">{error || "Mentor not found"}</p>
        <p className="text-gray-500 mb-6">We couldn't locate the profile you are looking for.</p>
        <Button onClick={onBack} variant="outline">Go Back</Button>
      </div>
    )
  }

  const initials = mentor.name?.split(' ').map(n => n[0]).join('').substring(0, 2) || 'M';

  // --- ANIMATION VARIANTS ---
  const fadeIn = {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -10 },
    transition: { duration: 0.3 }
  }

  const staggerContainer = {
    animate: { transition: { staggerChildren: 0.1 } }
  }

  // --- SUB-COMPONENT RENDERS ---

  const renderOverview = () => (
    <motion.div variants={staggerContainer} initial="initial" animate="animate" className="space-y-8">
      {/* About Section */}
      <motion.section variants={fadeIn} className="relative">
        {mentor.headline && (
          <div className="relative pl-6 border-l-4 border-blue-500/30 dark:border-blue-400/30 py-1 mb-6">
            <h3 className="text-2xl font-medium text-slate-800 dark:text-slate-100 leading-snug italic">
              "{mentor.headline}"
            </h3>
          </div>
        )}
        <div className="prose prose-slate dark:prose-invert max-w-none leading-relaxed text-muted-foreground">
          <p className="whitespace-pre-wrap">{mentor.about || "This mentor hasn't added a bio yet."}</p>
        </div>
      </motion.section>

      {/* Background / Insights Card */}
      <motion.div variants={fadeIn}>
        <Card className="border-border shadow-sm rounded-xl overflow-hidden bg-card">
          <div className="px-6 py-4 border-b border-border bg-muted/50 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-blue-500" />
            <h3 className="font-semibold text-card-foreground">Professional Background</h3>
          </div>
          <CardContent className="p-0">
            {/* Expertise Row */}
            <div className="group flex flex-col sm:flex-row sm:items-start p-6 border-b border-border hover:bg-muted/50 transition-colors">
              <div className="w-full sm:w-1/3 mb-2 sm:mb-0">
                <span className="text-sm font-medium text-muted-foreground">Core Expertise</span>
              </div>
              <div className="w-full sm:w-2/3 flex flex-wrap gap-2">
                {mentor.expertiseArray && mentor.expertiseArray.length > 0 ? (
                  mentor.expertiseArray.map((skill, i) => (
                    <Badge key={i} variant="secondary" className="bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-300 border border-blue-100 dark:border-blue-900/30 px-3 py-1">
                      {skill}
                    </Badge>
                  ))
                ) : (
                  <span className="text-slate-400 text-sm italic">Not specified</span>
                )}
              </div>
            </div>

            {/* Industry Row */}
            <div className="group flex flex-col sm:flex-row sm:items-center p-6 border-b border-border hover:bg-muted/50 transition-colors">
              <div className="w-full sm:w-1/3 mb-2 sm:mb-0">
                <span className="text-sm font-medium text-muted-foreground">Industry</span>
              </div>
              <div className="w-full sm:w-2/3">
                <div className="flex items-center gap-2">
                  <Briefcase className="w-4 h-4 text-muted-foreground" />
                  <span className="text-foreground font-medium">{mentor.industry || 'Tech'}</span>
                </div>
              </div>
            </div>

            {/* Location Row */}
            <div className="group flex flex-col sm:flex-row sm:items-center p-6 hover:bg-muted/50 transition-colors">
              <div className="w-full sm:w-1/3 mb-2 sm:mb-0">
                <span className="text-sm font-medium text-muted-foreground">Location</span>
              </div>
              <div className="w-full sm:w-2/3">
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-muted-foreground" />
                  <span className="text-foreground font-medium">{[mentor.city, mentor.country].filter(Boolean).join(', ') || 'Remote'}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Experience Section */}
      <motion.section variants={fadeIn}>
        <h3 className="text-lg font-bold text-foreground mb-6 flex items-center gap-2">
          Experience <div className="h-px bg-border flex-1 ml-2"></div>
        </h3>

        <div className="space-y-6">
          {/* Current Role Item */}
          <div className="flex gap-4 group">
            <div className="mt-1">
              <div className="w-12 h-12 bg-card border border-border rounded-xl flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform">
                <Briefcase className="w-6 h-6 text-muted-foreground" />
              </div>
            </div>
            <div>
              <h4 className="text-lg font-semibold text-foreground group-hover:text-blue-600 transition-colors">{mentor.title}</h4>
              <p className="text-sm text-muted-foreground font-medium">{mentor.company}</p>
              <div className="flex items-center gap-2 mt-2">
                <Badge variant="outline" className="text-[10px] uppercase tracking-wide border-green-200 text-green-700 bg-green-50 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800">Current Role</Badge>
              </div>
            </div>
          </div>

          {/* Total Experience Summary */}
          <div className="flex gap-4 group">
            <div className="mt-1">
              <div className="w-12 h-12 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-xl flex items-center justify-center group-hover:scale-105 transition-transform">
                <Clock className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
            <div className="flex flex-col justify-center">
              <h4 className="text-lg font-semibold text-foreground">Industry Veteran</h4>
              <p className="text-sm text-muted-foreground">{mentor.experience}+ years of total experience</p>
            </div>
          </div>
        </div>
      </motion.section>
    </motion.div>
  )

  const formatFileSize = (bytes: number | null | undefined) => {
    if (!bytes) return ''
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const getContentTypeIcon = (type: string) => {
    switch (type) {
      case 'COURSE': return <BookOpen className="w-5 h-5" />
      case 'FILE': return <FileText className="w-5 h-5" />
      case 'URL': return <Link2 className="w-5 h-5" />
      default: return <FileText className="w-5 h-5" />
    }
  }

  const getContentTypeBadge = (type: string) => {
    switch (type) {
      case 'COURSE': return { label: 'Course', className: 'bg-purple-50 text-purple-700 border-purple-100 dark:bg-purple-900/20 dark:text-purple-300 dark:border-purple-900/30' }
      case 'FILE': return { label: 'File', className: 'bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-900/30' }
      case 'URL': return { label: 'Link', className: 'bg-sky-50 text-sky-700 border-sky-100 dark:bg-sky-900/20 dark:text-sky-300 dark:border-sky-900/30' }
      default: return { label: type, className: 'bg-slate-50 text-slate-700 border-slate-100' }
    }
  }

  const renderContent = () => {
    if (isContentLoading) {
      return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="w-full h-32 rounded-xl" />
          ))}
        </motion.div>
      )
    }

    if (!mentorContentItems || mentorContentItems.length === 0) {
      return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-foreground">Shared Content</h3>
          </div>
          <div className="bg-muted/50 border-2 border-dashed border-border rounded-2xl p-12 text-center">
            <div className="bg-card w-16 h-16 rounded-full shadow-sm flex items-center justify-center mx-auto mb-4">
              <BookOpen className="w-8 h-8 text-muted-foreground/50" />
            </div>
            <h4 className="text-lg font-semibold text-foreground mb-2">No content shared yet</h4>
            <p className="text-muted-foreground max-w-sm mx-auto">
              This mentor hasn&apos;t shared any courses, files, or resources on their profile yet.
            </p>
          </div>
        </motion.div>
      )
    }

    return (
      <motion.div variants={staggerContainer} initial="initial" animate="animate" className="space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-foreground">Shared Content</h3>
          <Badge variant="outline" className="text-muted-foreground">
            {mentorContentItems.length} item{mentorContentItems.length !== 1 ? 's' : ''}
          </Badge>
        </div>

        <div className="space-y-4">
          {mentorContentItems.map((item: any) => {
            const typeBadge = getContentTypeBadge(item.type)

            return (
              <motion.div key={item.id} variants={fadeIn}>
                <Card
                  className={cn(
                    "border-border shadow-sm rounded-xl overflow-hidden hover:shadow-md transition-shadow group",
                    (item.type === 'COURSE' && item.course?.courseId) && 'cursor-pointer',
                    (item.type === 'FILE' || item.type === 'URL') && 'cursor-pointer'
                  )}
                  onClick={() => {
                    if (item.type === 'COURSE' && item.course?.courseId) {
                      router.push(`/dashboard?section=courses&courseId=${item.course.courseId}`)
                    } else if (item.type === 'FILE' || item.type === 'URL') {
                      setSelectedContentItem(item)
                      setIsContentDetailOpen(true)
                    }
                  }}
                >
                  <CardContent className="p-0">
                    <div className="flex gap-4 p-5">
                      {/* Type Icon */}
                      <div className={cn(
                        "w-12 h-12 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105",
                        item.type === 'COURSE' ? 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400' :
                        item.type === 'FILE' ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400' :
                        'bg-sky-100 text-sky-600 dark:bg-sky-900/30 dark:text-sky-400'
                      )}>
                        {getContentTypeIcon(item.type)}
                      </div>

                      {/* Content Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h4 className="font-semibold text-foreground truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                              {item.title}
                            </h4>
                            {item.description && (
                              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                                {item.description}
                              </p>
                            )}
                          </div>
                          <Badge variant="outline" className={cn('shrink-0 text-xs border', typeBadge.className)}>
                            {typeBadge.label}
                          </Badge>
                        </div>

                        {/* Course-specific metadata */}
                        {item.type === 'COURSE' && item.course && (
                          <div className="flex flex-wrap items-center gap-3 mt-3 text-xs text-muted-foreground">
                            {item.course.difficulty && (
                              <span className="flex items-center gap-1">
                                <GraduationCap className="w-3.5 h-3.5" />
                                {item.course.difficulty.charAt(0) + item.course.difficulty.slice(1).toLowerCase()}
                              </span>
                            )}
                            {item.course.duration && (
                              <span className="flex items-center gap-1">
                                <Clock className="w-3.5 h-3.5" />
                                {item.course.duration} min
                              </span>
                            )}
                            {(item.course.enrollmentCount ?? 0) > 0 && (
                              <span className="flex items-center gap-1">
                                <Users className="w-3.5 h-3.5" />
                                {item.course.enrollmentCount} enrolled
                              </span>
                            )}
                            {item.course.price && Number(item.course.price) > 0 && (
                              <span className="font-semibold text-foreground">
                                {item.course.currency === 'INR' ? '₹' : '$'}{item.course.price}
                              </span>
                            )}
                            {item.course.tags && item.course.tags.length > 0 && (
                              <div className="flex gap-1.5">
                                {item.course.tags.slice(0, 3).map((tag: string, i: number) => (
                                  <Badge key={i} variant="secondary" className="text-[10px] px-1.5 py-0">{tag}</Badge>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {/* File-specific metadata */}
                        {item.type === 'FILE' && (
                          <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
                            {item.fileName && (
                              <span className="truncate max-w-[200px]">{item.fileName}</span>
                            )}
                            {item.fileSize && (
                              <span>{formatFileSize(item.fileSize)}</span>
                            )}
                            {item.fileUrl && (
                              <a
                                href={item.fileUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline font-medium"
                              >
                                <Download className="w-3.5 h-3.5" />
                                View
                              </a>
                            )}
                          </div>
                        )}

                        {/* URL-specific metadata */}
                        {item.type === 'URL' && (
                          <div className="mt-3">
                            {item.urlTitle && (
                              <p className="text-sm font-medium text-foreground">{item.urlTitle}</p>
                            )}
                            {item.urlDescription && (
                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{item.urlDescription}</p>
                            )}
                            {item.url && (
                              <a
                                href={item.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium mt-2"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                                Open link
                              </a>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )
          })}
        </div>

        <ContentDetailDialog
          item={selectedContentItem}
          open={isContentDetailOpen}
          onOpenChange={setIsContentDetailOpen}
        />
      </motion.div>
    )
  }

  const renderAchievements = () => {
    // Mock Data for Achievements
    const milestones = [
      { id: 1, title: "1000 Mentorship Minutes", date: "Sep 2025", icon: "🔥", color: "bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400" },
      { id: 2, title: "500 Mentorship Minutes", date: "May 2025", icon: "💎", color: "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400" },
      { id: 3, title: "Top Rated Mentor", date: "Oct 2025", icon: "⭐", color: "bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400" },
    ]

    return (
      <motion.div variants={staggerContainer} initial="initial" animate="animate" className="space-y-10">
        <div className="grid grid-cols-1 gap-8">
          <motion.div variants={fadeIn}>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-6">Milestones & Impact</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {milestones.map((milestone) => (
                <motion.div
                  whileHover={{ y: -4 }}
                  key={milestone.id}
                  className="flex items-center gap-4 p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-sm"
                >
                  <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0", milestone.color)}>
                    {milestone.icon}
                  </div>
                  <div>
                    <h4 className="font-semibold text-slate-900 dark:text-white text-sm">{milestone.title}</h4>
                    <p className="text-xs text-slate-500 mt-1">Achieved {milestone.date}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </motion.div>
    )
  }

  const renderReviews = () => (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white">Mentee Reviews</h3>
        <Badge variant="outline" className="text-slate-500">0 Verified Reviews</Badge>
      </div>

      <div className="bg-slate-50 dark:bg-slate-900/50 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl p-12 text-center">
        <div className="bg-white dark:bg-slate-800 w-16 h-16 rounded-full shadow-sm flex items-center justify-center mx-auto mb-4">
          <MessageSquare className="w-8 h-8 text-slate-300 dark:text-slate-600" />
        </div>
        <h4 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">No reviews yet</h4>
        <p className="text-slate-500 max-w-sm mx-auto mb-6">
          This mentor is new to the platform or hasn't received reviews yet. Be the first to share your experience!
        </p>
        <Button onClick={handleBookSession} variant="default" className="shadow-lg shadow-blue-500/20">
          Book a Session
        </Button>
      </div>
    </motion.div>
  )

  const renderMentoringStyle = () => (
    <motion.div variants={staggerContainer} initial="initial" animate="animate" className="space-y-6">
      <h3 className="text-lg font-bold text-slate-900 dark:text-white">Mentoring Approach</h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <motion.div variants={fadeIn} className="h-full">
          <Card className="h-full border-l-4 border-l-yellow-400 shadow-sm hover:shadow-md transition-shadow">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Zap className="w-4 h-4 text-yellow-500 fill-yellow-500" /> Superpowers
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {["Active Listener", "Career Strategist", "Technical Deep-dives", "Empathetic"].map((tag) => (
                  <Badge key={tag} variant="secondary" className="bg-yellow-50 text-yellow-800 hover:bg-yellow-100 border-yellow-100 dark:bg-yellow-900/20 dark:text-yellow-300 dark:border-yellow-900/30">
                    {tag}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={fadeIn} className="h-full">
          <Card className="h-full border-l-4 border-l-blue-500 shadow-sm hover:shadow-md transition-shadow">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Quote className="w-4 h-4 text-blue-500 fill-blue-500" /> Communication Style
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed italic">
                "I prefer a direct yet supportive approach. I like to ask questions that help you find the answer yourself, rather than just giving you the solution."
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </motion.div>
  )

  return (
    <div className="min-h-screen bg-background pb-20 font-sans selection:bg-blue-100 selection:text-blue-900">

      {/* 1. HERO SECTION */}
      <div className="relative">
        {/* Banner Container */}
        <div className="relative h-64 md:h-80 w-full overflow-hidden bg-card group">
          {/* Navigation Overlay */}
          <div className="absolute top-6 left-0 right-0 z-20 px-4 sm:px-6 lg:px-8">
            <div className="max-w-7xl mx-auto flex justify-between items-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={onBack}
                className="bg-black/20 hover:bg-black/40 text-white backdrop-blur-sm transition-all rounded-full px-4 border border-white/10"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Explore
              </Button>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="bg-black/20 hover:bg-black/40 text-white backdrop-blur-sm rounded-full border border-white/10"
                >
                  <Share2 className="w-5 h-5" />
                </Button>
              </div>
            </div>
          </div>

          {/* Banner Image */}
          {mentor.bannerImageUrl ? (
            <img
              src={mentor.bannerImageUrl}
              alt="Cover"
              className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-r from-blue-600 to-purple-600 relative">
              <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-soft-light pointer-events-none"></div>
              {/* Decorative abstracts */}
              <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>
            </div>
          )}

          {/* Very light corner vignettes if desired, barely visible */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/5 pointer-events-none"></div>
        </div>

        {/* Profile Content Container (Overlapping) */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 pb-6">
          <div className="flex flex-col md:flex-row gap-6 items-start">

            {/* Avatar - Pull up using negative margin */}
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="-mt-20 shrink-0 relative"
            >
              <Avatar className="w-32 h-32 md:w-48 md:h-48 border-[6px] border-background shadow-xl bg-background">
                <AvatarImage src={mentor.image || undefined} alt={mentor.name || 'Mentor'} className="object-cover" />
                <AvatarFallback className="text-5xl font-bold bg-muted text-muted-foreground">
                  {initials}
                </AvatarFallback>
              </Avatar>

              {mentor.verificationStatus === 'VERIFIED' && (
                <div className="absolute bottom-3 right-3 bg-blue-500 rounded-full p-1.5 shadow-lg border-4 border-background">
                  <CheckCircle className="w-5 h-5 text-white" />
                </div>
              )}
            </motion.div>

            {/* Text Information - Flows below banner */}
            <div className="flex-1 pt-2 md:pt-6 space-y-4 w-full">
              <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4">
                <div>
                  <motion.h1
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-3xl md:text-4xl font-bold text-foreground tracking-tight"
                  >
                    {mentor.name}
                  </motion.h1>
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="text-lg text-muted-foreground font-medium mt-1 flex flex-wrap items-center gap-2"
                  >
                    {mentor.title}
                    {mentor.company && (
                      <>
                        <span className="text-muted-foreground hidden md:inline">•</span>
                        <span className="text-blue-600 dark:text-blue-400">{mentor.company}</span>
                      </>
                    )}
                  </motion.div>
                </div>

                {/* Mobile CTA (visible only on mobile) */}
                <div className="md:hidden w-full">
                  <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold h-11 rounded-lg shadow-sm" onClick={handleBookSession}>
                    Book Session
                  </Button>
                </div>
              </div>

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="flex flex-wrap items-center gap-4 text-sm text-slate-500 dark:text-slate-400"
              >
                <span className="flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-muted-foreground" />
                  {[mentor.city, mentor.country].filter(Boolean).join(', ') || 'Remote'}
                </span>

                <div className="h-4 w-px bg-border hidden sm:block"></div>

                <div className="flex items-center gap-2">
                  {mentor.linkedinUrl && (
                    <a href={mentor.linkedinUrl} target="_blank" rel="noopener noreferrer" className="p-2 bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 transition-colors rounded-full">
                      <Linkedin className="w-4 h-4" />
                    </a>
                  )}
                  {mentor.websiteUrl && (
                    <a href={mentor.websiteUrl} target="_blank" rel="noopener noreferrer" className="p-2 bg-slate-100 dark:bg-slate-800 hover:bg-purple-50 dark:hover:bg-purple-900/30 hover:text-purple-600 transition-colors rounded-full">
                      <Globe className="w-4 h-4" />
                    </a>
                  )}
                  {mentor.githubUrl && (
                    <a href={mentor.githubUrl} target="_blank" rel="noopener noreferrer" className="p-2 bg-muted hover:bg-muted/80 hover:text-foreground transition-colors rounded-full">
                      <Github className="w-4 h-4" />
                    </a>
                  )}
                </div>
              </motion.div>
            </div>

          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

          {/* LEFT COLUMN (Content) */}
          <div className="lg:col-span-8">

            {/* Smooth Tab Bar */}
            <div className="sticky top-0 z-30 bg-background/80 backdrop-blur-md border-b border-border -mx-4 px-4 sm:mx-0 sm:px-0 mb-8">
              <nav className="flex space-x-8 overflow-x-auto scrollbar-hide" aria-label="Tabs">
                {['overview', 'content', 'reviews', 'achievements', 'mentoring_style'].map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab as TabType)}
                    className={cn(
                      "group relative py-4 px-1 text-sm font-medium whitespace-nowrap transition-colors outline-none",
                      activeTab === tab
                        ? "text-blue-600 dark:text-blue-400"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <span className="capitalize relative z-10 flex items-center gap-2">
                      {tab.replace('_', ' ')}
                      {tab === 'content' && mentorContentItems && mentorContentItems.length > 0 && <Badge variant="secondary" className="h-5 px-1.5 text-[10px] bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">{mentorContentItems.length}</Badge>}
                      {tab === 'achievements' && <Badge variant="secondary" className="h-5 px-1.5 text-[10px] bg-slate-100 text-slate-600">3</Badge>}
                    </span>
                    {activeTab === tab && (
                      <motion.div
                        layoutId="activeTabIndicator"
                        className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400"
                      />
                    )}
                  </button>
                ))}
              </nav>
            </div>

            {/* Tab Content Wrapper */}
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ duration: 0.2 }}
                className="min-h-[400px]"
              >
                {activeTab === 'overview' && renderOverview()}
                {activeTab === 'content' && renderContent()}
                {activeTab === 'reviews' && renderReviews()}
                {activeTab === 'achievements' && renderAchievements()}
                {activeTab === 'mentoring_style' && renderMentoringStyle()}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* RIGHT COLUMN (Sticky Sidebar) */}
          <div className="lg:col-span-4 space-y-6">

            {/* Quick Stats */}
            <div className="grid grid-cols-2 gap-4">
              <Card className="bg-card border-none shadow-sm">
                <CardContent className="p-4 flex flex-col items-center justify-center text-center">
                  <span className="text-2xl font-bold text-foreground">{mentor.experience}+</span>
                  <span className="text-xs text-muted-foreground uppercase tracking-wide font-medium mt-1">Years Exp.</span>
                </CardContent>
              </Card>
              <Card className="bg-card border-none shadow-sm">
                <CardContent className="p-4 flex flex-col items-center justify-center text-center">
                  <span className="text-2xl font-bold text-foreground flex items-center gap-1">5.0 <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" /></span>
                  <span className="text-xs text-muted-foreground uppercase tracking-wide font-medium mt-1">Rating</span>
                </CardContent>
              </Card>
            </div>

            {/* Available Sessions Block */}
            <div className="sticky top-24 space-y-4">
              <Card className="border border-blue-100 dark:border-blue-900 shadow-xl shadow-blue-500/5 dark:shadow-blue-900/10 rounded-2xl overflow-hidden ring-1 ring-blue-500/20">
                <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-4 text-white">
                  <h3 className="font-bold text-lg flex items-center gap-2">
                    <Calendar className="w-5 h-5" /> Book a Session
                  </h3>
                </div>
                <CardContent className="p-6 bg-card">
                  <div className="mb-6">
                    <div className="flex justify-between items-start mb-2">
                      <span className="font-semibold text-foreground text-lg">1:1 Mentorship</span>
                      <div className="text-right">
                        {mentor.hourlyRate ? (
                          <span className="block text-xl font-bold text-blue-600">${mentor.hourlyRate}</span>
                        ) : (
                          <span className="block text-xl font-bold text-green-600">Free</span>
                        )}
                        <span className="text-xs text-muted-foreground">per session</span>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      Video call to discuss career advice, portfolio review, or technical challenges.
                    </p>
                  </div>

                  <div className="flex items-center gap-3 mb-6 text-sm text-muted-foreground bg-muted p-3 rounded-lg">
                    <Clock className="w-4 h-4" />
                    <span>60 min duration</span>
                    <span className="mx-1">•</span>
                    <Zap className="w-4 h-4" />
                    <span>Instant confirmation</span>
                  </div>

                  <Button onClick={handleBookSession} className="w-full h-12 text-base font-semibold bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-500/20">
                    Book Now <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </CardContent>
              </Card>

              {isMessageMentorEnabled && (
                <Card className="border border-slate-200 dark:border-slate-800 shadow-sm rounded-xl">
                  <CardContent className="p-4">
                    <Button variant="ghost" onClick={handleSendMessage} className="w-full justify-start text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">
                      <MessageSquare className="w-4 h-4 mr-3" />
                      Send a message
                    </Button>
                  </CardContent>
                </Card>
              )}
            </div>

          </div>
        </div>
      </div>

      {/* Modals */}
      {mentor && (
        <BookingModal
          isOpen={isBookingModalOpen}
          onClose={() => setIsBookingModalOpen(false)}
          allowFreeBooking={resolvedSource !== 'explore'}
          bookingSource={resolvedSource === 'explore' ? 'explore' : 'ai'}
          mentor={{
            id: mentor.id,
            userId: mentor.userId,
            fullName: mentor.fullName || '',
            title: mentor.title || undefined,
            company: mentor.company || undefined,
            profileImageUrl: mentor.profileImageUrl || undefined,
            hourlyRate: mentor.hourlyRate ? parseFloat(mentor.hourlyRate) : undefined,
            currency: mentor.currency || undefined,
            about: mentor.about || undefined,
            expertise: mentor.expertiseArray ? JSON.stringify(mentor.expertiseArray) : mentor.expertise || undefined,
          }}
        />
      )}
      {mentor && session?.user?.id && (
        <MessageRequestModal
          isOpen={isMessageModalOpen}
          onClose={() => setIsMessageModalOpen(false)}
          recipientId={mentor.userId}
          recipientName={mentor.fullName || 'Mentor'}
          recipientType="mentor"
          userId={session.user.id}
          onSuccess={handleMessageSuccess}
        />
      )}
    </div>
  )
}
