"use client"

import { ArrowRight, TrendingUp, Award, Target } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useRouter } from "next/navigation"

const successStories = [
  {
    id: 1,
    title: "From Junior Dev to Staff Engineer",
    category: "Technology",
    before: "Junior Software Developer",
    after: "Staff Engineer at Google",
    duration: "8 months",
    improvement: "+200% salary",
    image: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=400&h=300&fit=crop",
    gradient: "from-blue-500 to-cyan-500",
  },
  {
    id: 2,
    title: "Career Pivot to Product Management",
    category: "Product",
    before: "Marketing Manager",
    after: "Senior PM at Microsoft",
    duration: "6 months",
    improvement: "Complete career switch",
    image: "https://images.unsplash.com/photo-1560250097-0b93528c311a?w=400&h=300&fit=crop",
    gradient: "from-purple-500 to-pink-500",
  },
  {
    id: 3,
    title: "Breaking into Tech from Finance",
    category: "Career Switch",
    before: "Financial Analyst",
    after: "Data Scientist at Amazon",
    duration: "10 months",
    improvement: "+150% satisfaction",
    image: "https://images.unsplash.com/photo-1551836022-deb4988cc6c0?w=400&h=300&fit=crop",
    gradient: "from-amber-500 to-orange-500",
  },
]

export function CaseStudySection() {
  const router = useRouter()

  return (
    <section id="resources" className="relative scroll-mt-24 py-20 lg:py-28 overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-slate-900 to-slate-950" />

      {/* Decorative elements */}
      <div className="absolute top-40 right-0 w-96 h-96 bg-amber-600/10 rounded-full blur-3xl" />
      <div className="absolute bottom-40 left-0 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-16">
          <Badge variant="secondary" className="mb-4 bg-amber-500/10 text-amber-400 border-amber-500/20">
            <Award className="w-3 h-3 mr-1" />
            Success Stories
          </Badge>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-6">
            Real{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-400">
              Transformations
            </span>
          </h2>
          <p className="text-lg text-slate-400 max-w-2xl mx-auto">
            See how our mentees achieved their career goals with personalized guidance from expert mentors.
          </p>
        </div>

        {/* Stories Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
          {successStories.map((story) => (
            <div
              key={story.id}
              className="group relative rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10 overflow-hidden hover:border-white/20 transition-all duration-300"
            >
              {/* Image */}
              <div className="relative h-48 overflow-hidden">
                <img
                  src={story.image}
                  alt={story.title}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/50 to-transparent" />

                {/* Category Badge */}
                <div className="absolute top-4 left-4">
                  <Badge className={`bg-gradient-to-r ${story.gradient} text-white border-0`}>
                    {story.category}
                  </Badge>
                </div>

                {/* Improvement Badge */}
                <div className="absolute bottom-4 right-4">
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-500/20 border border-green-500/30">
                    <TrendingUp className="w-4 h-4 text-green-400" />
                    <span className="text-sm font-medium text-green-400">{story.improvement}</span>
                  </div>
                </div>
              </div>

              {/* Content */}
              <div className="p-6">
                <h3 className="text-lg font-semibold text-white mb-4 group-hover:text-amber-400 transition-colors">
                  {story.title}
                </h3>

                {/* Journey */}
                <div className="space-y-3 mb-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-1 w-2 h-2 rounded-full bg-slate-500" />
                    <div>
                      <p className="text-sm text-slate-500">Before</p>
                      <p className="text-sm text-slate-300">{story.before}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className={`mt-1 w-2 h-2 rounded-full bg-gradient-to-r ${story.gradient}`} />
                    <div>
                      <p className="text-sm text-slate-500">After</p>
                      <p className="text-sm text-white font-medium">{story.after}</p>
                    </div>
                  </div>
                </div>

                {/* Duration */}
                <div className="flex items-center gap-2 pt-4 border-t border-white/10">
                  <Target className="w-4 h-4 text-slate-500" />
                  <span className="text-sm text-slate-400">
                    Achieved in <span className="text-white font-medium">{story.duration}</span>
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="mt-12 text-center">
          <Button
            size="lg"
            className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-semibold px-8 py-6 rounded-xl shadow-lg shadow-amber-500/25"
            onClick={() => router.push('/auth?mode=signup')}
          >
            Start Your Success Story
            <ArrowRight className="w-5 h-5 ml-2" />
          </Button>
        </div>
      </div>
    </section>
  )
}
