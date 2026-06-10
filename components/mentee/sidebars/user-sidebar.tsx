"use client"

import { useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
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
  Eye,
  Users,
  Video,
  Bookmark,
  Users2,
  Mail,
  Calendar,
  LayoutDashboard,
  Home,
  User,
  GraduationCap,
  BookOpen,
  Bot,
  Sparkles,
  Settings,
  ChevronRight,
  Lock,
  type LucideIcon,
} from "lucide-react"
import { useAuth } from "@/contexts/auth-context"
import { useMessaging } from "@/hooks/use-messaging-v2"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import {
  getNavigationSections,
  type DashboardNavigationScope,
  type DashboardSectionKey,
} from "@/lib/dashboard/sections"
import {
  getMenteeDashboardSectionFeature,
  getMenteeFeatureDecision,
  MENTEE_FEATURE_KEYS,
} from "@/lib/mentee/access-policy"

interface UserSidebarProps {
  activeSection: string
  onSectionChange: (section: string) => void
  userRole?: string
  navigationScope?: DashboardNavigationScope
}

export function UserSidebar({
  activeSection,
  onSectionChange,
  userRole,
  navigationScope = "dashboard",
}: UserSidebarProps) {
  const { session, primaryRole, isLoading, menteeAccess } = useAuth()
  const messagesAccess = getMenteeFeatureDecision(
    menteeAccess,
    MENTEE_FEATURE_KEYS.messagesView
  )
  const canViewMessages = Boolean(messagesAccess?.allowed)
  const { totalUnreadCount } = useMessaging(session?.user?.id, canViewMessages)

  const menuItems = useMemo(() => {
    const allowedKeys = new Set(
      getNavigationSections("mentee", navigationScope).map((section) => section.key)
    )

    const items: Array<{
      title: string
      icon: LucideIcon
      key: DashboardSectionKey
    }> = [
    { title: "Home", icon: Home, key: "home" },
    { title: "Dashboard", icon: LayoutDashboard, key: "dashboard" },
    { title: "Explore Mentors", icon: Users, key: "explore" },
    { title: "Saved Items", icon: Bookmark, key: "saved" },
    { title: "My Mentors", icon: Users2, key: "mentors" },
    { title: "Courses", icon: GraduationCap, key: "courses" },
    { title: "My Learning", icon: BookOpen, key: "my-courses" },
    { title: "AI Chat", icon: Bot, key: "chat" },
    { title: "Messages", icon: Mail, key: "messages" },
    { title: "Sessions", icon: Calendar, key: "sessions" },
    { title: "Subscription", icon: Sparkles, key: "subscription" },
    { title: "Settings", icon: Settings, key: "settings" },
    { title: "Profile", icon: User, key: "profile" }
    ]

    return items.filter((item) => allowedKeys.has(item.key))
  }, [navigationScope])

  return (
    <Sidebar className="bg-background/80 dark:bg-background/90 backdrop-blur-xl border-r border-border mt-16 z-20">
      {/* User Profile Header */}
      <SidebarHeader className="p-4 pb-2">
        <div className="group relative rounded-xl p-4 transition-all duration-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 border border-transparent hover:border-slate-100 dark:hover:border-slate-800">
          <div className="flex flex-col space-y-4">
            {/* User Avatar and Info */}
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="absolute -inset-0.5 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity blur-sm" />
                <Avatar className="relative h-12 w-12 border-2 border-white dark:border-slate-900 shadow-sm">
                  <AvatarImage src={session?.user?.image || "/placeholder.svg?height=56&width=56"} alt={session?.user?.name || "User"} />
                  <AvatarFallback className="bg-slate-100 text-slate-600 font-bold dark:bg-slate-800 dark:text-slate-300">
                    {session?.user?.name?.slice(0, 2).toUpperCase() || "JD"}
                  </AvatarFallback>
                </Avatar>
                {/* Online Status */}
                <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white dark:border-slate-900 ring-1 ring-white/50" />
              </div>

              {/* User Info */}
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-slate-900 dark:text-white text-sm truncate">
                  {session?.user?.name || 'User'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  {isLoading ? 'Loading...' : (primaryRole?.displayName || 'User')}
                </p>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-2 pt-2">
              <div className="flex flex-col p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 transition-colors group-hover:bg-white dark:group-hover:bg-slate-800 shadow-sm border border-slate-100 dark:border-slate-800/50">
                <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-medium uppercase tracking-wider mb-0.5">
                  <Eye className="w-3 h-3" /> Views
                </div>
                <p className="text-sm font-bold text-slate-700 dark:text-slate-200">24</p>
              </div>
              <div className="flex flex-col p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 transition-colors group-hover:bg-white dark:group-hover:bg-slate-800 shadow-sm border border-slate-100 dark:border-slate-800/50">
                <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-medium uppercase tracking-wider mb-0.5">
                  <Users className="w-3 h-3" /> Network
                </div>
                <p className="text-sm font-bold text-slate-700 dark:text-slate-200">156</p>
              </div>
            </div>
          </div>
        </div>
      </SidebarHeader>

      {/* Navigation Menu */}
      <SidebarContent className="px-3 py-2">
        <SidebarMenu className="space-y-1">
          {menuItems.map((item) => {
            const isActive = activeSection === item.key;
            const feature = getMenteeDashboardSectionFeature(
              item.key as DashboardSectionKey
            );
            const access = feature ? getMenteeFeatureDecision(menteeAccess, feature) : null;
            const isRestricted = Boolean(access && !access.allowed);
            return (
              <SidebarMenuItem key={item.key}>
                <SidebarMenuButton
                  onClick={() => {
                    if (!isRestricted) {
                      onSectionChange(item.key)
                    }
                  }}
                  className="relative group w-full overflow-hidden"
                  disabled={isRestricted}
                  tooltip={isRestricted ? access?.blockedSummary : undefined}
                >
                  {/* Active Background "Slider" Animation */}
                  {isActive && (
                    <motion.div
                      layoutId="activeSidebarItem"
                      className="absolute inset-0 bg-accent rounded-lg border border-primary/20"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    />
                  )}

                  <div className={cn(
                    "relative z-10 flex items-center w-full gap-3 px-3 py-2.5 text-sm font-medium transition-colors duration-200",
                    isActive
                      ? "text-primary"
                      : isRestricted
                        ? "text-muted-foreground/70"
                        : "text-muted-foreground hover:text-foreground"
                  )}>
                    <item.icon className={cn(
                      "w-4 h-4 flex-shrink-0 transition-colors",
                      isActive
                        ? "text-primary"
                        : isRestricted
                          ? "text-muted-foreground/70"
                          : "text-muted-foreground group-hover:text-foreground"
                    )} />

                    <span className="truncate">{item.title}</span>

                    {isRestricted && (
                      <Lock className="ml-auto h-3.5 w-3.5 text-muted-foreground/70" />
                    )}

                    {item.key === 'messages' && totalUnreadCount > 0 && (
                      <Badge className="ml-auto bg-rose-500 hover:bg-rose-600 text-white h-5 min-w-[1.25rem] px-1 flex items-center justify-center border-0">
                        {totalUnreadCount}
                      </Badge>
                    )}

                    {/* Hover Chevron */}
                    {!isActive && !isRestricted && (
                      <ChevronRight className="w-3 h-3 ml-auto opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all text-muted-foreground" />
                    )}
                  </div>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarContent>

      {/* Footer with Video Call Button */}
      <SidebarFooter className="p-4 border-t border-border">
        <div className="space-y-4">
          {/* Pro Tip / Upsell - Optional visual enhancement */}
          <div className="bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-indigo-950/30 dark:to-blue-950/30 rounded-xl p-3 border border-blue-100 dark:border-blue-900/30">
            <div className="flex items-start gap-3">
              <div className="p-1.5 bg-white dark:bg-slate-900 rounded-md shadow-sm text-amber-500">
                <Sparkles className="w-3 h-3" />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">Upcoming Session</p>
                <p className="text-[10px] text-slate-500 leading-tight mt-0.5">You have a mentorship call in 2 hours.</p>
              </div>
            </div>
          </div>

          <Button className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-lg shadow-blue-500/20 rounded-xl py-5 transition-all active:scale-[0.98]">
            <Video className="w-4 h-4 mr-2" />
            Start Video Call
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
