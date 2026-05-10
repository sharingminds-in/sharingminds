"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { useValidateMentorCouponMutation } from "@/hooks/queries/use-mentor-queries"
import { useRazorpayCheckout } from "@/hooks/use-razorpay-checkout"
import { useTRPCClient } from "@/lib/trpc/react"
import type { PaymentCheckoutPayload } from "@/lib/payments/types"
import {
    CheckCircle,
    ArrowRight,
    CreditCard,
    Lock,
    ShieldCheck
} from "lucide-react"

interface MentorProfile {
    email?: string;
    paymentStatus?: 'PENDING' | 'COMPLETED' | 'FAILED';
}

interface MentorPaymentGateProps {
    user?: { name?: string; email?: string } | null;
    mentorProfile?: MentorProfile | null;
    onPaymentComplete: () => Promise<void> | void;
}

export function MentorPaymentGate({ user, mentorProfile, onPaymentComplete }: MentorPaymentGateProps) {
    const firstName = user?.name?.split(' ')[0] || 'Mentor'
    const email = mentorProfile?.email || user?.email
    const [couponCode, setCouponCode] = useState('')
    const [couponApplied, setCouponApplied] = useState(false)
    const [applyError, setApplyError] = useState<string | null>(null)
    const [validationMessage, setValidationMessage] = useState<string | null>(null)
    const [isCompleting, setIsCompleting] = useState(false)
    const validateCouponMutation = useValidateMentorCouponMutation()
    const trpcClient = useTRPCClient()
    const openPaymentCheckout = useRazorpayCheckout()

    const handleApplyCoupon = async () => {
        const normalizedCode = couponCode.trim().toUpperCase()
        if (!normalizedCode) {
            setApplyError('Enter a coupon code to continue')
            return
        }

        setApplyError(null)
        setValidationMessage(null)

        try {
            const data = await validateCouponMutation.mutateAsync({
                couponCode: normalizedCode,
            })

            setCouponApplied(true)
            setValidationMessage(data?.message || 'Coupon accepted — you can now continue without payment.')
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to validate coupon code'
            setCouponApplied(false)
            setApplyError(message)
        }
    }

    const handleContinueWithoutPayment = async () => {
        if (!couponApplied || isCompleting) return
        setIsCompleting(true)
        try {
            await onPaymentComplete?.()
        } finally {
            setIsCompleting(false)
        }
    }

    const handleProceedToPayment = async () => {
        if (isCompleting) return
        setIsCompleting(true)
        try {
            const payment = (await trpcClient.payments.startMentorOnboarding.mutate()) as PaymentCheckoutPayload
            await openPaymentCheckout(payment)
            await onPaymentComplete?.()
        } finally {
            setIsCompleting(false)
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center py-12 px-4 bg-gray-50 dark:bg-gray-900">
            <Card className="w-full max-w-3xl border-t-4 border-t-blue-600 shadow-xl">
                <CardHeader className="space-y-4">
                    <div className="flex items-center gap-3">
                        <CreditCard className="h-10 w-10 text-blue-600" />
                        <div>
                            <CardTitle>Complete your mentor activation</CardTitle>
                            <CardDescription>
                                Access to the mentor workspace requires a one-time onboarding payment.
                            </CardDescription>
                        </div>
                    </div>
                    <Badge className="w-fit bg-yellow-100 text-yellow-800">Payment pending</Badge>
                </CardHeader>
                <CardContent className="space-y-8">
                    <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-5 flex gap-3 text-blue-900">
                        <Lock className="h-5 w-5 mt-1 text-blue-600" />
                        <div className="space-y-1 text-sm">
                            <p className="font-semibold">Hi {firstName},</p>
                            <p>Your dashboard is locked until we confirm your mentor subscription payment.</p>
                            <p className="text-blue-800">
                                Once payment is completed you'll regain access to mentee requests, scheduling, and payouts.
                            </p>
                        </div>
                    </div>

                    <div className="grid gap-6 md:grid-cols-2">
                        <div className="space-y-4">
                            <div className="rounded-2xl border bg-white dark:bg-gray-800 p-5 shadow-sm">
                                <p className="text-sm text-gray-500 dark:text-gray-400">Mentor onboarding fee</p>
                                <p className="text-4xl font-bold text-gray-900 dark:text-white mt-2">₹5K</p>
                                <p className="text-xs text-gray-500 dark:text-gray-400">One-time payment • refundable if we can't activate your account</p>
                                <div className="mt-4 space-y-2 text-sm text-gray-600 dark:text-gray-300">
                                    <div className="flex items-center gap-2">
                                        <ShieldCheck className="h-4 w-4 text-green-600" />
                                        <span>Priority profile verification</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <ShieldCheck className="h-4 w-4 text-green-600" />
                                        <span>Mentor success onboarding kit</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <ShieldCheck className="h-4 w-4 text-green-600" />
                                        <span>Marketplace visibility boost</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="rounded-2xl border bg-gray-50 dark:bg-gray-800 p-5">
                                <p className="text-sm text-gray-600 dark:text-gray-400">We'll send the receipt and instructions to</p>
                                <p className="text-lg font-semibold text-gray-900 dark:text-white">{email || 'your registered email'}</p>
                                <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                                    Need an invoice for bookkeeping? Reply to that email and our finance team will help you within 24 hours.
                                </p>
                                <div className="mt-6 space-y-2 text-sm">
                                    <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                                        <ShieldCheck className="h-4 w-4 text-green-600" />
                                        <span>Secure payments powered by Razorpay</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                                        <Lock className="h-4 w-4 text-blue-600" />
                                        <span>Refund guarantee if activation fails</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="rounded-2xl border border-dashed border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 p-5">
                        <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">Have a coupon code?</p>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Enter your mentor coupon to skip the onboarding payment.</p>
                        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                            <Input
                                placeholder="Enter coupon code"
                                value={couponCode}
                                onChange={(event) => {
                                    setCouponCode(event.target.value.toUpperCase())
                                    setCouponApplied(false)
                                    setApplyError(null)
                                    setValidationMessage(null)
                                }}
                                className="flex-1 uppercase"
                            />
                            <Button
                                variant="outline"
                                onClick={handleApplyCoupon}
                                className="sm:w-auto"
                                disabled={validateCouponMutation.isPending}
                            >
                                {validateCouponMutation.isPending ? 'Applying...' : 'Apply coupon'}
                            </Button>
                        </div>
                        {applyError && (
                            <p className="mt-3 text-xs text-red-600">{applyError}</p>
                        )}
                        {couponApplied && validationMessage ? (
                            <div className="mt-3 flex items-center gap-2 rounded-md bg-green-50 dark:bg-green-900/30 px-3 py-2 text-sm text-green-800 dark:text-green-300">
                                <CheckCircle className="h-4 w-4" />
                                <span>{validationMessage}</span>
                            </div>
                        ) : (
                            !applyError && (
                                <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">Valid coupons waive the onboarding fee instantly.</p>
                            )
                        )}
                    </div>

                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            You'll be redirected to our secure payment partner. Completing payment instantly unlocks your access.
                        </p>
                        <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
                            <Button
                                className="bg-blue-600 hover:bg-blue-700 text-white"
                                disabled={isCompleting}
                                onClick={handleProceedToPayment}
                            >
                                Proceed to payment
                                <ArrowRight className="ml-2 h-4 w-4" />
                            </Button>
                            <Button
                                variant="secondary"
                                disabled={!couponApplied || isCompleting}
                                className={`sm:w-auto ${!couponApplied || isCompleting ? 'cursor-not-allowed opacity-70' : ''}`}
                                onClick={handleContinueWithoutPayment}
                            >
                                {isCompleting ? 'Continuing...' : 'Continue without payment'}
                            </Button>
                            <Button variant="outline" className="border-dashed">
                                Contact support
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
