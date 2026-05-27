import { createClient, SupabaseClient } from '@supabase/supabase-js'
import type { User } from '@supabase/supabase-js'

let supabase: SupabaseClient | null = null

export function initSupabase(url: string, anonKey: string): SupabaseClient {
  if (supabase) return supabase
  supabase = createClient(url, anonKey)
  return supabase
}

export function getSupabase(): SupabaseClient | null {
  return supabase
}

export function isSupabaseReady(): boolean {
  return supabase !== null
}

// === Auth ===

export async function signUp(email: string, password: string): Promise<{ user: User | null; error: string | null }> {
  if (!supabase) return { user: null, error: 'Supabase not initialized' }
  const { data, error } = await supabase.auth.signUp({ email, password })
  if (error) return { user: null, error: error.message }
  return { user: data.user, error: null }
}

export async function signIn(email: string, password: string): Promise<{ user: User | null; error: string | null }> {
  if (!supabase) return { user: null, error: 'Supabase not initialized' }
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    const msg = error.message
    if (msg.includes('confirm') || msg.includes('not confirmed') || msg.includes('Email not confirmed')) {
      return { user: null, error: '邮箱未验证。请在 Supabase 后台关闭邮箱确认：Authentication → Providers → Email → 关掉 "Confirm email"' }
    }
    return { user: null, error: msg }
  }
  if (!data.session) {
    return { user: null, error: '登录成功但未获得会话。请在 Supabase 后台关闭邮箱确认：Authentication → Providers → Email → 关掉 "Confirm email"' }
  }
  return { user: data.user, error: null }
}

export async function signInWithMagicLink(email: string): Promise<{ error: string | null }> {
  if (!supabase) return { error: 'Supabase not initialized' }
  const { error } = await supabase.auth.signInWithOtp({ email })
  if (error) return { error: error.message }
  return { error: null }
}

export async function signOut(): Promise<void> {
  await supabase?.auth.signOut()
}

export async function getCurrentUser(): Promise<User | null> {
  if (!supabase) return null
  // Try local session first (fast, no network), then fall back to server verify
  const { data: sessionData } = await supabase.auth.getSession()
  if (sessionData.session?.user) return sessionData.session.user
  const { data } = await supabase.auth.getUser()
  return data.user
}

export function onAuthStateChange(callback: (user: User | null) => void): () => void {
  if (!supabase) return () => {}
  const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session?.user ?? null)
  })
  return () => subscription.unsubscribe()
}

// === Encryption (AES-GCM with PBKDF2 key derivation) ===

const PBKDF2_ITERATIONS = 100000

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as unknown as ArrayBuffer, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

export async function encryptData(data: string, password: string): Promise<string> {
  const enc = new TextEncoder()
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(password, salt)
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(data))
  // Format: base64(salt + iv + ciphertext)
  const combined = new Uint8Array(salt.length + iv.length + new Uint8Array(encrypted).length)
  combined.set(salt, 0)
  combined.set(iv, salt.length)
  combined.set(new Uint8Array(encrypted), salt.length + iv.length)
  // Safe base64 encoding (avoids stack overflow on large data)
  let binary = ''
  for (let i = 0; i < combined.length; i++) binary += String.fromCharCode(combined[i])
  return btoa(binary)
}

export async function decryptData(encryptedBase64: string, password: string): Promise<string> {
  try {
    const combined = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0))
    const salt = combined.slice(0, 16)
    const iv = combined.slice(16, 28)
    const ciphertext = combined.slice(28)
    const key = await deriveKey(password, salt)
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext)
    return new TextDecoder().decode(decrypted)
  } catch (e) {
    throw new Error('解密失败：数据可能已损坏或密码不正确')
  }
}

// === Audio Storage ===

export async function uploadAudio(userId: string, filename: string, data: string): Promise<string | null> {
  if (!supabase) return null
  const path = `${userId}/${filename}`
  const { error } = await supabase.storage.from('audio').upload(path, decodeBase64(data), {
    contentType: 'audio/wav',
    upsert: true,
  })
  if (error) {
    console.error('Upload audio failed:', error.message)
    return null
  }
  return path
}

