// app/api/public-mentors/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { mentors, users } from '@/lib/db/schema'
import { and, eq, ilike, or, desc, sql } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { enforceFeature, consumeFeature, isSubscriptionPolicyError } from '@/lib/subscriptions/policy-runtime'
import type { SubscriptionPolicyAction } from '@/lib/subscriptions/policies'
import { listActiveSubscriptionUserIds } from '@/lib/db/queries/subscriptions'

// Force Node runtime (DB drivers), and avoid any ISR caching
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)

    // Pagination
    const page = Math.max(1, Number(searchParams.get('page') ?? '1'))
    const pageSize = Math.min(50, Math.max(1, Number(searchParams.get('pageSize') ?? '12')))
    const offset = (page - 1) * pageSize

    // Filters
    const q = (searchParams.get('q') ?? '').trim()
    const industry = (searchParams.get('industry') ?? '').trim()
    const availableOnly = (searchParams.get('availableOnly') ?? 'true') === 'true'
    const aiSearch = (searchParams.get('ai') ?? 'false') === 'true'
    const aiFilterOnly = (searchParams.get('aiFilterOnly') ?? 'false') === 'true'
    const requiresAiEligibilityFilters = aiSearch || aiFilterOnly

    let requesterId: string | null = null

    const resolveFeatureAccess = async (
      userId: string,
      primaryAction: 'ai.search.sessions' | 'mentor.ai.visibility',
      fallbackAction?: 'ai.search.sessions_monthly'
    ) => {
      const primary = await enforceFeature({ action: primaryAction, userId }).catch((error) => {
        if (isSubscriptionPolicyError(error)) return null
        throw error
      })
        if (primary?.has_access) {
          return { action: primaryAction, access: primary }
        }
        if (fallbackAction) {
          const fallback = await enforceFeature({ action: fallbackAction, userId }).catch((error) => {
            if (isSubscriptionPolicyError(error)) return null
            throw error
          })
          if (fallback?.has_access) {
            return { action: fallbackAction, access: fallback }
          }
          return { action: primaryAction, access: primary || fallback }
        }
        return { action: primaryAction, access: primary }
      }

    const tryFeatureAccess = async (userId: string, action: SubscriptionPolicyAction) => {
      const result = await enforceFeature({ action, userId }).catch((error) => {
        if (isSubscriptionPolicyError(error)) return null
        throw error
      })
      return Boolean(result?.has_access)
    }

    const ensureMenteeSessionAvailability = async (userId: string) => {
      const freeAvailable = await tryFeatureAccess(userId, 'booking.mentee.free_session')
      if (freeAvailable) return true
      const paidAvailable = await tryFeatureAccess(userId, 'booking.mentee.paid_session')
      return paidAvailable
    }

    if (aiSearch) {
      const session = await auth.api.getSession({ headers: req.headers })
      requesterId = session?.user?.id || null

      if (!requesterId) {
        return NextResponse.json(
          { success: false, error: 'Authentication required for AI search' },
          { status: 401 }
        )
      }

      const requesterAccess = await resolveFeatureAccess(
        requesterId,
        'ai.search.sessions',
        'ai.search.sessions_monthly'
      )
      if (!requesterAccess.access?.has_access) {
        const errorPayload = (requesterAccess.access as any)?.payload
        if (errorPayload) {
          return NextResponse.json(errorPayload, { status: 403 })
        }
        return NextResponse.json(
          { success: false, error: 'AI search not included in your plan' },
          { status: 403 }
        )
      }

      const sessionAvailability = await ensureMenteeSessionAvailability(requesterId)
      if (!sessionAvailability) {
        return NextResponse.json(
          { success: false, error: 'Session bookings are not included in your plan' },
          { status: 403 }
        )
      }
    }

    // WHERE clauses
    const whereClauses: any[] = [eq(mentors.verificationStatus, 'VERIFIED' as const)]
    if (availableOnly) whereClauses.push(eq(mentors.isAvailable, true))
    if (requiresAiEligibilityFilters) whereClauses.push(eq(mentors.searchMode, 'AI_SEARCH'))
    if (industry) whereClauses.push(ilike(mentors.industry, `%${industry}%`))
    if (q) {
      // Adjust fields to match your schema (users.name/title/company present in your select below)
      whereClauses.push(
        or(
          ilike(users.name, `%${q}%`),
          ilike(mentors.title, `%${q}%`),
          ilike(mentors.company, `%${q}%`)
        )
      )
    }

    // Main page of mentors (safe public fields)
    const rows = await db
      .select({
        id: mentors.id,
        userId: mentors.userId,
        title: mentors.title,
        company: mentors.company,
        industry: mentors.industry,
        expertise: mentors.expertise,
        experience: mentors.experience,          // number
        hourlyRate: sql<string | null>`COALESCE(
          ${mentors.adminHourlyRateOverride},
          ${mentors.hourlyRate}
        )`,
        currency: mentors.currency,
        headline: mentors.headline,
        about: mentors.about,
        linkedinUrl: mentors.linkedinUrl,
        githubUrl: mentors.githubUrl,
        websiteUrl: mentors.websiteUrl,
        verificationStatus: mentors.verificationStatus,
        isAvailable: mentors.isAvailable,
        // joined user basics
        name: users.name,
        image: users.image,
      })
      .from(mentors)
      .innerJoin(users, eq(mentors.userId, users.id))
      .where(and(...whereClauses))
      .orderBy(desc(mentors.createdAt))
      .limit(pageSize)
      .offset(offset)

    type MentorRow = typeof rows[number]
    let filteredRows = rows

    if (requiresAiEligibilityFilters) {
      if (filteredRows.length > 0) {
        const mentorUserIds = filteredRows.map((row: MentorRow) => row.userId)
        const eligibleMentorIds = await listActiveSubscriptionUserIds(mentorUserIds)
        filteredRows = filteredRows.filter((row: MentorRow) => eligibleMentorIds.has(row.userId))
      }
    }

    if (aiSearch && requesterId) {
      if (filteredRows.length > 0) {
        const eligibilityChecks = await Promise.all(
          filteredRows.map(async (row: MentorRow) => {
            try {
              const [freeAccess, paidAccess, visibilityAccess] = await Promise.all([
                enforceFeature({ action: 'mentor.free_session_availability', userId: row.userId }).catch(
                  (error) => {
                    if (isSubscriptionPolicyError(error)) return null
                    throw error
                  }
                ),
                enforceFeature({ action: 'mentor.paid_session_availability', userId: row.userId }).catch(
                  (error) => {
                    if (isSubscriptionPolicyError(error)) return null
                    throw error
                  }
                ),
                resolveFeatureAccess(row.userId, 'mentor.ai.visibility'),
              ])
              const sessionAvailable =
                Boolean((freeAccess as any)?.has_access) || Boolean((paidAccess as any)?.has_access)
              return {
                row,
                eligible:
                  sessionAvailable &&
                  (visibilityAccess as any)?.access?.has_access === true,
                visibilityAction: (visibilityAccess as any)?.action,
              }
            } catch (error) {
              console.error('Failed to check mentor eligibility:', error)
              return { row, eligible: false, visibilityAction: null }
            }
          })
        )

        filteredRows = eligibilityChecks
          .filter((item: { eligible: boolean }) => item.eligible)
          .map((item: { row: MentorRow }) => item.row)

        const visibilityKeyByUser = new Map<string, SubscriptionPolicyAction>(
          eligibilityChecks
            .filter((item: { eligible: boolean }) => item.eligible)
            .map((item: { row: MentorRow; visibilityAction: SubscriptionPolicyAction | null }) => [
              item.row.userId,
              item.visibilityAction || 'mentor.ai.visibility',
            ])
        )

        const requesterAccess = await resolveFeatureAccess(
          requesterId,
          'ai.search.sessions',
          'ai.search.sessions_monthly'
        )
        if (requesterAccess.access?.has_access) {
          await consumeFeature({
            action: requesterAccess.action,
            userId: requesterId,
            resourceType: 'ai_search',
          })
        }

        for (const row of filteredRows) {
          const visibilityAction = visibilityKeyByUser.get(row.userId)
          if (!visibilityAction) continue
          try {
            await consumeFeature({
              action: visibilityAction,
              userId: row.userId,
              resourceType: 'mentor_profile',
              resourceId: row.id,
            })
          } catch (error) {
            console.error('Failed to track mentor visibility:', error)
          }
        }
      }
    }

    // Lightweight pagination (no expensive COUNT)
    const hasMore = filteredRows.length === pageSize

    return NextResponse.json({
      success: true,
      data: filteredRows,
      pagination: { page, pageSize, hasMore }
    })
  } catch (error: any) {
    // Log the full error on the server for debugging
    console.error('Error fetching public mentors:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch mentors' },
      { status: 500 }
    )
  }
}
