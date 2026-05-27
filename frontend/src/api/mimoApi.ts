import type { TTSRequest, TTSResponse, VoiceDesignRequest } from './types'
import { getProviderApiKey } from '../db/database'
import { saveAudio } from '../storage/audioStorage'
import { pcmToWavBase64 } from '../utils/audio'

interface MiMoConfig {
  apiKey: string
  apiBase: string
}

async function getConfig(): Promise<MiMoConfig> {
  const provider = await getProviderApiKey()
  if (provider) return { apiKey: provider.api_key, apiBase: provider.api_base }
  return { apiKey: '', apiBase: 'https://token-plan-cn.xiaomimimo.com/v1' }
}

function headers(apiKey: string): Record<string, string> {
  return {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  }
}

export async function tts(req: TTSRequest): Promise<{ audio: string; format: string }> {
  const { apiKey, apiBase } = await getConfig()
  const messages: Array<{ role: string; content: string }> = []
  if (req.emotion) messages.push({ role: 'user', content: `用${req.emotion}的语气说` })
  messages.push({ role: 'assistant', content: req.text })

  // MiMo API only supports wav/mp3 — always request wav, convert to pcm later if needed
  const apiFormat = (req.format === 'pcm' || req.format === 'pcm16') ? 'wav' : (req.format || 'wav')

  const payload = {
    model: req.model || 'mimo-v2.5-tts',
    messages,
    modalities: ['text', 'audio'],
    audio: { voice: req.voice || 'mimo_default', format: apiFormat, speed: req.speed || 1.0 },
    stream: false,
  }

  const resp = await fetch(`${apiBase}/chat/completions`, {
    method: 'POST',
    headers: headers(apiKey),
    body: JSON.stringify(payload),
  })
  if (!resp.ok) throw new Error(`TTS API error: ${resp.status}`)
  const data = await resp.json()
  const audioData = data.choices?.[0]?.message?.audio?.data
  if (!audioData) throw new Error('Invalid TTS response: missing audio data')
  return {
    audio: audioData,
    format: req.format || 'wav',
  }
}

export async function* ttsStream(
  req: TTSRequest
): AsyncGenerator<{ type: string; data?: string }> {
  const { apiKey, apiBase } = await getConfig()
  const messages: Array<{ role: string; content: string }> = []
  if (req.emotion) messages.push({ role: 'user', content: `用${req.emotion}的语气说` })
  messages.push({ role: 'assistant', content: req.text })

  const apiFormat = (req.format === 'pcm' || req.format === 'pcm16') ? 'wav' : (req.format || 'wav')

  const payload = {
    model: req.model || 'mimo-v2.5-tts',
    messages,
    modalities: ['text', 'audio'],
    audio: { voice: req.voice || 'mimo_default', format: apiFormat, speed: req.speed || 1.0 },
    stream: true,
  }

  const resp = await fetch(`${apiBase}/chat/completions`, {
    method: 'POST',
    headers: headers(apiKey),
    body: JSON.stringify(payload),
  })
  if (!resp.ok) throw new Error(`TTS stream API error: ${resp.status}`)
  if (!resp.body) throw new Error('TTS stream response body is empty')

  const reader = resp.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const chunk = line.slice(6)
      if (chunk === '[DONE]') { yield { type: 'complete' }; return }
      try {
        const data = JSON.parse(chunk)
        const delta = data.choices?.[0]?.delta
        if (delta?.audio?.data) yield { type: 'audio_chunk', data: delta.audio.data }
      } catch { continue }
    }
  }
}

export async function voiceClone(
  text: string,
  audioBase64: string,
  audioFormat: string = 'wav',
  outputFormat: string = 'wav',
  emotion?: string
): Promise<{ audio: string; format: string }> {
  const { apiKey, apiBase } = await getConfig()
  const voiceDataUrl = `data:audio/${audioFormat};base64,${audioBase64}`

  const messages: Array<{ role: string; content: string }> = []
  messages.push({ role: 'user', content: emotion ? `用${emotion}的语气说` : 'clone' })
  messages.push({ role: 'assistant', content: text })

  // MiMo API only supports wav/mp3 — always request wav, convert to pcm later if needed
  const apiFormat = (outputFormat === 'pcm' || outputFormat === 'pcm16') ? 'wav' : outputFormat

  const payload = {
    model: 'mimo-v2.5-tts-voiceclone',
    messages,
    modalities: ['text', 'audio'],
    audio: { voice: voiceDataUrl, format: apiFormat },
    stream: false,
  }

  const resp = await fetch(`${apiBase}/chat/completions`, {
    method: 'POST',
    headers: headers(apiKey),
    body: JSON.stringify(payload),
  })
  if (!resp.ok) throw new Error(`Voice clone API error: ${resp.status}`)
  const data = await resp.json()
  const audioData = data.choices?.[0]?.message?.audio?.data
  if (!audioData) throw new Error('Invalid voice clone response: missing audio data')
  return { audio: audioData, format: outputFormat }
}

