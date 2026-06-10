"use client"

import { motion } from "framer-motion"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import {
  LayoutDashboard,
  Users,
  Calendar,
  MessageSquare,
  BarChart3,
  Star,
  User,
  BookOpen,
  CalendarClock,
  CreditCard,
  Settings,
  Lock,
  type LucideIcon
} from "lucide-react"
import { useAuth } from "@/contexts/auth-context"
import { useMentorDashboardStats } from "@/hooks/use-mentor-dashboard"
import { useMessaging } from "@/hooks/use-messaging-v2"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  getNavigationSections,
  type DashboardNavigationScope,
  type DashboardSectionKey,
} from "@/lib/dashboard/sections"
import {
  getMentorVerificationStatusMeta,
} from "@/components/mentor/verification/mentor-verification-state"
import {
  getMentorDashboardSectionFeature,
  getMentorFeatureDecision,
  MENTOR_FEATURE_KEYS,
} from "@/lib/mentor/access-policy"

interface MentorSidebarProps {
  activeSection: string
  onSectionChange: (section: string) => void
  navigationScope?: DashboardNavigationScope
}

export function MentorSidebar({
  activeSection,
  onSectionChange,
  navigationScope = "dashboard",
}: MentorSidebarProps) {
  const { session, primaryRole, mentorProfile, mentorAccess, isLoading } = useAuth()
  const statsAccess = getMentorFeatureDecision(
    mentorAccess,
    MENTOR_FEATURE_KEYS.dashboardStats
  )
  const messagesAccess = getMentorFeatureDecision(
    mentorAccess,
    MENTOR_FEATURE_KEYS.messagesView
  )
  const canViewStats = Boolean(statsAccess?.allowed)
  const canViewMessages = Boolean(messagesAccess?.allowed)
  const { stats, isLoading: statsLoading } = useMentorDashboardStats(canViewStats)
  const { totalUnreadCount } = useMessaging(session?.user?.id, canViewMessages)

  const allowedKeys = new Set(
    getNavigationSections("mentor", navigationScope).map((section) => section.key)
  )

  const allMentorMenuItems: Array<{
    title: string
    icon: LucideIcon
    key: DashboardSectionKey
  }> = [
    {
      title: "Dashboard",
      icon: LayoutDashboard,
      key: "dashboard"
    },
    {
      title: "My Mentees",
      icon: Users,
      key: "mentees"
    },
    {
      title: "Schedule",
      icon: Calendar,
      key: "schedule"
    },
    {
      title: "Availability",
      icon: CalendarClock,
      key: "availability"
    },
    {
      title: "Messages",
      icon: MessageSquare,
      key: "messages"
    },
    {
      title: "Subscription",
      icon: CreditCard,
      key: "subscription"
    },
    {
      title: "Reviews",
      icon: Star,
      key: "reviews"
    },
    {
      title: "Analytics",
      icon: BarChart3,
      key: "analytics"
    },
    {
      title: "My Content",
      icon: BookOpen,
      key: "content"
    },
    {
      title: "Profile",
      icon: User,
      key: "profile"
    },
    {
      title: "Settings",
      icon: Settings,
      key: "settings"
    }
  ]

  const mentorMenuItems = allMentorMenuItems.filter((item) => allowedKeys.has(item.key))

  const mentorName = mentorProfile?.fullName || session?.user?.name || 'Mentor'
  const mentorInitials = mentorName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()
  const verificationMeta = getMentorVerificationStatusMeta(mentorProfile?.verificationStatus)

  return (
    <Sidebar className="bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 mt-16">
      {/* Header with User Profile */}
      <SidebarHeader className="p-3">
        <motion.div
          className="rounded-2xl bg-gradient-to-br from-amber-50/60 via-white to-orange-50/40 dark:from-gray-800 dark:via-gray-800 dark:to-amber-950/20 p-4 shadow-sm border border-amber-200/60 dark:border-gray-700/60"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
        >
          <div className="flex flex-col space-y-4">
            {/* Avatar and User Info Row */}
            <div className="flex items-center gap-3.5">
              {/* Avatar Container */}
              <div className="relative">
                <Avatar className="h-14 w-14 ring-2 ring-white dark:ring-gray-700 shadow-md">
                  <AvatarImage src={mentorProfile?.profileImageUrl || session?.user?.image || undefined} alt={mentorName} />
                  <AvatarFallback className="bg-gradient-to-br from-amber-500 to-orange-600 text-white font-semibold text-base">
                    {mentorInitials}
                  </AvatarFallback>
                </Avatar>

                {/* Verification Signal */}
                <div className="absolute -bottom-0.5 -right-0.5">
                  <span className="relative flex h-3.5 w-3.5">
                    <span className={`relative inline-flex h-3.5 w-3.5 rounded-full border-2 border-white shadow-sm dark:border-gray-700 ${verificationMeta.iconClassName}`}></span>
                  </span>
                </div>
              </div>

              {/* User Info */}
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900 dark:text-white text-[15px]">
                  {mentorName}
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {mentorProfile?.title || (isLoading ? 'Loading...' : (primaryRole?.displayName || 'Mentor'))}
                </p>
                <TooltipProvider delayDuration={120}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="mt-2 inline-flex items-center gap-1.5 rounded-full text-[11px] font-medium text-gray-600 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
                        aria-label={`Mentor status: ${verificationMeta.label}`}
                      >
                        <span
                          className={`h-2 w-2 rounded-full shadow-sm ${verificationMeta.iconClassName}`}
                        />
                        <span>{verificationMeta.shortLabel}</span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent
                      side="bottom"
                      align="start"
                      sideOffset={8}
                      className="max-w-[280px] rounded-2xl border border-slate-200/80 bg-white/95 p-0 shadow-xl shadow-slate-200/50 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95 dark:shadow-black/30"
                    >
                      <div className="space-y-3 p-4">
                        <div className="flex items-center gap-2.5">
                          <span
                            className={`h-2.5 w-2.5 rounded-full shadow-sm ${verificationMeta.iconClassName}`}
                          />
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                              Mentor Status
                            </p>
                            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                              {verificationMeta.label}
                            </p>
                          </div>
                        </div>
                        <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
                          {verificationMeta.description}
                        </p>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>

            {/* Stats Row */}
            <div className="flex gap-2.5">
              {/* Mentees Stat */}
              <div className="flex-1 bg-white/70 dark:bg-gray-700/40 rounded-xl p-2.5 border border-amber-100 dark:border-gray-600/40">
                <div className="flex items-center gap-1.5 mb-1">
                  <Users className="w-3 h-3 text-amber-500" />
                  <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Mentees</span>
                </div>
                <p className="text-lg font-bold text-gray-900 dark:text-white leading-none">
                  {canViewStats ? (statsLoading ? '...' : (stats?.totalMentees || 0)) : '—'}
                </p>
              </div>

              {/* Rating Stat */}
              <div className="flex-1 bg-white/70 dark:bg-gray-700/40 rounded-xl p-2.5 border border-amber-100 dark:border-gray-600/40">
                <div className="flex items-center gap-1.5 mb-1">
                  <Star className="w-3 h-3 text-orange-500" />
                  <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Rating</span>
                </div>
                <p className="text-lg font-bold text-gray-900 dark:text-white leading-none">
                  {canViewStats
                    ? (statsLoading ? '...' : (stats?.averageRating ? stats.averageRating.toFixed(1) : 'N/A'))
                    : '—'}
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      </SidebarHeader>

      {/* Navigation Menu */}
      <SidebarContent className="px-3 py-2">
        <SidebarMenu className="space-y-0.5">
          {mentorMenuItems.map((item) => {
            const feature = getMentorDashboardSectionFeature(
              item.key as DashboardSectionKey
            )
            const access = feature ? getMentorFeatureDecision(mentorAccess, feature) : null
            const isRestricted = Boolean(access && !access.allowed)

            return (
              <SidebarMenuItem key={item.key}>
                <SidebarMenuButton
                  onClick={() => {
                    if (!isRestricted) {
                      onSectionChange(item.key)
                    }
                  }}
                  disabled={isRestricted}
                  tooltip={isRestricted ? access?.blockedSummary : undefined}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${activeSection === item.key
                    ? 'bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 border-l-2 border-blue-500'
                    : isRestricted
                      ? 'text-gray-400 dark:text-gray-500 cursor-not-allowed'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/50 hover:text-gray-900 dark:hover:text-white'
                    }`}
                >
                  <item.icon className={`w-4 h-4 flex-shrink-0 ${activeSection === item.key
                    ? 'text-blue-500'
                    : isRestricted
                      ? 'text-gray-400 dark:text-gray-500'
                      : ''
                    }`} />
                  <span className="truncate">{item.title}</span>
                  {isRestricted && (
                    <Lock className="ml-auto h-3.5 w-3.5 text-gray-400 dark:text-gray-500" />
                  )}
                  {item.key === 'messages' && totalUnreadCount > 0 && (
                    <Badge variant="destructive" className="ml-auto">
                      {totalUnreadCount}
                    </Badge>
                  )}
                </SidebarMenuButton>
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarContent>

      {/* Footer with Action Button */}
      <SidebarFooter className="p-4 border-t border-gray-100 dark:border-gray-800">
        <Button className="w-full bg-blue-500 hover:bg-blue-600 text-white gap-2 h-10 rounded-lg font-medium text-sm transition-colors duration-200">
          <Calendar className="w-4 h-4" />
          Schedule Session
        </Button>
      </SidebarFooter>
    </Sidebar>
  )
}
