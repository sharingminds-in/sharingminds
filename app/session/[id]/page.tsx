"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter, useParams } from "next/navigation"
import { useSession } from "@/lib/auth-client"
import { LiveSessionUI } from "@/components/booking/LiveSessionUI"
import { SessionRating } from "@/components/booking/SessionRating"
import { CheckCircle, AlertCircle } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { logConsentEvents } from "@/lib/consent-client"
import { useTRPCClient } from "@/lib/trpc/react"

interface SessionUser {
  id: string
  name: string
  image: string | null
}

interface SessionData {
  id: string
  mentorId: string
  menteeId: string
  title: string
  meetingUrl?: string | null
  meetingType?: string | null
  mentor: SessionUser
  mentee: SessionUser
}

interface Reviewee {
  id: string
  name: string
  avatar?: string | null
  role: "mentor" | "mentee"
}

type Stage = "loading" | "in-call" | "rating" | "success" | "error"

export default function SessionPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const trpcClient = useTRPCClient()
  const { data: authSession, isPending: isAuthLoading, error: authError } = useSession()

  const [stage, setStage] = useState<Stage>("loading")
  const [sessionData, setSessionData] = useState<SessionData | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null)
  const [isCameraOn, setIsCameraOn] = useState(false)

  useEffect(() => {
    if (isAuthLoading || !params.id) {
      return
    }

    if (!authSession || authError) {
      setError(authError?.message || "You must be logged in to view a session.")
      setStage("error")
      return
    }

    const fetchAndPrepareSession = async () => {
      try {
        const data = await trpcClient.bookings.sessionView.query({
          sessionId: params.id,
        })
        setSessionData(data)
        setStage("in-call")
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load session data."
        setError(message)
        setStage("error")
      }
    }

    if (stage === "loading") {
      fetchAndPrepareSession()
    }
  }, [params.id, authSession, isAuthLoading, authError, stage, trpcClient])

  const reviewee: Reviewee | null = useMemo(() => {
    if (!sessionData || !authSession?.user?.id) {
      return null
    }

    if (authSession.user.id === sessionData.menteeId) {
      return {
        id: sessionData.mentor.id,
        name: sessionData.mentor.name,
        avatar: sessionData.mentor.image,
        role: "mentor",
      }
    }

    if (authSession.user.id === sessionData.mentorId) {
      return {
        id: sessionData.mentee.id,
        name: sessionData.mentee.name,
        avatar: sessionData.mentee.image,
        role: "mentee",
      }
    }

    setError("You are not a participant in this session.")
    setStage("error")
    return null
  }, [sessionData, authSession])

  const counterpart = useMemo(() => {
    if (!sessionData || !authSession?.user?.id) {
      return null
    }

    return authSession.user.id === sessionData.mentorId
      ? sessionData.mentee
      : sessionData.mentor
  }, [sessionData, authSession])

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true })
      setMediaStream(stream)
      setIsCameraOn(true)
      logConsentEvents({
        consentType: "camera",
        action: "granted",
        source: "browser_prompt",
        context: { location: "session-page" },
      })
    } catch (err) {
      console.error("Error accessing camera:", err)
      setIsCameraOn(false)
      logConsentEvents({
        consentType: "camera",
        action: "denied",
        source: "browser_prompt",
        context: {
          location: "session-page",
          error: err instanceof Error ? err.message : "unknown_error",
        },
      })
    }
  }

  const stopCamera = () => {
    if (mediaStream) {
      mediaStream.getTracks().forEach(track => track.stop())
    }
    setMediaStream(null)
    setIsCameraOn(false)
  }

  useEffect(() => {
    return () => {
      if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop())
      }
    }
  }, [mediaStream])

  const handleTimeUp = () => {
    setStage("rating")
  }

  const handleRatingComplete = () => {
    stopCamera()
    setStage("success")
    setTimeout(() => {
      router.push("/dashboard")
    }, 3000)
  }

  if (isAuthLoading) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center bg-gray-900">
        <p className="text-lg text-white">Authenticating...</p>
      </div>
    )
  }

  if (stage === "error" || !sessionData || !counterpart || !reviewee) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-gray-900 p-4">
        <Alert variant="destructive" className="max-w-md">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error || "An unknown error occurred."}</AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="h-screen w-screen bg-gray-900">
      {stage === "in-call" && (
        <LiveSessionUI
          counterpartName={counterpart.name}
          counterpartAvatar={counterpart.image}
          sessionTitle={sessionData.title}
          meetingUrl={sessionData.meetingUrl}
          meetingType={sessionData.meetingType}
          onTimeUp={handleTimeUp}
          isCameraOn={isCameraOn}
          mediaStream={mediaStream}
          startCamera={startCamera}
          stopCamera={stopCamera}
        />
      )}
      {(stage === "rating" || stage === "success") && (
        <div className="flex h-full w-full items-center justify-center p-4">
          {stage === "rating" && (
            <SessionRating
              sessionId={params.id}
              reviewee={reviewee}
              onComplete={handleRatingComplete}
            />
          )}
          {stage === "success" && (
            <div className="flex w-full max-w-2xl flex-col items-center justify-center rounded-2xl bg-white p-8 text-center shadow-2xl dark:bg-gray-800 sm:p-12">
              <CheckCircle className="mb-6 h-16 w-16 text-green-500" />
              <h2 className="mb-2 text-2xl font-bold text-gray-900 dark:text-white">Feedback Submitted!</h2>
              <p className="mb-8 text-gray-600 dark:text-gray-400">Thank you for helping us improve. You will be redirected shortly.</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