export async function voiceDesign(
  req: VoiceDesignRequest
): Promise<{ audio: string; format: string }> {
  const { apiKey, apiBase } = await getConfig()
  // MiMo API only supports wav/mp3 — always request wav, convert to pcm later if needed
  const apiFormat = (req.format === 'pcm' || req.format === 'pcm16') ? 'wav' : (req.format || 'wav')
  const payload = {
    model: 'mimo-v2.5-tts-voicedesign',
    messages: [
      { role: 'user', content: req.description },
      { role: 'assistant', content: req.text },
    ],
    modalities: ['text', 'audio'],
    audio: { format: apiFormat },
    stream: false,
  }

  const resp = await fetch(`${apiBase}/chat/completions`, {
    method: 'POST',
    headers: headers(apiKey),
    body: JSON.stringify(payload),
  })
  if (!resp.ok) throw new Error(`Voice design API error: ${resp.status}`)
  const data = await resp.json()
  const audioData = data.choices?.[0]?.message?.audio?.data
  if (!audioData) throw new Error('Invalid voice design response: missing audio data')
  return { audio: audioData, format: req.format || 'wav' }
}

export async function synthesizeAndSave(req: TTSRequest): Promise<TTSResponse> {
  try {
    let result: { audio: string; format: string }
    let modelUsed = req.model || 'mimo-v2.5-tts'

    if (req.voice_type === 'clone' && req.voice) {
      // Load the clone voice's audio from storage
      const { getVoices } = await import('../db/database')
      const voices = await getVoices()
      const voice = voices.find((v: any) => v.id === req.voice && v.type === 'clone')
      if (!voice?.audio_path) throw new Error('克隆音色未找到或缺少音频')
      const { getAudioDataUrl } = await import('../storage/audioStorage')
      const ext = voice.audio_path.split('.').pop() || 'wav'
      const dataUrl = await getAudioDataUrl(voice.audio_path, ext)
      const audioBase64 = dataUrl.split(',')[1] || dataUrl
      result = await voiceClone(req.text, audioBase64, ext, req.format || 'wav', req.emotion)
      modelUsed = 'mimo-v2.5-tts-voiceclone'
    } else if (req.voice_type === 'design' && req.voice) {
      // Load the design voice's description from storage
      const { getVoices } = await import('../db/database')
      const voices = await getVoices()
      const voice = voices.find((v: any) => v.id === req.voice && v.type === 'design')
      const description = voice?.description || req.voice_description || '标准音色'
      result = await voiceDesign({ description, text: req.text, format: req.format })
      modelUsed = 'mimo-v2.5-tts-voicedesign'
    } else {
      result = await tts(req)
    }

    let audioBase64 = result.audio
    let saveFormat = result.format
    if (req.format === 'pcm' || req.format === 'pcm16') {
      saveFormat = 'wav'
      if (result.format === 'pcm') {
        audioBase64 = pcmToWavBase64(result.audio)
      }
    }
    const genId = `gen_${crypto.randomUUID().slice(0, 12)}`
    const audioPath = await saveAudio(audioBase64, saveFormat, genId)
    const { insertGeneration } = await import('../db/database')
    await insertGeneration(genId, modelUsed, req.voice || 'mimo_default', req.text, audioPath, saveFormat, req.speed || 1.0, req.emotion || null)
    return { success: true, data: { audio: audioBase64, format: saveFormat, generation_id: genId } }
  } catch (e: any) {
    return { success: false, error: { code: 'TTS_ERROR', message: e.message } }
  }
}

