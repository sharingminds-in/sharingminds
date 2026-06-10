from __future__ import annotations

from dataclasses import dataclass

from pydantic import BaseModel, Field


def _normalize(value: str) -> str:
    return value.strip().lower().replace("_", " ").replace("-", " ")


@dataclass(frozen=True)
class DomainTaxonomyEntry:
    canonical_domain: str
    aliases: tuple[str, ...]
    industries: tuple[str, ...]
    expertise_keywords: tuple[str, ...]


class DomainExpansion(BaseModel):
    canonical_domains: list[str] = Field(default_factory=list)
    industries: list[str] = Field(default_factory=list)
    expertise_keywords: list[str] = Field(default_factory=list)
    matched_aliases: list[str] = Field(default_factory=list)


DOMAIN_TAXONOMY: tuple[DomainTaxonomyEntry, ...] = (
    DomainTaxonomyEntry(
        canonical_domain="technology",
        aliases=(
            "computer",
            "computers",
            "computer science",
            "cs",
            "coding",
            "programming",
            "software",
            "software engineering",
            "tech",
            "technology",
            "it",
        ),
        industries=("technology", "software engineering", "computer science"),
        expertise_keywords=(
            "software",
            "programming",
            "computer science",
            "software engineering",
            "technology",
        ),
    ),
    DomainTaxonomyEntry(
        canonical_domain="business",
        aliases=(
            "business",
            "startup",
            "startups",
            "founder",
            "entrepreneurship",
            "sme",
            "scaling",
        ),
        industries=("business", "entrepreneurship", "startups"),
        expertise_keywords=("startup", "business growth", "entrepreneurship", "scaling"),
    ),
    DomainTaxonomyEntry(
        canonical_domain="career",
        aliases=(
            "career",
            "jobs",
            "job",
            "work",
            "employment",
            "career growth",
            "career planning",
        ),
        industries=("career services",),
        expertise_keywords=("career planning", "career growth", "job search"),
    ),
    DomainTaxonomyEntry(
        canonical_domain="education",
        aliases=(
            "study",
            "studies",
            "education",
            "masters",
            "university",
            "college",
            "study abroad",
        ),
        industries=("education", "higher education"),
        expertise_keywords=("study abroad", "higher education", "university planning"),
    ),
)


def _append_unique(target: list[str], values: tuple[str, ...] | list[str]) -> None:
    seen = {_normalize(value) for value in target}
    for value in values:
        normalized = _normalize(value)
        if normalized and normalized not in seen:
            target.append(value)
            seen.add(normalized)


def expand_domain_terms(values: list[str]) -> DomainExpansion:
    normalized_values = {_normalize(value) for value in values if _normalize(value)}
    expansion = DomainExpansion()

    for entry in DOMAIN_TAXONOMY:
        matched_aliases = [
            alias
            for alias in entry.aliases
            if _normalize(alias) in normalized_values
        ]
        if not matched_aliases:
            continue

        _append_unique(expansion.canonical_domains, [entry.canonical_domain])
        _append_unique(expansion.industries, entry.industries)
        _append_unique(expansion.expertise_keywords, entry.expertise_keywords)
        _append_unique(expansion.matched_aliases, matched_aliases)

    return expansion
