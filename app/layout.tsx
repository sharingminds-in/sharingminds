import type React from "react"
import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "@livekit/components-styles" // Import LiveKit's default styles FIRST
import "./globals.css" // Our custom overrides load AFTER (higher priority)
import { ThemeProvider } from "next-themes"
import { AuthProvider } from "@/contexts/auth-context"
import { ErrorBoundary } from "@/components/common/error-boundary"
import { QueryProvider } from "@/providers/query-provider"
import { Toaster } from "@/components/ui/sonner"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "SharingMinds",
  description: "A personalized mentor and mentee connect platform.",
  generator: 'v0.dev',
  icons: {
    icon: "/icon.png",
    shortcut: "/icon.png",
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className} suppressHydrationWarning>
        <ErrorBoundary>
          <QueryProvider>
            <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
              <AuthProvider>
                {children}
                <Toaster />
              </AuthProvider>
            </ThemeProvider>
          </QueryProvider>
        </ErrorBoundary>
      </body>
    </html>
  )
}
