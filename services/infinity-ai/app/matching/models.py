from typing import Any

from pydantic import BaseModel, Field


class PlatformBoostRule(BaseModel):
    id: str
    mentorProfileId: str
    ruleType: str
    categoryScope: dict[str, Any] = Field(default_factory=dict)
    priorityMultiplier: float
    inclusionPercentageCap: int
    maxImpressions: int | None = None
    startsAt: str
    expiresAt: str
    status: str
    reason: str


class CandidateMetrics(BaseModel):
    completedSessions: int = 0
    cancelledSessions: int = 0
    avgReviewScore: float = 0.0
    reviewCount: int = 0
    recentImpressions7d: int = 0
    recentClicks7d: int = 0
    recentBookings30d: int = 0
    recentCompletions90d: int = 0
    lastShownAt: str | None = None


class PlatformCandidate(BaseModel):
    mentorProfileId: str
    mentorUserId: str
    name: str
    title: str | None = None
    company: str | None = None
    industry: str | None = None
    headline: str | None = None
    about: str | None = None
    image: str | None = None
    location: str | None = None
    hourlyRate: float | None = None
    currency: str | None = None
    experienceYears: int | None = None
    expertise: list[str] = Field(default_factory=list)
    intentTags: list[str] = Field(default_factory=list)
    outcomeTags: list[str] = Field(default_factory=list)
    industryTags: list[str] = Field(default_factory=list)
    personaFitTags: list[str] = Field(default_factory=list)
    keywordTrustScore: float = 0.0
    contentAuthorityScore: float = 0.0
    qualityScore: float = 0.0
    conversionScore: float = 0.0
    allocationSnapshot: dict[str, Any] = Field(default_factory=dict)
    metadataQualityStatus: str = "derived_v1"
    metrics: CandidateMetrics = Field(default_factory=CandidateMetrics)
    activeBoostRules: list[PlatformBoostRule] = Field(default_factory=list)


class ScoredCandidate(BaseModel):
    candidate: PlatformCandidate
    intent_match_score: float
    outcome_match_score: float
    persona_match_score: float
    expertise_relevance_score: float
    conversion_probability_score: float
    admin_priority_score: float
    exposure_balancing_score: float
    final_score: float
    selected: bool = False
    slot_type: str | None = None
    score_explanation: dict[str, Any] = Field(default_factory=dict)


class PlatformResourceCandidate(BaseModel):
    resourceId: str
    resourceType: str
    title: str
    description: str | None = None
    href: str
    source: str = "courses"
    visibility: str = "public"
    providerName: str | None = None
    category: str | None = None
    difficulty: str | None = None
    durationMinutes: int | None = None
    price: float | None = None
    currency: str | None = None
    image: str | None = None
    tags: list[str] = Field(default_factory=list)
    learningOutcomes: list[str] = Field(default_factory=list)
    intentTags: list[str] = Field(default_factory=list)
    outcomeTags: list[str] = Field(default_factory=list)
    avgRating: float = 0.0
    reviewCount: int = 0
    enrollmentCount: int = 0
    metadata: dict[str, Any] = Field(default_factory=dict)


class ScoredResourceCandidate(BaseModel):
    candidate: PlatformResourceCandidate
    intent_match_score: float
    outcome_match_score: float
    context_relevance_score: float
    quality_score: float
    accessibility_score: float
    final_score: float
    selected: bool = False
    slot_type: str | None = None
    score_explanation: dict[str, Any] = Field(default_factory=dict)