export async function downloadAudio(userId: string, filename: string): Promise<string | null> {
  if (!supabase) return null
  const path = `${userId}/${filename}`
  const { data, error } = await supabase.storage.from('audio').download(path)
  if (error || !data) {
    console.error('Download audio failed:', error?.message)
    return null
  }
  return blobToBase64(data)
}

export async function deleteAudio(userId: string, filename: string): Promise<boolean> {
  if (!supabase) return false
  const path = `${userId}/${filename}`
  const { error } = await supabase.storage.from('audio').remove([path])
  return !error
}

// === CRUD: Push local data to Supabase ===

export async function pushVoices(userId: string, voices: Record<string, unknown>[]): Promise<void> {
  if (!supabase || !voices.length) return
  const rows = voices.map(v => ({
    id: v.id, user_id: userId, name: v.name, type: v.type,
    voice_id: v.voice_id, description: v.description, audio_path: v.audio_path,
    created_at: v.created_at, updated_at: new Date().toISOString(),
  }))
  const { error } = await supabase.from('voices').upsert(rows, { onConflict: 'id' })
  if (error) console.error('pushVoices error:', error.message)
}

export async function pushGenerations(userId: string, generations: Record<string, unknown>[]): Promise<void> {
  if (!supabase || !generations.length) return
  const rows = generations.map(g => ({
    id: g.id, user_id: userId, model: g.model, voice: g.voice,
    text_content: g.text_content, audio_path: g.audio_path,
    format: g.format, speed: g.speed, emotion: g.emotion, duration: g.duration,
    created_at: g.created_at, updated_at: new Date().toISOString(),
  }))
  const { error } = await supabase.from('generations').upsert(rows, { onConflict: 'id' })
  if (error) console.error('pushGenerations error:', error.message)
}

export async function pushBatchJobs(userId: string, jobs: Record<string, unknown>[]): Promise<void> {
  if (!supabase || !jobs.length) return
  const rows = jobs.map(j => ({
    id: j.id, user_id: userId, name: j.name, status: j.status,
    total_items: j.total_items, completed_items: j.completed_items,
    voice: j.voice, model: j.model, format: j.format, speed: j.speed,
    created_at: j.created_at, completed_at: j.completed_at, updated_at: new Date().toISOString(),
  }))
  const { error } = await supabase.from('batch_jobs').upsert(rows, { onConflict: 'id' })
  if (error) console.error('pushBatchJobs error:', error.message)
}

export async function pushBatchItems(userId: string, items: Record<string, unknown>[]): Promise<void> {
  if (!supabase || !items.length) return
  const rows = items.map(i => ({
    id: i.id, user_id: userId, job_id: i.job_id, item_index: i.item_index,
    text_content: i.text_content, status: i.status, audio_path: i.audio_path,
    error_message: i.error_message, created_at: i.created_at, updated_at: new Date().toISOString(),
  }))
  const { error } = await supabase.from('batch_items').upsert(rows, { onConflict: 'id' })
  if (error) console.error('pushBatchItems error:', error.message)
}

export async function pushProviders(userId: string, providers: Record<string, unknown>[]): Promise<void> {
  if (!supabase || !providers.length) return
  const rows = providers.map(p => ({
    id: p.id,
    user_id: userId,
    name: p.name,
    api_key: p.api_key,
    api_base: p.api_base,
    models: typeof p.models === 'string' ? p.models : JSON.stringify(p.models || []),
    is_default: p.is_default === true || p.is_default === 1 ? 1 : 0,
    created_at: p.created_at,
    updated_at: new Date().toISOString(),
  }))
  const { error } = await supabase.from('providers').upsert(rows, { onConflict: 'id' })
  if (error) console.error('pushProviders error:', error.message)
}

// === CRUD: Pull remote data from Supabase ===

export async function pullVoices(userId: string): Promise<Record<string, unknown>[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from('voices').select('*').eq('user_id', userId)
  if (error) { console.error('pullVoices error:', error.message); return [] }
  return data || []
}

export async function pullGenerations(userId: string): Promise<Record<string, unknown>[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from('generations').select('*').eq('user_id', userId).order('created_at', { ascending: false })
  if (error) { console.error('pullGenerations error:', error.message); return [] }
  return data || []
}

export async function pullBatchJobs(userId: string): Promise<Record<string, unknown>[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from('batch_jobs').select('*').eq('user_id', userId).order('created_at', { ascending: false })
  if (error) { console.error('pullBatchJobs error:', error.message); return [] }
  return data || []
}

