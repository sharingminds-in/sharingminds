class InfinityAiError(Exception):
    """Base Infinity AI error."""


class ProviderUnavailableError(InfinityAiError):
    """Raised when LLM access is required but unavailable."""


class ProviderRateLimitError(ProviderUnavailableError):
    """Raised when an LLM provider is temporarily rate limited."""


class ProviderRequestError(ProviderUnavailableError):
    """Raised when a provider rejects the request payload or schema."""


class LlmValidationError(InfinityAiError):
    """Raised when an LLM response fails required structured validation."""


class InternalAuthError(InfinityAiError):
    """Raised for invalid internal auth."""


class PlatformBridgeError(InfinityAiError):
    """Raised when the Next.js platform bridge fails."""
