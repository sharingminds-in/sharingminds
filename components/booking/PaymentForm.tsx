"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CreditCard, Lock, ShieldCheck } from "lucide-react"

export function PaymentForm() {
  return (
    <Card className="border-blue-100 bg-blue-50/70 dark:border-blue-900/40 dark:bg-blue-950/20">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <CreditCard className="h-4 w-4" />
          Secure checkout
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-blue-900 dark:text-blue-100">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-4 w-4 text-blue-600 dark:text-blue-300" />
          <p className="leading-relaxed">
            Payment opens after confirmation. Card, UPI, and wallet details are
            collected by Razorpay.
          </p>
        </div>
        <div className="flex items-center text-xs text-blue-700 dark:text-blue-200">
          <Lock className="h-3 w-3 mr-1.5" />
          Secure payment powered by Razorpay
        </div>
      </CardContent>
    </Card>
  )
}