export async function cloneAndSave(
  audioBase64: string,
  audioFormat: string,
  text: string,
  outputFormat?: string,
  emotion?: string
): Promise<TTSResponse> {
  try {
    const result = await voiceClone(text, audioBase64, audioFormat, outputFormat || 'wav', emotion)
    const genId = `gen_${crypto.randomUUID().slice(0, 12)}`
    const audioPath = await saveAudio(result.audio, result.format, genId)
    const { insertGeneration } = await import('../db/database')
    await insertGeneration(genId, 'mimo-v2.5-tts-voiceclone', 'clone', text, audioPath, result.format, 1.0, emotion || null)
    return { success: true, data: { audio: result.audio, format: result.format, generation_id: genId } }
  } catch (e: any) {
    return { success: false, error: { code: 'CLONE_ERROR', message: e.message } }
  }
}

export async function designAndSave(req: VoiceDesignRequest): Promise<TTSResponse> {
  try {
    const result = await voiceDesign(req)
    const genId = `gen_${crypto.randomUUID().slice(0, 12)}`
    const audioPath = await saveAudio(result.audio, result.format, genId)
    const { insertGeneration } = await import('../db/database')
    await insertGeneration(genId, 'mimo-v2.5-tts-voicedesign', 'design', req.text, audioPath, result.format, 1.0, null)
    return { success: true, data: { audio: result.audio, format: result.format, generation_id: genId } }
  } catch (e: any) {
    return { success: false, error: { code: 'DESIGN_ERROR', message: e.message } }
  }
}

const GITHUB_REPO = 'Jarvisshun/tts-voxa'

export async function checkUpdateNative(currentVersion: string): Promise<import('./types').UpdateInfo> {
  const result: import('./types').UpdateInfo = {
    current: currentVersion,
    latest: currentVersion,
    has_update: false,
    download_url: null,
    release_notes: null,
  }
  try {
    // Try latest release first
    let resp = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      headers: { 'Accept': 'application/vnd.github+json' },
    })

    // If no "latest" release, try the most recent release from all releases
    if (resp.status === 404) {
      resp = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=1`, {
        headers: { 'Accept': 'application/vnd.github+json' },
      })
      if (resp.status === 200) {
        const releases = await resp.json()
        if (releases.length > 0) {
          // Simulate latest release format
          const data = releases[0]
          const tag = data.tag_name || ''
          const latestVer = tag.replace(/^v/, '')
          let downloadUrl: string | null = null
          for (const asset of data.assets || []) {
            if (asset.name?.endsWith('.apk')) { downloadUrl = asset.browser_download_url; break }
          }
          if (!downloadUrl) downloadUrl = data.html_url || ''
          result.latest = latestVer
          result.has_update = compareVersions(latestVer, currentVersion) > 0
          result.download_url = downloadUrl
          result.release_notes = data.body || ''
          return result
        }
      }
      result.error = '暂无可用更新'
      return result
    }

    if (resp.status === 200) {
      const data = await resp.json()
      const tag = data.tag_name || ''
      const latestVer = tag.replace(/^v/, '')
      let downloadUrl: string | null = null
      for (const asset of data.assets || []) {
        if (asset.name?.endsWith('.apk')) { downloadUrl = asset.browser_download_url; break }
      }
      if (!downloadUrl) downloadUrl = data.html_url || ''
      result.latest = latestVer
      result.has_update = compareVersions(latestVer, currentVersion) > 0
      result.download_url = downloadUrl
      result.release_notes = data.body || ''
    } else {
      result.error = `检查失败 (${resp.status})`
    }
  } catch (e: any) {
    result.error = `检查失败: ${e.message || '网络错误'}`
  }
  return result
}

function parseVersion(v: string): number[] {
  // Handle formats: "2.1.1", "v2.1.1", "2.1.1-beta", etc.
  const cleaned = v.replace(/^v/, '').split('-')[0].trim()
  const parts = cleaned.split('.').map(p => parseInt(p) || 0)
  // Normalize to 3 parts for comparison
  while (parts.length < 3) parts.push(0)
  return parts
}

function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a)
  const pb = parseVersion(b)
  for (let i = 0; i < 3; i++) {
    if (pa[i] > pb[i]) return 1
    if (pa[i] < pb[i]) return -1
  }
  return 0
}
