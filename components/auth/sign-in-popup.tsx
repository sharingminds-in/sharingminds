"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useRouter } from "next/navigation"
import { FcGoogle } from "react-icons/fc"
import { FaLinkedin } from "react-icons/fa"
import {
  ArrowRight,
  CheckCircle2,
  GraduationCap,
  Infinity,
  LockKeyhole,
  Mail,
  Sparkles,
  UsersRound,
} from "lucide-react"
import { useAuth } from "@/contexts/auth-context"

interface SignInPopupProps {
  isOpen: boolean
  onClose: () => void
  callbackUrl?: string
}

export function SignInPopup({ isOpen, onClose, callbackUrl = "/dashboard" }: SignInPopupProps) {
  const [loadingProvider, setLoadingProvider] = useState<'google' | 'linkedin' | null>(null)
  const router = useRouter()
  const { isAuthenticated, signIn } = useAuth()
  const isLoading = loadingProvider !== null

  // Close popup if user is already signed in (using useEffect to avoid render-time state updates)
  useEffect(() => {
    if (isAuthenticated && isOpen) {
      onClose()
    }
  }, [isAuthenticated, isOpen, onClose])

  const handleGoogleSignIn = async () => {
    setLoadingProvider('google')
    try {
      await signIn('social', {
        provider: 'google',
        callbackURL: callbackUrl,
        prompt: 'select_account',
      })
      onClose()
      router.replace('/dashboard')
      router.refresh()
    } catch (error) {
      console.error("Sign in error:", error)
    } finally {
      setLoadingProvider(null)
    }
  }

  const handleLinkedInSignIn = async () => {
    setLoadingProvider('linkedin')
    try {
      await signIn('social', {
        provider: 'linkedin',
        callbackURL: callbackUrl,
        prompt: 'select_account',
      })
      onClose()
      router.replace('/dashboard')
      router.refresh()
    } catch (error) {
      console.error("Sign in error:", error)
    } finally {
      setLoadingProvider(null)
    }
  }

  const handleBecomeExpert = () => {
    onClose()
    router.push("/become-expert")
  }

  // Don't render if user is already signed in
  if (isAuthenticated) {
    return null
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        overlayClassName="bg-[#10152b]/45 backdrop-blur-md"
        className="max-h-[94vh] w-[calc(100vw-24px)] max-w-[860px] gap-0 overflow-y-auto rounded-[28px] border border-white/80 bg-white p-0 text-[#0b1533] shadow-[0_35px_100px_rgba(31,25,84,0.28)] sm:w-[calc(100vw-40px)] [&>button]:right-5 [&>button]:top-5 [&>button]:z-20 [&>button]:rounded-full [&>button]:bg-white/80 [&>button]:p-2 [&>button]:text-slate-500 [&>button]:opacity-100 [&>button]:shadow-sm [&>button]:backdrop-blur [&>button]:hover:bg-white [&>button]:hover:text-indigo-700"
      >
        <div className="grid md:grid-cols-[0.82fr_1.18fr]">
          <aside className="relative hidden overflow-hidden bg-gradient-to-br from-[#eef1ff] via-[#f7f5ff] to-white p-8 md:flex md:min-h-[560px] md:flex-col">
            <div className="absolute -left-20 top-24 h-52 w-52 rounded-full bg-indigo-300/35 blur-3xl" />
            <div className="absolute -right-24 bottom-10 h-64 w-64 rounded-full bg-violet-300/35 blur-3xl" />
            <div className="relative">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-[0_12px_26px_rgba(79,70,229,0.24)]">
                  <Infinity className="h-8 w-8 stroke-[2.6]" />
                </span>
                <span className="text-xl font-bold tracking-[-0.04em]">sharingminds</span>
              </div>

              <div className="mt-12">
                <div className="inline-flex items-center gap-2 rounded-full border border-indigo-200/70 bg-white/70 px-3 py-1.5 text-xs font-semibold text-indigo-700">
                  <Sparkles className="h-3.5 w-3.5" />
                  Guidance that moves you forward
                </div>
                <h2 className="mt-4 text-[30px] font-semibold leading-[1.08] tracking-[-0.045em]">
                  Your next breakthrough starts with the right conversation.
                </h2>
                <p className="mt-4 text-sm leading-6 text-[#58627c]">
                  Join a trusted network of professionals and experts built around meaningful, focused growth.
                </p>
              </div>

              <div className="mt-8 space-y-3">
                {[
                  'Get matched with the right expert',
                  'Book focused, flexible 1:1 sessions',
                  'Turn guidance into measurable progress',
                ].map((benefit) => (
                  <div key={benefit} className="flex items-center gap-3 text-sm font-medium text-[#303a57]">
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-indigo-600" />
                    {benefit}
                  </div>
                ))}
              </div>
            </div>

            <div className="relative mt-auto rounded-2xl border border-white/90 bg-white/65 p-3 shadow-sm backdrop-blur">
              <div className="flex items-center gap-3">
                <div className="flex -space-x-2">
                  {['AM', 'JS', 'RK'].map((initials, index) => (
                    <span
                      key={initials}
                      className={`flex h-9 w-9 items-center justify-center rounded-full border-2 border-white text-[10px] font-bold text-white ${
                        index === 0
                          ? 'bg-amber-500'
                          : index === 1
                            ? 'bg-blue-500'
                            : 'bg-rose-500'
                      }`}
                    >
                      {initials}
                    </span>
                  ))}
                </div>
                <p className="text-xs leading-5 text-[#59637c]">
                  Trusted by <strong className="text-[#17213e]">2,500+ professionals</strong>
                </p>
              </div>
            </div>
          </aside>

          <div className="p-6 sm:p-8 md:p-10">
            <DialogHeader className="pr-10 text-left">
              <div className="mb-5 flex items-center gap-2 md:hidden">
                <span className="flex h-9 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white">
                  <Infinity className="h-6 w-6 stroke-[2.6]" />
                </span>
                <span className="text-lg font-bold tracking-[-0.04em]">sharingminds</span>
              </div>
              <DialogTitle className="text-[30px] font-semibold leading-tight tracking-[-0.04em] text-[#0b1533] sm:text-[34px]">
                Welcome back
              </DialogTitle>
              <DialogDescription className="mt-2 text-[15px] leading-6 text-[#66708a]">
                Sign in to connect with experts and continue your growth.
              </DialogDescription>
            </DialogHeader>

            <div className="mt-7">
              <div className="mb-4 flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                  <UsersRound className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="font-semibold text-[#111a37]">Continue as a professional</h3>
                  <p className="text-xs text-[#747d94]">Access mentors, sessions, and your workspace.</p>
                </div>
              </div>

              <div className="space-y-3">
                <Button
                  onClick={handleGoogleSignIn}
                  disabled={isLoading}
                  variant="outline"
                  className="h-13 w-full rounded-xl border-[#dde1ec] bg-white text-[15px] font-semibold text-[#17213d] shadow-[0_8px_20px_rgba(31,25,84,0.05)] hover:border-indigo-200 hover:bg-indigo-50/50"
                >
                  <FcGoogle className="h-5 w-5" />
                  {loadingProvider === 'google' ? "Connecting to Google..." : "Continue with Google"}
                </Button>

                <Button
                  onClick={handleLinkedInSignIn}
                  disabled={isLoading}
                  className="h-13 w-full rounded-xl bg-[#0a66c2] text-[15px] font-semibold text-white shadow-[0_10px_24px_rgba(10,102,194,0.2)] hover:bg-[#07589f]"
                >
                  <FaLinkedin className="h-5 w-5" />
                  {loadingProvider === 'linkedin' ? "Connecting to LinkedIn..." : "Continue with LinkedIn"}
                </Button>
              </div>

              <div className="my-5 flex items-center gap-4">
                <span className="h-px flex-1 bg-[#e5e7f0]" />
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8a91a5]">
                  or use email
                </span>
                <span className="h-px flex-1 bg-[#e5e7f0]" />
              </div>

              <Button
                onClick={() => {
                  onClose()
                  router.push('/auth/signin')
                }}
                disabled={isLoading}
                className="group h-13 w-full rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-[15px] font-semibold text-white shadow-[0_14px_30px_rgba(79,70,229,0.24)] hover:from-indigo-700 hover:to-violet-700"
              >
                <Mail className="h-5 w-5" />
                Continue with email
                <ArrowRight className="ml-auto h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Button>
            </div>

            <div className="my-7 h-px bg-[#e8eaf2]" />

            <button
              type="button"
              onClick={handleBecomeExpert}
              className="group flex w-full items-center gap-4 rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50/80 to-violet-50/80 p-4 text-left transition-all hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-[0_12px_28px_rgba(79,70,229,0.1)]"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-indigo-600 shadow-sm">
                <GraduationCap className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-[#111a37]">Want to become an expert?</span>
                <span className="mt-1 block text-xs leading-5 text-[#68728b]">
                  Share your experience and help others grow.
                </span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-indigo-600 transition-transform group-hover:translate-x-1" />
            </button>

            <div className="mt-6 flex items-start justify-center gap-2 text-center text-[11px] leading-5 text-[#8a91a5]">
              <LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <p>
                By continuing, you agree to our{' '}
                <span className="font-medium text-[#59637c]">Terms of Service</span> and{' '}
                <span className="font-medium text-[#59637c]">Privacy Policy</span>.
              </p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
} 
