"use client"

import { Button } from "@/components/ui/button"
import { ArrowRight, Sparkles, CheckCircle } from "lucide-react"
import { useRouter } from "next/navigation"

const benefits = [
    "Free to get started",
    "No credit card required",
    "Cancel anytime",
]

export function CTASection() {
    const router = useRouter()

    return (
        <section id="pricing" className="relative scroll-mt-24 py-20 lg:py-28 overflow-hidden">
            {/* Background with gradient */}
            <div className="absolute inset-0 bg-gradient-to-br from-blue-600 via-purple-600 to-pink-600">
                {/* Overlay pattern */}
                <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0wIDBoNDB2NDBoLTQweiIvPjxwYXRoIGQ9Ik00MCAwdjQwIiBzdHJva2U9InJnYmEoMjU1LDI1NSwyNTUsMC4xKSIgc3Ryb2tlLXdpZHRoPSIxIi8+PHBhdGggZD0iTTAgNDBoNDAiIHN0cm9rZT0icmdiYSgyNTUsMjU1LDI1NSwwLjEpIiBzdHJva2Utd2lkdGg9IjEiLz48L2c+PC9zdmc+')] opacity-30" />
                {/* Animated orbs */}
                <div className="absolute top-20 left-20 w-72 h-72 bg-white/10 rounded-full blur-3xl animate-pulse" />
                <div className="absolute bottom-20 right-20 w-72 h-72 bg-white/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
            </div>

            <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
                {/* Badge */}
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 mb-8">
                    <Sparkles className="w-4 h-4 text-yellow-300" />
                    <span className="text-sm font-medium text-white">Start your journey today</span>
                </div>

                {/* Headline */}
                <h2 className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-bold text-white mb-6 leading-tight">
                    Ready to Transform{' '}
                    <span className="text-yellow-300">Your Career?</span>
                </h2>

                {/* Subheadline */}
                <p className="text-lg lg:text-xl text-white/80 mb-10 max-w-2xl mx-auto">
                    Join thousands of professionals who have accelerated their careers with personalized mentorship from industry experts.
                </p>

                {/* CTA Buttons */}
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-10">
                    <Button
                        size="lg"
                        className="w-full sm:w-auto bg-white text-purple-700 hover:bg-white/90 font-semibold px-8 py-6 rounded-xl shadow-xl hover:shadow-2xl transition-all duration-300 group"
                        onClick={() => router.push('/auth?mode=signup')}
                    >
                        Get Started Free
                        <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
                    </Button>
                    <Button
                        variant="outline"
                        size="lg"
                        className="w-full sm:w-auto border-white/30 text-white hover:bg-white/10 px-8 py-6 rounded-xl"
                        onClick={() => router.push('/auth?mode=signin')}
                    >
                        Browse Mentors
                    </Button>
                </div>

                {/* Benefits */}
                <div className="flex flex-wrap items-center justify-center gap-6">
                    {benefits.map((benefit, i) => (
                        <div key={i} className="flex items-center gap-2 text-white/80">
                            <CheckCircle className="w-5 h-5 text-green-300" />
                            <span className="text-sm font-medium">{benefit}</span>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    )
}
