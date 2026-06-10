from pydantic import BaseModel, Field


class MemoryItem(BaseModel):
    memory_type: str
    content: str
    confidence: float
    provenance: dict = Field(default_factory=dict)