export async function pullBatchItems(userId: string): Promise<Record<string, unknown>[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from('batch_items').select('*').eq('user_id', userId)
  if (error) { console.error('pullBatchItems error:', error.message); return [] }
  return data || []
}

export async function pullProviders(userId: string): Promise<Record<string, unknown>[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from('providers').select('*').eq('user_id', userId)
  if (error) { console.error('pullProviders error:', error.message); return [] }
  return data || []
}

// === Marketplace: shared_voices ===

export interface SharedVoice {
  id: string
  author_id: string
  author_name: string
  name: string
  description: string
  type: 'clone' | 'design'
  voice_config: Record<string, unknown>
  preview_audio_url: string
  category: 'female' | 'male' | 'child' | 'special' | 'other'
  tags: string[]
  downloads: number
  likes: number
  created_at: string
  is_featured: boolean
}

export async function fetchMarketplaceVoices(options?: {
  category?: string
  search?: string
  sort?: 'hot' | 'new' | 'featured'
  page?: number
  limit?: number
}): Promise<{ voices: SharedVoice[]; total: number }> {
  if (!supabase) return { voices: [], total: 0 }
  const { category, search, sort = 'hot', page = 1, limit = 20 } = options || {}
  const offset = (page - 1) * limit

  let query = supabase.from('shared_voices').select('*', { count: 'exact' })

  if (category && category !== 'all') {
    query = query.eq('category', category)
  }
  if (search) {
    query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`)
  }

  switch (sort) {
    case 'new':
      query = query.order('created_at', { ascending: false })
      break
    case 'featured':
      query = query.eq('is_featured', true).order('created_at', { ascending: false })
      break
    case 'hot':
    default:
      query = query.order('likes', { ascending: false })
      break
  }

  query = query.range(offset, offset + limit - 1)

  const { data, error, count } = await query
  if (error) {
    console.error('fetchMarketplaceVoices error:', error.message)
    return { voices: [], total: 0 }
  }
  return { voices: data || [], total: count || 0 }
}

export async function publishVoice(voice: {
  name: string
  description: string
  type: 'clone' | 'design'
  category: string
  voice_config: Record<string, unknown>
  preview_audio_base64?: string
}): Promise<{ success: boolean; id?: string; error?: string }> {
  if (!supabase) return { success: false, error: 'Supabase not initialized' }

  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return { success: false, error: '请先登录' }

  const voiceId = `sv_${crypto.randomUUID().slice(0, 12)}`
  const authorName = userData.user.email?.split('@')[0] || 'anonymous'

  let previewUrl = ''
  if (voice.preview_audio_base64) {
    const path = `${userData.user.id}/${voiceId}_preview.wav`
    const { error: uploadError } = await supabase.storage.from('audio').upload(
      path, decodeBase64(voice.preview_audio_base64), { contentType: 'audio/wav', upsert: true }
    )
    if (!uploadError) {
      const { data: urlData } = supabase.storage.from('audio').getPublicUrl(path)
      previewUrl = urlData?.publicUrl || ''
    }
  }

  const { error } = await supabase.from('shared_voices').insert({
    id: voiceId,
    author_id: userData.user.id,
    author_name: authorName,
    name: voice.name,
    description: voice.description,
    type: voice.type,
    category: voice.category,
    voice_config: voice.voice_config,
    preview_audio_url: previewUrl,
  })

  if (error) return { success: false, error: error.message }
  return { success: true, id: voiceId }
}

export async function likeVoice(voiceId: string): Promise<boolean> {
  if (!supabase) return false
  // Use RPC for atomic increment (create this function in Supabase)
  const { error } = await supabase.rpc('increment_likes', { voice_id: voiceId })
  if (error) {
    // Fallback: direct update
    const { data } = await supabase.from('shared_voices').select('likes').eq('id', voiceId).single()
    if (data) {
      await supabase.from('shared_voices').update({ likes: (data.likes || 0) + 1 }).eq('id', voiceId)
    }
  }
  return true
}

export async function deleteSharedVoice(voiceId: string): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase.from('shared_voices').delete().eq('id', voiceId)
  return !error
}

// === Helpers ===

function decodeBase64(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve(result.split(',')[1])
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}
