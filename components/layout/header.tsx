"use client"

import { useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { ChevronDown, Infinity, LogOut, Menu, MoreVertical, Search, Settings, Sparkles, SunMoon, UserPlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { RadialThemeToggle } from "@/components/providers/radial-theme-toggle"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { SignInPopup } from "@/components/auth/sign-in-popup"
import { NotificationBell } from "@/components/notifications/notification-bell"
import { useAuth } from "@/contexts/auth-context"
import { Skeleton } from "@/components/ui/skeleton"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface HeaderProps {
  onSearchClick?: () => void
  showSidebarTrigger?: boolean
  isDashboard?: boolean
}

const LANDING_NAV_LINKS = [
  { label: "For Individuals", href: "#how-it-works", hasMenu: true },
  { label: "For Businesses", href: "#professionals", hasMenu: true },
  { label: "Experts", href: "#experts" },
  { label: "Resources", href: "#resources", hasMenu: true },
  { label: "Pricing", href: "#pricing" },
]

export function Header({ onSearchClick, showSidebarTrigger = false, isDashboard = false }: HeaderProps) {
  const router = useRouter()
  const pathname = usePathname()
  const { signOut: authSignOut, isAuthenticated, isMentor: authIsMentor, isLoading } = useAuth()
  const [isScrolled, setIsScrolled] = useState(false)
  const [showSignInPopup, setShowSignInPopup] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  const isMentor = authIsMentor

  // Determine if we are on a dashboard page based on path or prop
  // Ideally this component should receive this as a prop but checking path as fallback
  const isDashboardPage = isDashboard || pathname.startsWith('/dashboard') || pathname.startsWith('/admin') || pathname.startsWith('/mentee') || pathname.startsWith('/mentor');
  const isLanding = !isDashboardPage && pathname === "/";

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 10)
    window.addEventListener("scroll", handleScroll)
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  const handleAuthClick = async () => {
    if (isAuthenticated) {
      try {
        await authSignOut()
        router.replace("/")
        router.refresh()
      } catch (error) {
        router.replace("/")
        router.refresh()
      }
    } else {
      setShowSignInPopup(true)
    }
  }

  const handleLogoClick = () => router.push("/")
  const handleGoToDashboard = () => router.push("/dashboard?section=dashboard")

  const headerClasses = `fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${isScrolled
    ? "bg-background/80 backdrop-blur-xl shadow-subtle border-b border-border"
    : "bg-background/95 backdrop-blur-sm border-b border-transparent"
    }`

  const MobileNavLinks = () => (
    <div className="flex flex-col gap-1 text-sm text-slate-600">
      {LANDING_NAV_LINKS.map((link) => (
        <a
          key={link.label}
          href={link.href}
          className="flex items-center justify-between rounded-xl px-3 py-3 text-left font-medium hover:bg-indigo-50 hover:text-indigo-700"
          onClick={() => setIsMobileMenuOpen(false)}
        >
          <span>{link.label}</span>
          {link.hasMenu && <ChevronDown className="h-4 w-4" />}
        </a>
      ))}
    </div>
  )

  const ThemeRow = () => (
    <div className="flex items-center justify-between rounded-md border px-3 py-2">
      <div className="flex items-center gap-2 text-sm font-medium">
        <SunMoon className="h-4 w-4" />
        <span>Theme</span>
      </div>
      <RadialThemeToggle />
    </div>
  )

  // MAIN SPLIT: LANDING VS DASHBOARD HEADER

  if (isLanding) {
    return (
      <>
        <header
          className={`fixed inset-x-0 top-0 z-50 h-[76px] border-b transition-all duration-300 ${
            isScrolled
              ? "border-slate-200/80 bg-white/92 shadow-[0_12px_35px_rgba(37,32,82,0.08)] backdrop-blur-xl"
              : "border-transparent bg-white/88 backdrop-blur-md"
          }`}
        >
          <div className="mx-auto flex h-full max-w-[1480px] items-center justify-between gap-5 px-4 sm:px-6 lg:px-8">
            <button
              type="button"
              className="flex shrink-0 items-center gap-2 text-slate-950"
              onClick={handleLogoClick}
              aria-label="SharingMinds home"
            >
              <span className="flex h-9 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-violet-600 text-white shadow-[0_8px_20px_rgba(79,70,229,0.22)]">
                <Infinity className="h-7 w-7 stroke-[2.6]" />
              </span>
              <span className="text-xl font-bold tracking-[-0.04em] sm:text-2xl">
                sharingminds
              </span>
            </button>

            <nav className="hidden items-center gap-8 xl:flex">
              {LANDING_NAV_LINKS.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  className="group flex items-center gap-1.5 text-[15px] font-medium text-slate-800 transition-colors hover:text-indigo-700"
                >
                  {link.label}
                  {link.hasMenu && (
                    <ChevronDown className="h-4 w-4 transition-transform duration-200 group-hover:translate-y-0.5" />
                  )}
                </a>
              ))}
            </nav>

            <div className="flex shrink-0 items-center gap-2.5">
            {isLoading ? (
              <>
                <Skeleton className="h-11 w-24 rounded-xl" />
                <Skeleton className="h-11 w-36 rounded-xl" />
              </>
            ) : isAuthenticated ? (
              <>
                <div className="hidden items-center gap-2.5 xl:flex">
                  <Button className="h-11 rounded-xl px-5 font-semibold" onClick={handleGoToDashboard}>
                    Go to dashboard
                  </Button>
                  {!isMentor && (
                    <Button
                      variant="outline"
                      className="h-11 rounded-xl px-5 font-semibold"
                      onClick={() => router.push("/become-expert")}
                    >
                      Become an Expert
                    </Button>
                  )}
                  <Button variant="ghost" className="h-11 rounded-xl px-4" onClick={handleAuthClick}>
                    Logout
                  </Button>
                </div>
                <div className="flex items-center gap-2 xl:hidden">
                  <Button size="sm" className="font-semibold" onClick={handleGoToDashboard}>
                    Go to dashboard
                  </Button>
                  <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
                    <SheetTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Open menu"
                        className="text-slate-900 hover:bg-indigo-50 hover:text-indigo-700 lg:hidden"
                      >
                        <Menu className="h-5 w-5" />
                      </Button>
                    </SheetTrigger>
                    <SheetContent side="right" className="w-80 bg-white text-slate-900 sm:w-96">
                      <SheetHeader>
                        <SheetTitle>SharingMinds</SheetTitle>
                      </SheetHeader>
                      <div className="mt-4 flex flex-col gap-3">
                        <MobileNavLinks />
                        <div className="h-px w-full bg-border" />
                        <Button variant="default" onClick={() => { handleGoToDashboard(); setIsMobileMenuOpen(false) }}>
                          Go to dashboard
                        </Button>
                        {!isMentor && (
                          <Button variant="outline" onClick={() => { router.push("/become-expert"); setIsMobileMenuOpen(false) }}>
                            Become an Expert
                          </Button>
                        )}
                        <Button variant="outline" onClick={() => { setIsMobileMenuOpen(false); handleAuthClick(); }}>
                          Logout
                        </Button>
                        <ThemeRow />
                      </div>
                    </SheetContent>
                  </Sheet>
                </div>
              </>
            ) : (
              <>
                <div className="hidden items-center gap-3 xl:flex">
                  <Button
                    variant="outline"
                    className="h-12 rounded-xl border-slate-200 bg-white px-6 text-[15px] font-semibold text-slate-900 shadow-sm hover:border-indigo-200 hover:bg-indigo-50"
                    onClick={handleAuthClick}
                  >
                    Log in
                  </Button>
                  <a
                    href="#infinity-chat"
                    className="inline-flex h-12 items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-6 text-[15px] font-semibold text-white shadow-[0_12px_28px_rgba(79,70,229,0.24)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_16px_34px_rgba(79,70,229,0.3)]"
                  >
                    <Sparkles className="h-4 w-4" />
                    Talk to Infinity
                  </a>
                </div>
                <div className="flex items-center gap-2 xl:hidden">
                  <Button
                    size="sm"
                    variant="outline"
                    className="hidden border-slate-200 bg-white text-slate-900 sm:inline-flex"
                    onClick={handleAuthClick}
                  >
                    Log in
                  </Button>
                  <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
                    <SheetTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Open menu"
                        className="text-slate-900 hover:bg-indigo-50 hover:text-indigo-700"
                      >
                        <Menu className="h-5 w-5" />
                      </Button>
                    </SheetTrigger>
                    <SheetContent side="right" className="w-80 bg-white text-slate-900 sm:w-96">
                      <SheetHeader>
                        <SheetTitle>SharingMinds</SheetTitle>
                      </SheetHeader>
                      <div className="mt-4 flex flex-col gap-3">
                        <MobileNavLinks />
                        <div className="h-px w-full bg-border" />
                        <Button variant="outline" onClick={() => { handleAuthClick(); setIsMobileMenuOpen(false) }}>
                          Log in
                        </Button>
                        <Button
                          onClick={() => {
                            setIsMobileMenuOpen(false)
                            window.location.hash = "infinity-chat"
                          }}
                          className="bg-gradient-to-r from-indigo-600 to-violet-600 text-white"
                        >
                          <Sparkles className="mr-2 h-4 w-4" />
                          Talk to Infinity
                        </Button>
                      </div>
                    </SheetContent>
                  </Sheet>
                </div>
              </>
            )}
            </div>
          </div>
        </header>

        <SignInPopup isOpen={showSignInPopup} onClose={() => setShowSignInPopup(false)} />
      </>
    )
  }

  // DASHBOARD HEADER (Inner Pages)
  return (
    <>
      <header className={`${headerClasses} flex items-center justify-between gap-3 px-4 h-16 sm:px-6`}>
        {/* Left Side: Sidebar Trigger & Logo */}
        <div className="flex items-center gap-2 sm:gap-4 overflow-hidden">
          {showSidebarTrigger && <SidebarTrigger />}
          <div
            className="text-lg font-bold cursor-pointer transition-colors whitespace-nowrap overflow-hidden text-ellipsis"
            onClick={handleLogoClick}
          >
            Sharing<span className="text-blue-500">Minds</span>
          </div>
        </div>

        {/* Right Side: Actions */}
        <div className="flex items-center gap-1 sm:gap-2">

          {/* Always Visible: Search (if enabled) & Notifications & Theme */}
          {onSearchClick && (
            <Button variant="ghost" size="icon" onClick={onSearchClick} className="h-9 w-9">
              <Search className="w-4 h-4" />
            </Button>
          )}

          <NotificationBell />

          <div className="hidden sm:inline-flex">
            <RadialThemeToggle />
          </div>
          {/* Mobile Theme Toggle (visible only on mobile) */}
          <div className="sm:hidden">
            <RadialThemeToggle />
          </div>


          {/* Desktop Only Actions */}
          <div className="hidden md:flex items-center gap-2">
            {!isMentor && (
              <Button
                variant="outline"
                size="sm"
                className="font-semibold border-green-500 text-green-600 hover:bg-green-50 ml-2"
                onClick={() => router.push('/become-expert')}
              >
                Become an Expert
              </Button>
            )}
            <Button variant="ghost" size="icon">
              <Settings className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={handleAuthClick}>
              Logout
            </Button>
          </div>

          {/* Mobile Dropdown Menu */}
          <div className="md:hidden">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>My Account</DropdownMenuLabel>
                <DropdownMenuSeparator />

                {!isMentor && (
                  <>
                    <DropdownMenuItem onClick={() => router.push('/become-expert')} className="text-green-600 focus:text-green-700">
                      <UserPlus className="mr-2 h-4 w-4" />
                      <span>Become an Expert</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}

                <DropdownMenuItem disabled>
                  <Settings className="mr-2 h-4 w-4" />
                  <span>Settings</span>
                </DropdownMenuItem>

                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleAuthClick} className="text-red-600 focus:text-red-600">
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Logout</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

        </div>
      </header>

      <SignInPopup isOpen={showSignInPopup} onClose={() => setShowSignInPopup(false)} />
    </>
  )
}
