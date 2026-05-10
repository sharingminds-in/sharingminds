"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CreditCard, Lock, ShieldCheck } from "lucide-react"

export function PaymentForm() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CreditCard className="h-4 w-4" />
          Payment Details
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 text-blue-900 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-100">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 text-blue-600 dark:text-blue-300" />
            <div>
              <p className="font-medium">Secure checkout</p>
              <p className="mt-1 text-blue-800 dark:text-blue-200">
                Payment opens after you confirm this booking. Card, UPI, and wallet
                details are collected by the payment provider.
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-center text-xs text-gray-500 dark:text-gray-400 pt-2">
          <Lock className="h-3 w-3 mr-1.5" />
          Secure payment powered by Razorpay
        </div>
      </CardContent>
    </Card>
  )
}
