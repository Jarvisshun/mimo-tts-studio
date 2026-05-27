export interface TTSRequest {
  text: string
  model?: string
  voice?: string
  format?: string
  speed?: number
  emotion?: string
  voice_type?: 'clone' | 'design'
  voice_description?: string
}

export interface TTSResponse {
  success: boolean
  data?: {
    audio: string
    format: string
    generation_id: string
  }
  error?: { code: string; message: string }
}

export interface VoiceDesignRequest {
  description: string
  text: string
  format?: string
}

export interface BatchCreateRequest {
  name: string
  texts: string[]
  voice?: string
  model?: string
  format?: string
  speed?: number
}

export interface UpdateInfo {
  current: string
  latest: string
  has_update: boolean
  download_url: string | null
  release_notes: string | null
  error?: string
}

export interface BatchJobStatus {
  id: string
  name: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  total_items: number
  completed_items: number
  failed_items: number
  model: string
  voice: string
  format: string
  speed: number
  created_at: string
  items?: BatchItem[]
}

export interface BatchItem {
  id: string
  job_id: string
  text_content: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  audio_path?: string
  error_message?: string
  item_index: number
}

export interface HistoryItem {
  id: string
  model: string
  voice: string
  text_content: string
  audio_path: string
  format: string
  speed: number
  created_at: string
}

export interface TaskItem {
  id: string
  type: 'tts' | 'clone' | 'design' | 'batch'
  status: 'pending' | 'running' | 'completed' | 'failed'
  textPreview: string
  createdAt: string
  progress?: { current: number; total: number }
}

export interface Provider {
  id: string
  name: string
  api_key: string
  api_base: string
  models: ModelConfig[]
  is_default: boolean
}

export interface ModelConfig {
  id: string
  name: string
  type: string
  provider?: string
}
