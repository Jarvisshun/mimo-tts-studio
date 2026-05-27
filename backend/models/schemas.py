from pydantic import BaseModel, Field
from typing import Optional
from enum import Enum


class AudioFormat(str, Enum):
    wav = "wav"
    mp3 = "mp3"
    pcm = "pcm"
    pcm16 = "pcm16"


class TTSRequest(BaseModel):
    text: str = Field(..., max_length=5000)
    model: str = Field(default="mimo-v2.5-tts")
    voice: str = Field(default="mimo_default")
    format: AudioFormat = Field(default=AudioFormat.wav)
    speed: float = Field(default=1.0, ge=0.5, le=2.0)
    emotion: Optional[str] = None
    voice_type: Optional[str] = None  # 'clone' or 'design' — triggers different model
    voice_description: Optional[str] = None  # for voice_type='design'


class VoiceDesignRequest(BaseModel):
    description: str = Field(..., max_length=500)
    text: str = Field(..., max_length=5000)
    format: AudioFormat = Field(default=AudioFormat.wav)


class BatchCreateRequest(BaseModel):
    name: str
    texts: list[str]
    voice: str = Field(default="mimo_default")
    model: str = Field(default="mimo-v2.5-tts")
    format: AudioFormat = Field(default=AudioFormat.wav)
    speed: float = Field(default=1.0, ge=0.5, le=2.0)


class VoiceCreate(BaseModel):
    name: str = Field(..., max_length=200)
    type: str = Field(..., pattern="^(clone|design)$")
    voice_id: Optional[str] = None
    description: Optional[str] = Field(default=None, max_length=500)
    audio_path: Optional[str] = None
