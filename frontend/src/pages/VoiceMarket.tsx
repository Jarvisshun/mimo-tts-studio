import { useState, useEffect, useCallback } from 'react'
import { fetchMarketplaceVoices, likeVoice, publishVoice, type SharedVoice } from '../api/supabase'
import { getVoices, saveVoice } from '../db/database'
import { saveAudio, getAudioDataUrl } from '../storage/audioStorage'
import { scheduleBackgroundSync } from '../db/sync'
import WaveformPlayer from '../components/WaveformPlayer'
import Spinner from '../components/Spinner'

type CategoryFilter = 'all' | 'female' | 'male' | 'child' | 'special'
type SortMode = 'hot' | 'new' | 'featured'

const CATEGORIES: { key: CategoryFilter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'female', label: '女声' },
  { key: 'male', label: '男声' },
  { key: 'child', label: '童声' },
  { key: 'special', label: '特色' },
]

const SORTS: { key: SortMode; label: string }[] = [
  { key: 'hot', label: '热门' },
  { key: 'new', label: '最新' },
  { key: 'featured', label: '精选' },
]

const CATEGORY_COLORS: Record<string, string> = {
  female: 'bg-pink-50 text-pink-600',
  male: 'bg-blue-50 text-blue-600',
  child: 'bg-amber-50 text-amber-600',
  special: 'bg-violet-50 text-violet-600',
  other: 'bg-gray-50 text-gray-600',
}

