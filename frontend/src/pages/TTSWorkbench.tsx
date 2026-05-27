import { useState, useEffect } from 'react'
import { synthesizeTTS, getModels, getPresets, getUserVoices, getProviderVoices, type TTSRequest, type UserVoice, type ProviderVoice } from '../api/client'
import { pcmToWavBase64 } from '../utils/audio'
import { useTasks } from '../contexts/TaskContext'
import WaveformPlayer from '../components/WaveformPlayer'
import Spinner from '../components/Spinner'
import ErrorMessage from '../components/ErrorMessage'
import SpeedSelector from '../components/SpeedSelector'
import FormatSelector from '../components/FormatSelector'

interface ModelItem {
  id: string
  name: string
  type: string
  provider?: string
}

interface VoiceItem {
  id: string
  name: string
  style: string
  category?: string
}

type VoiceTab = 'preset' | 'user' | 'provider'

export default function TTSWorkbench() {
  const [text, setText] = useState('你好，欢迎使用 TTS Voxa！这是一段测试文本。')
  const [voice, setVoice] = useState('mimo_default')
  const [voiceType, setVoiceType] = useState<'preset' | 'clone' | 'design'>('preset')
  const [model, setModel] = useState('')
  const [speed, setSpeed] = useState(1.0)
  const [emotion, setEmotion] = useState('')
  const [format, setFormat] = useState('wav')
  const [loading, setLoading] = useState(false)
  const [audioSrc, setAudioSrc] = useState('')
  const [error, setError] = useState('')
  const [models, setModels] = useState<ModelItem[]>([])
  const [voices, setVoices] = useState<VoiceItem[]>([
    { id: 'mimo_default', name: '默认', style: '标准音色' },
  ])
  const [userVoices, setUserVoices] = useState<UserVoice[]>([])
  const [providerVoices, setProviderVoices] = useState<ProviderVoice[]>([])
  const [voiceTab, setVoiceTab] = useState<VoiceTab>('preset')

  useEffect(() => {
    getModels().then(res => {
      if (res.success && res.data.length > 0) {
        setModels(res.data)
        if (!model) setModel(res.data[0].id)
      }
    }).catch(() => {
      setError('无法加载模型列表，请在设置中配置服务商')
    })
    getPresets().then(res => {
      if (res.success) setVoices(res.data)
    }).catch(() => {})
    getUserVoices().then(setUserVoices).catch(() => {})
    getProviderVoices().then(setProviderVoices).catch(() => {})
  }, [])

  const { addTask, updateTask } = useTasks()

  const handleSynthesize = async () => {
    if (!text.trim()) return
    setLoading(true)
    setError('')
    setAudioSrc('')

    const taskId = `tts_${crypto.randomUUID().slice(0, 12)}`
    const preview = text.trim().slice(0, 30) + (text.trim().length > 30 ? '...' : '')
    addTask({
      id: taskId,
      type: 'tts',
      status: 'running',
      textPreview: preview,
      createdAt: new Date().toISOString(),
    })

    try {
      const req: TTSRequest = {
        text: text.trim(),
        model,
        voice,
        format,
        speed,
        emotion: emotion || undefined,
        voice_type: voiceType === 'preset' ? undefined : voiceType,
        voice_description: voiceType === 'design' ? userVoices.find(v => v.id === voice)?.description : undefined,
      }
      const resp = await synthesizeTTS(req)
      if (resp.success && resp.data) {
        let audioBase64 = resp.data.audio
        let audioFormat = resp.data.format
        if (audioFormat === 'pcm') {
          audioBase64 = pcmToWavBase64(audioBase64)
          audioFormat = 'wav'
        }
        const audioUrl = `data:audio/${audioFormat};base64,${audioBase64}`
        setAudioSrc(audioUrl)
        updateTask(taskId, { status: 'completed' })
      } else {
        setError(resp.error?.message || '合成失败')
        updateTask(taskId, { status: 'failed' })
      }
    } catch (e: any) {
      setError(e.message || '请求失败')
      updateTask(taskId, { status: 'failed' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Top: Text + Voice */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Text Input */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <label className="block text-sm font-semibold text-gray-700 mb-3">合成文本</label>
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              rows={7}
              maxLength={5000}
              className="w-full bg-gray-50/80 border border-gray-200 rounded-xl p-4 text-gray-800 placeholder-gray-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:outline-none resize-none text-sm leading-relaxed transition-all"
              placeholder="输入要合成的文本..."
            />
            <div className="flex justify-between items-center mt-2">
              <span className="text-[11px] text-gray-400">支持中英文混合</span>
              <span className="text-[11px] text-gray-400">{text.length}/5000</span>
            </div>
          </div>
        </div>

        {/* Voice Selector */}
        <div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 h-full flex flex-col">
            <div className="flex items-center gap-1 mb-3 bg-gray-100 rounded-xl p-1">
              <button
                onClick={() => setVoiceTab('preset')}
                className={`flex-1 text-xs font-medium py-1.5 rounded-lg transition-all ${
                  voiceTab === 'preset' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                预设
              </button>
              <button
                onClick={() => setVoiceTab('user')}
                className={`flex-1 text-xs font-medium py-1.5 rounded-lg transition-all ${
                  voiceTab === 'user' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                我的{userVoices.length > 0 && <span className="ml-0.5 text-[10px] opacity-60">({userVoices.length})</span>}
              </button>
              {providerVoices.length > 0 && (
                <button
                  onClick={() => setVoiceTab('provider')}
                  className={`flex-1 text-xs font-medium py-1.5 rounded-lg transition-all ${
                    voiceTab === 'provider' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  服务商
                </button>
              )}
            </div>
            <div className="flex-1 space-y-1.5 max-h-[300px] overflow-y-auto pr-1">
              {voiceTab === 'preset' ? (
                (() => {
                  const grouped: Record<string, VoiceItem[]> = {}
                  voices.forEach(v => {
                    const cat = v.category || 'other'
                    if (!grouped[cat]) grouped[cat] = []
                    grouped[cat].push(v)
                  })
                  const catLabels: Record<string, string> = {
                    'zh-female': '中文女声', 'zh-male': '中文男声',
                    'en-female': '英文女声', 'en-male': '英文男声', 'other': '其他',
                  }
                  return Object.entries(grouped).map(([cat, catVoices]) => (
                    <div key={cat}>
                      <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-2 pt-2 pb-1">
                        {catLabels[cat] || cat}
                      </div>
                      {catVoices.map(v => (
                        <button
                          key={v.id}
                          onClick={() => { setVoice(v.id); setVoiceType('preset') }}
                          className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition-all ${
                            voice === v.id && voiceType === 'preset'
                              ? 'bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-sm'
                              : 'text-gray-600 hover:bg-gray-50 hover:text-gray-800 border border-transparent'
                          }`}
                        >
                          <div className="font-medium truncate">{v.name}</div>
                          <div className={`text-[11px] mt-0.5 truncate ${voice === v.id && voiceType === 'preset' ? 'text-indigo-400' : 'text-gray-400'}`}>
                            {v.style}
                          </div>
                        </button>
                      ))}
                    </div>
                  ))
                })()
              ) : voiceTab === 'user' ? (
                userVoices.length === 0 ? (
                  <div className="text-center py-8">
                    <svg className="w-8 h-8 text-gray-200 mx-auto mb-2" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                    </svg>
                    <span className="text-xs text-gray-300">暂无自定义音色</span>
                    <p className="text-[10px] text-gray-300 mt-1">去「克隆」或「设计」页面创建</p>
                  </div>
                ) : (
                  userVoices.map(v => (
                    <button
                      key={v.id}
                      onClick={() => { setVoice(v.id); setVoiceType(v.type) }}
                      className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition-all ${
                        voice === v.id && voiceType !== 'preset'
                          ? 'bg-violet-50 text-violet-700 border border-violet-200 shadow-sm'
                          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-800 border border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-medium ${
                          v.type === 'clone' ? 'bg-blue-50 text-blue-500' : 'bg-violet-50 text-violet-500'
                        }`}>
                          {v.type === 'clone' ? '克隆' : '设计'}
                        </span>
                        <span className="font-medium truncate">{v.name}</span>
                      </div>
                      {v.description && (
                        <div className={`text-[11px] mt-0.5 truncate ${voice === v.id && voiceType !== 'preset' ? 'text-violet-400' : 'text-gray-400'}`}>
                          {v.description.slice(0, 40)}
                        </div>
                      )}
                    </button>
                  ))
                )
              ) : (
                providerVoices.map(v => (
                  <button
                    key={`${v.provider}_${v.id}`}
                    onClick={() => { setVoice(v.id); setVoiceType('preset') }}
                    className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition-all ${
                      voice === v.id
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-sm'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-800 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] px-1.5 py-0.5 rounded-md font-medium bg-emerald-50 text-emerald-500">
                        {v.provider}
                      </span>
                      <span className="font-medium truncate">{v.name}</span>
                    </div>
                    {v.style && (
                      <div className="text-[11px] mt-0.5 truncate text-gray-400">
                        {v.style.slice(0, 40)}
                      </div>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Controls Bar */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {/* Model */}
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">模型</label>
            <select
              value={model}
              onChange={e => setModel(e.target.value)}
              className="w-full bg-gray-50/80 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 focus:border-indigo-400 focus:outline-none truncate"
            >
              {models.length > 0 ? (
                models.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.name}{m.provider ? ` (${m.provider})` : ''}
                  </option>
                ))
              ) : (
                <option value="">请先在设置中配置服务商</option>
              )}
            </select>
          </div>

          <FormatSelector value={format} onChange={setFormat} />
          <SpeedSelector value={speed} onChange={setSpeed} />

          {/* Emotion */}
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">情感</label>
            <input
              type="text"
              value={emotion}
              onChange={e => setEmotion(e.target.value)}
              placeholder="如: 开心、温柔"
              className="w-full bg-gray-50/80 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 placeholder-gray-400 focus:border-indigo-400 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Generate Button */}
      <button
        onClick={handleSynthesize}
        disabled={loading || !text.trim() || !model}
        className="w-full py-3.5 bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-600 hover:to-violet-600 disabled:from-gray-200 disabled:to-gray-200 disabled:text-gray-400 rounded-2xl font-medium text-sm text-white transition-all shadow-lg shadow-indigo-200/50 hover:shadow-indigo-300/50 disabled:shadow-none active:scale-[0.99]"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <Spinner />
            正在合成...
          </span>
        ) : '开始合成'}
      </button>

      {/* Error */}
      {error && <ErrorMessage message={error} />}

      {/* Audio Player */}
      {audioSrc && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-gray-700">合成结果</span>
          </div>
          <WaveformPlayer audioSrc={audioSrc} showDownload downloadFilename={`tts_output.${format}`} />
        </div>
      )}
    </div>
  )
}
