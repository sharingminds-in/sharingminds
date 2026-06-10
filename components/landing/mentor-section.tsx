"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Star, ChevronLeft, ChevronRight, ArrowRight, Briefcase, CheckCircle } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTRPCClient } from "@/lib/trpc/react"

interface Mentor {
  id: string
  name: string | null
  title: string | null
  company: string | null
  industry: string | null
  expertise: string | null
  experience: number | null
  hourlyRate: string | null
  image: string | null
}

export function MentorSection() {
  const [mentors, setMentors] = useState<Mentor[]>([])
  const [loading, setLoading] = useState(true)
  const [currentIndex, setCurrentIndex] = useState(0)
  const router = useRouter()
  const trpcClient = useTRPCClient()

  useEffect(() => {
    let isMounted = true

    const fetchMentors = async () => {
      try {
        const data = await trpcClient.public.listMentors.query({
          page: 1,
          pageSize: 9,
          availableOnly: true,
        })
        if (!isMounted) return
        setMentors(data.mentors ?? [])
      } catch (e) {
        console.error('Error fetching mentors:', e)
      } finally {
        if (!isMounted) return
        setLoading(false)
      }
    }
    void fetchMentors()

    return () => {
      isMounted = false
    }
  }, [trpcClient])

  const visibleCount = 3
  const maxIndex = Math.max(mentors.length - visibleCount, 0)

  const nextSlide = () => {
    setCurrentIndex(prev => Math.min(prev + 1, maxIndex))
  }

  const prevSlide = () => {
    setCurrentIndex(prev => Math.max(prev - 1, 0))
  }

  const visibleMentors = mentors.slice(currentIndex, currentIndex + visibleCount)

  const getInitials = (name: string | null) => {
    if (!name) return "M"
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
  }

  const parseExpertise = (exp: string | null) =>
    (exp ?? "").split(/[,;]\s*/g).map(s => s.trim()).filter(Boolean).slice(0, 3)

  return (
    <section id="experts" className="relative scroll-mt-24 py-20 lg:py-28 overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-slate-900 to-slate-950" />

      {/* Decorative orbs */}
      <div className="absolute top-40 -left-40 w-80 h-80 bg-purple-600/10 rounded-full blur-3xl" />
      <div className="absolute bottom-40 -right-40 w-80 h-80 bg-blue-600/10 rounded-full blur-3xl" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 mb-12">
          <div>
            <Badge variant="secondary" className="mb-4 bg-purple-500/10 text-purple-400 border-purple-500/20">
              Expert Network
            </Badge>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-4">
              Meet Our Top{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">
                Mentors
              </span>
            </h2>
            <p className="text-lg text-slate-400 max-w-2xl">
              Connect with verified industry experts who have helped thousands achieve their career goals.
            </p>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={prevSlide}
                disabled={currentIndex === 0}
                className="rounded-full border-white/20 text-white hover:bg-white/10 disabled:opacity-30"
              >
                <ChevronLeft className="w-5 h-5" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={nextSlide}
                disabled={currentIndex >= maxIndex}
                className="rounded-full border-white/20 text-white hover:bg-white/10 disabled:opacity-30"
              >
                <ChevronRight className="w-5 h-5" />
              </Button>
            </div>
            <Button
              variant="outline"
              className="hidden sm:flex border-white/20 text-white hover:bg-white/10"
              onClick={() => router.push('/auth?mode=signin')}
            >
              View All Mentors
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>

        {/* Mentors Grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-80 rounded-2xl bg-white/5 animate-pulse" />
            ))}
          </div>
        ) : mentors.length === 0 ? (
          <div className="text-center py-20 text-slate-400">
            No mentors available at the moment.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {visibleMentors.map((mentor) => {
              const skills = parseExpertise(mentor.expertise)
              return (
                <div
                  key={mentor.id}
                  className="group relative rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10 hover:border-purple-500/30 overflow-hidden transition-all duration-300 hover:bg-white/10"
                >
                  {/* Card Header with gradient */}
                  <div className="h-24 bg-gradient-to-br from-purple-600/20 to-blue-600/20 relative">
                    <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0wIDBoNDB2NDBoLTQweiIvPjxwYXRoIGQ9Ik00MCAwdjQwIiBzdHJva2U9InJnYmEoMjU1LDI1NSwyNTUsMC4wNSkiIHN0cm9rZS13aWR0aD0iMSIvPjxwYXRoIGQ9Ik0wIDQwaDQwIiBzdHJva2U9InJnYmEoMjU1LDI1NSwyNTUsMC4wNSkiIHN0cm9rZS13aWR0aD0iMSIvPjwvZz48L3N2Zz4=')] opacity-50" />
                  </div>

                  {/* Avatar */}
                  <div className="absolute top-12 left-6">
                    <div className="relative">
                      {mentor.image ? (
                        <img
                          src={mentor.image}
                          alt={mentor.name || 'Mentor'}
                          className="w-20 h-20 rounded-2xl object-cover border-4 border-slate-900 shadow-xl"
                        />
                      ) : (
                        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 border-4 border-slate-900 flex items-center justify-center text-white text-2xl font-bold shadow-xl">
                          {getInitials(mentor.name)}
                        </div>
                      )}
                      <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-green-500 rounded-full border-2 border-slate-900 flex items-center justify-center">
                        <CheckCircle className="w-3.5 h-3.5 text-white" />
                      </div>
                    </div>
                  </div>

                  {/* Content */}
                  <div className="pt-14 px-6 pb-6">
                    <div className="mb-4">
                      <h3 className="text-lg font-semibold text-white group-hover:text-purple-400 transition-colors">
                        {mentor.name || 'Expert Mentor'}
                      </h3>
                      <p className="text-sm text-slate-400 flex items-center gap-1.5 mt-1">
                        <Briefcase className="w-3.5 h-3.5" />
                        {mentor.title || 'Professional'} {mentor.company && `@ ${mentor.company}`}
                      </p>
                    </div>

                    {/* Skills */}
                    {skills.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-4">
                        {skills.map((skill, i) => (
                          <span
                            key={i}
                            className="px-2.5 py-1 rounded-md bg-purple-500/10 text-purple-400 text-xs border border-purple-500/20"
                          >
                            {skill}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Stats */}
                    <div className="flex items-center justify-between pt-4 border-t border-white/10">
                      <div className="flex items-center gap-4 text-sm">
                        <div className="flex items-center gap-1 text-slate-400">
                          <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                          <span className="text-white font-medium">5.0</span>
                        </div>
                        <div className="flex items-center gap-1 text-slate-400">
                          <span>{mentor.experience || 5}+ yrs</span>
                        </div>
                      </div>
                      {mentor.hourlyRate && (
                        <div className="text-sm">
                          <span className="text-white font-semibold">${mentor.hourlyRate}</span>
                          <span className="text-slate-500">/hr</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Hover overlay with CTA */}
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-6">
                    <Button
                      className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white"
                      onClick={() => router.push('/auth?mode=signin')}
                    >
                      View Profile
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Mobile CTA */}
        <div className="mt-8 text-center sm:hidden">
          <Button
            className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white"
            onClick={() => router.push('/auth?mode=signin')}
          >
            Explore All Mentors
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>
    </section>
  )
}
