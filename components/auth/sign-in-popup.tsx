"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useRouter } from "next/navigation"
import { FcGoogle } from "react-icons/fc"
import { FaLinkedin } from "react-icons/fa"
import { Users, GraduationCap } from "lucide-react"
import { useAuth } from "@/contexts/auth-context"

interface SignInPopupProps {
  isOpen: boolean
  onClose: () => void
  callbackUrl?: string
}

export function SignInPopup({ isOpen, onClose, callbackUrl = "/dashboard" }: SignInPopupProps) {
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()
  const { isAuthenticated, signIn } = useAuth()

  // Close popup if user is already signed in (using useEffect to avoid render-time state updates)
  useEffect(() => {
    if (isAuthenticated && isOpen) {
      onClose()
    }
  }, [isAuthenticated, isOpen, onClose])

  const handleGoogleSignIn = async () => {
    setIsLoading(true)
    try {
      await signIn('social', {
        provider: 'google',
        callbackURL: callbackUrl,
        prompt: 'select_account',
      })
      onClose()
      router.replace(callbackUrl)
      router.refresh()
    } catch (error) {
      console.error("Sign in error:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleLinkedInSignIn = async () => {
    setIsLoading(true)
    try {
      await signIn('social', {
        provider: 'linkedin',
        callbackURL: callbackUrl,
        prompt: 'select_account',
      })
      onClose()
      router.replace(callbackUrl)
      router.refresh()
    } catch (error) {
      console.error("Sign in error:", error)
    } finally {
      setIsLoading(false)
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
      <DialogContent className="w-[92vw] max-w-lg rounded-xl p-5 sm:p-6">
        <DialogHeader className="space-y-1">
          <DialogTitle className="text-center text-xl sm:text-2xl font-bold">
            Welcome to SharingMinds
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 sm:space-y-6">
          {/* Default User Sign In */}
          <Card className="border-2 border-primary/20 bg-primary/5">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Users className="h-5 w-5 text-primary" />
                Join as User
              </CardTitle>
              <CardDescription>
                Learn from experts and grow your skills
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={handleGoogleSignIn}
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2"
                variant="outline"
              >
                <FcGoogle className="h-5 w-5" />
                {isLoading ? "Signing in..." : "Continue with Google"}
              </Button>

              <Button
                onClick={handleLinkedInSignIn}
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2 mt-3 bg-[#0A66C2] hover:bg-[#004182] text-white"
              >
                <FaLinkedin className="h-5 w-5" />
                {isLoading ? "Signing in..." : "Continue with LinkedIn"}
              </Button>

              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-primary/5 px-2 text-muted-foreground">
                    Or
                  </span>
                </div>
              </div>

              <Button
                onClick={() => {
                  onClose();
                  router.push(`/auth/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`);
                }}
                disabled={isLoading}
                className="w-full"
              >
                Continue with Email
              </Button>
            </CardContent>
          </Card>

          {/* Become an Expert */}
          <Card className="border border-gray-200 hover:border-green-300 transition-colors">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <GraduationCap className="h-5 w-5 text-green-600" />
                Become an Expert
              </CardTitle>
              <CardDescription>
                Share your expertise and help others grow
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={handleBecomeExpert}
                className="w-full bg-green-600 hover:bg-green-700 text-white"
              >
                Apply as Expert
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="text-center pt-2 sm:pt-4">
          <p className="text-xs text-gray-500 leading-relaxed">
            By continuing, you agree to our Terms of Service and Privacy Policy
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
} 