export default function VoiceMarket() {
  const [voices, setVoices] = useState<SharedVoice[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [category, setCategory] = useState<CategoryFilter>('all')
  const [sort, setSort] = useState<SortMode>('hot')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [selectedVoice, setSelectedVoice] = useState<SharedVoice | null>(null)
  const [adding, setAdding] = useState(false)
  const [added, setAdded] = useState<string | null>(null)

  // Publish modal state
  const [showPublish, setShowPublish] = useState(false)
  const [myVoices, setMyVoices] = useState<any[]>([])
  const [publishVoiceId, setPublishVoiceId] = useState('')
  const [publishName, setPublishName] = useState('')
  const [publishDesc, setPublishDesc] = useState('')
  const [publishCategory, setPublishCategory] = useState<string>('other')
  const [publishing, setPublishing] = useState(false)
  const [publishError, setPublishError] = useState('')

  const loadVoices = useCallback(async () => {
    setLoading(true)
    try {
      const result = await fetchMarketplaceVoices({ category, search, sort, page, limit: 20 })
      setVoices(result.voices)
      setTotal(result.total)
    } catch {
      setVoices([])
    } finally {
      setLoading(false)
    }
  }, [category, search, sort, page])

  useEffect(() => {
    loadVoices()
  }, [loadVoices])

  const handleLike = async (voiceId: string) => {
    await likeVoice(voiceId)
    setVoices(prev => prev.map(v => v.id === voiceId ? { ...v, likes: v.likes + 1 } : v))
  }

  const handleAddToMyVoices = async (voice: SharedVoice) => {
    setAdding(true)
    try {
      const voiceId = `voice_${crypto.randomUUID().slice(0, 12)}`
      let audioPath = ''

      // If there's a preview audio, download and save it
      if (voice.preview_audio_url) {
        try {
          const resp = await fetch(voice.preview_audio_url)
          const blob = await resp.blob()
          const base64 = await new Promise<string>((resolve) => {
            const reader = new FileReader()
            reader.onload = () => resolve((reader.result as string).split(',')[1])
            reader.readAsDataURL(blob)
          })
          audioPath = await saveAudio(base64, 'wav', voiceId)
        } catch {
          // Preview download failed — still save the voice config
        }
      }

      const configStr = voice.type === 'design'
        ? (voice.voice_config?.description as string) || voice.description
        : ''
      await saveVoice(voiceId, voice.name, voice.type, voiceId, configStr, audioPath)
      scheduleBackgroundSync()
      setAdded(voice.id)
      setTimeout(() => setAdded(null), 2000)
    } catch (e) {
      console.error('Add voice failed:', e)
    } finally {
      setAdding(false)
    }
  }

  const totalPages = Math.ceil(total / 20)

  const openPublish = async () => {
    try {
      const voices = await getVoices()
      setMyVoices(voices)
      if (voices.length > 0) {
        setPublishVoiceId(voices[0].id)
        setPublishName(voices[0].name)
        setPublishDesc(voices[0].description || '')
      }
    } catch {
      setMyVoices([])
    }
    setShowPublish(true)
    setPublishError('')
  }

  const handlePublish = async () => {
    if (!publishVoiceId || !publishName.trim()) return
    setPublishing(true)
    setPublishError('')
    try {
      const selectedVoice = myVoices.find(v => v.id === publishVoiceId)
      let previewBase64 = ''
      if (selectedVoice?.audio_path) {
        try {
          const ext = selectedVoice.audio_path.split('.').pop() || 'wav'
          const dataUrl = await getAudioDataUrl(selectedVoice.audio_path, ext)
          previewBase64 = dataUrl.split(',')[1] || dataUrl
        } catch {}
      }

      const voiceConfig = selectedVoice?.type === 'design'
        ? { description: selectedVoice.description }
        : {}

      const result = await publishVoice({
        name: publishName.trim(),
        description: publishDesc.trim(),
        type: selectedVoice?.type || 'design',
        category: publishCategory,
        voice_config: voiceConfig,
        preview_audio_base64: previewBase64 || undefined,
      })

      if (result.success) {
        setShowPublish(false)
        loadVoices()
      } else {
        setPublishError(result.error || '发布失败')
      }
    } catch (e: any) {
      setPublishError(e.message || '发布失败')
    } finally {
      setPublishing(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">音色市场</h2>
            <p className="text-[11px] text-gray-400 mt-0.5">发现和使用社区分享的音色</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400">{total} 个音色</span>
            <button
              onClick={openPublish}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 text-xs font-medium rounded-lg transition-all"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              发布
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            placeholder="搜索音色名称或描述..."
            className="w-full bg-gray-50/80 border border-gray-200 rounded-xl pl-10 pr-4 py-2.5 text-sm text-gray-700 placeholder-gray-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:outline-none"
          />
        </div>

        {/* Category + Sort */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1">
            {CATEGORIES.map(cat => (
              <button
                key={cat.key}
                onClick={() => { setCategory(cat.key); setPage(1) }}
                className={`text-xs px-3 py-1.5 rounded-lg transition-all ${
                  category === cat.key
                    ? 'bg-indigo-50 text-indigo-600 font-medium'
                    : 'text-gray-500 hover:bg-gray-50'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
          <div className="ml-auto flex gap-1">
            {SORTS.map(s => (
              <button
                key={s.key}
                onClick={() => { setSort(s.key); setPage(1) }}
                className={`text-xs px-2.5 py-1.5 rounded-lg transition-all ${
                  sort === s.key
                    ? 'bg-gray-100 text-gray-700 font-medium'
                    : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Voice Grid */}
      {loading ? (
        <div className="text-center py-16">
          <Spinner />
          <p className="text-sm text-gray-400 mt-3">加载中...</p>
        </div>
      ) : voices.length === 0 ? (
        <div className="text-center py-16">
          <svg className="w-12 h-12 text-gray-200 mx-auto mb-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
          </svg>
          <p className="text-sm text-gray-400">暂无音色</p>
          <p className="text-[11px] text-gray-300 mt-1">成为第一个分享者吧！</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {voices.map(voice => (
            <div
              key={voice.id}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 hover:shadow-md hover:border-gray-200 transition-all cursor-pointer"
              onClick={() => setSelectedVoice(voice)}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-medium ${CATEGORY_COLORS[voice.category] || CATEGORY_COLORS.other}`}>
                      {CATEGORIES.find(c => c.key === voice.category)?.label || voice.category}
                    </span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-medium ${
                      voice.type === 'clone' ? 'bg-blue-50 text-blue-500' : 'bg-violet-50 text-violet-500'
                    }`}>
                      {voice.type === 'clone' ? '克隆' : '设计'}
                    </span>
                  </div>
                  <h3 className="text-sm font-medium text-gray-800 truncate">{voice.name}</h3>
                </div>
                {voice.is_featured && (
                  <span className="text-amber-500 text-xs shrink-0">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                    </svg>
                  </span>
                )}
              </div>

              {voice.description && (
                <p className="text-[11px] text-gray-400 line-clamp-2 mb-3">{voice.description}</p>
              )}

              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-300">{voice.author_name}</span>
                <div className="flex items-center gap-3">
                  <button
                    onClick={e => { e.stopPropagation(); handleLike(voice.id) }}
                    className="flex items-center gap-1 text-gray-400 hover:text-red-400 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" />
                    </svg>
                    <span className="text-[10px]">{voice.likes}</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30"
          >
            上一页
          </button>
          <span className="text-xs text-gray-400">{page} / {totalPages}</span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30"
          >
            下一页
          </button>
        </div>
      )}

      {/* Detail Modal */}
      {selectedVoice && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setSelectedVoice(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-medium ${CATEGORY_COLORS[selectedVoice.category] || CATEGORY_COLORS.other}`}>
                      {CATEGORIES.find(c => c.key === selectedVoice.category)?.label || selectedVoice.category}
                    </span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-medium ${
                      selectedVoice.type === 'clone' ? 'bg-blue-50 text-blue-500' : 'bg-violet-50 text-violet-500'
                    }`}>
                      {selectedVoice.type === 'clone' ? '克隆' : '设计'}
                    </span>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900">{selectedVoice.name}</h3>
                  <p className="text-[11px] text-gray-400 mt-0.5">by {selectedVoice.author_name}</p>
                </div>
                <button onClick={() => setSelectedVoice(null)} className="p-1 hover:bg-gray-100 rounded-lg">
                  <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {selectedVoice.description && (
                <p className="text-sm text-gray-600 mb-4">{selectedVoice.description}</p>
              )}

              {selectedVoice.preview_audio_url && (
                <div className="mb-4">
                  <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">试听</label>
                  <WaveformPlayer audioSrc={selectedVoice.preview_audio_url} />
                </div>
              )}

              <div className="flex items-center gap-3 text-xs text-gray-400 mb-4">
                <span className="flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" />
                  </svg>
                  {selectedVoice.likes} 喜欢
                </span>
                <span>{selectedVoice.downloads} 下载</span>
                <span className="ml-auto">{new Date(selectedVoice.created_at).toLocaleDateString()}</span>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => handleLike(selectedVoice.id)}
                  className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition-all"
                >
                  喜欢
                </button>
                <button
                  onClick={() => handleAddToMyVoices(selectedVoice)}
                  disabled={adding || added === selectedVoice.id}
                  className="flex-1 py-2.5 bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-600 hover:to-violet-600 disabled:from-emerald-500 disabled:to-emerald-500 text-white rounded-xl text-sm font-medium transition-all"
                >
                  {adding ? '添加中...' : added === selectedVoice.id ? '已添加' : '添加到我的音色'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Publish Modal */}
      {showPublish && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowPublish(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full" onClick={e => e.stopPropagation()}>
            <div className="p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-semibold text-gray-900">发布音色到市场</h3>
                <button onClick={() => setShowPublish(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                  <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {myVoices.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm text-gray-400">暂无自定义音色</p>
                  <p className="text-[11px] text-gray-300 mt-1">请先在「克隆」或「设计」页面创建音色</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Select voice */}
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">选择音色</label>
                    <select
                      value={publishVoiceId}
                      onChange={e => {
                        setPublishVoiceId(e.target.value)
                        const v = myVoices.find(v => v.id === e.target.value)
                        if (v) { setPublishName(v.name); setPublishDesc(v.description || '') }
                      }}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 focus:border-indigo-400 focus:outline-none"
                    >
                      {myVoices.map(v => (
                        <option key={v.id} value={v.id}>
                          {v.name} ({v.type === 'clone' ? '克隆' : '设计'})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Name */}
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">公开名称</label>
                    <input
                      type="text"
                      value={publishName}
                      onChange={e => setPublishName(e.target.value)}
                      maxLength={50}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 focus:border-indigo-400 focus:outline-none"
                    />
                  </div>

                  {/* Description */}
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">描述</label>
                    <textarea
                      value={publishDesc}
                      onChange={e => setPublishDesc(e.target.value)}
                      rows={3}
                      maxLength={200}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 focus:border-indigo-400 focus:outline-none resize-none"
                      placeholder="描述这个音色的特点..."
                    />
                  </div>

                  {/* Category */}
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">分类</label>
                    <div className="flex gap-1.5">
                      {[
                        { key: 'female', label: '女声' },
                        { key: 'male', label: '男声' },
                        { key: 'child', label: '童声' },
                        { key: 'special', label: '特色' },
                        { key: 'other', label: '其他' },
                      ].map(cat => (
                        <button
                          key={cat.key}
                          onClick={() => setPublishCategory(cat.key)}
                          className={`text-xs px-2.5 py-1.5 rounded-lg transition-all ${
                            publishCategory === cat.key
                              ? 'bg-indigo-50 text-indigo-600 font-medium'
                              : 'text-gray-500 hover:bg-gray-50'
                          }`}
                        >
                          {cat.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {publishError && (
                    <p className="text-xs text-red-500">{publishError}</p>
                  )}

                  <button
                    onClick={handlePublish}
                    disabled={publishing || !publishName.trim()}
                    className="w-full py-3 bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-600 hover:to-violet-600 disabled:from-gray-200 disabled:to-gray-200 disabled:text-gray-400 text-white rounded-xl text-sm font-medium transition-all"
                  >
                    {publishing ? '发布中...' : '发布到市场'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
