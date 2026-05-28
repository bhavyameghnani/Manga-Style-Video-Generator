from typing import Literal, Optional
from pydantic import BaseModel, EmailStr, Field

Role = Literal['admin', 'user']
StoryStatus = Literal['draft', 'generating', 'published']
PanelType = Literal['cover', 'narration', 'dialogue', 'action', 'summary']


class SignUpIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    full_name: str = Field(min_length=1)
    role: Role = 'user'
    department: Optional[str] = None


class SignInIn(BaseModel):
    email: EmailStr
    password: str


class StoryIn(BaseModel):
    title: str = Field(min_length=1)
    description: str = ''
    category: str = 'Summary'
    context_prompt: str = ''
    cover_image_url: Optional[str] = None
    status: StoryStatus = 'draft'


class StoryUpdateIn(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    context_prompt: Optional[str] = None
    cover_image_url: Optional[str] = None
    status: Optional[StoryStatus] = None
    published_at: Optional[str] = None


class PanelIn(BaseModel):
    panel_number: int
    title: str = ''
    narrative_text: str = ''
    narration_audio_url: Optional[str] = None
    narration_duration_ms: Optional[int] = None
    image_url: Optional[str] = None
    image_prompt: str = ''
    panel_type: PanelType = 'narration'
    character_name: str = ''
    character_dialogue: str = ''


class PanelsReplaceIn(BaseModel):
    panels: list[PanelIn]


class GenerateMangaIn(BaseModel):
    title: str
    description: str = ''
    context: str = ''
    category: str = 'Summary'
    document_ids: list[str] = []


class ReadUpdateIn(BaseModel):
    last_panel_read: int = Field(ge=1)
    completed: bool = False
