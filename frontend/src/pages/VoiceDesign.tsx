import { useState } from 'react'
import { designVoice } from '../api/client'
import { useTasks } from '../contexts/TaskContext'
import WaveformPlayer from '../components/WaveformPlayer'
import ErrorMessage from '../components/ErrorMessage'
import FormatSelector from '../components/FormatSelector'

const DESCRIPTION_EXAMPLES = [
  '温柔的女声，语速适中，带点甜美的感觉',
  '低沉的男声，像新闻播音员一样专业',
  '活泼的少女声音，语调上扬，充满活力',
  '沉稳的中年男声，带点沙哑，有磁性',
  '清亮的童声，天真烂漫',
]

export default function VoiceDesign() {
  const [description, setDescription] = useState('温柔的女声，语速适中，带点甜美的感觉')
  const [text, setText] = useState('你好，这是我设计的声音，希望你喜欢！')
  const [format, setFormat] = useState('wav')
  const [loading, setLoading] = useState(false)
  const [audioSrc, setAudioSrc] = useState('')
  const [error, setError] = useState('')
  const [savedVoiceName, setSavedVoiceName] = useState('')

  const { addTask, updateTask } = useTasks()

  const handleGenerate = async () => {
    if (!description.trim() || !text.trim()) return
    setLoading(true)
    setError('')
    setAudioSrc('')

    const taskId = `design_${crypto.randomUUID().slice(0, 12)}`
    addTask({
      id: taskId,
      type: 'design',
      status: 'running',
      textPreview: description.trim().slice(0, 30) + (description.trim().length > 30 ? '...' : ''),
      createdAt: new Date().toISOString(),
    })

    try {
      const resp = await designVoice({ description: description.trim(), text: text.trim(), format })
      if (resp.success && resp.data) {
        const audioUrl = `data:audio/${resp.data.format};base64,${resp.data.audio}`
        setAudioSrc(audioUrl)
        updateTask(taskId, { status: 'completed' })

        // Auto-save the designed voice to the voices table
        try {
          const { saveVoice } = await import('../db/database')
          const { saveAudio } = await import('../storage/audioStorage')
          const voiceId = `voice_${crypto.randomUUID().slice(0, 12)}`
          const voiceName = description.trim().slice(0, 20)
          const audioPath = await saveAudio(resp.data.audio, resp.data.format, voiceId)
          await saveVoice(voiceId, voiceName, 'design', voiceId, description.trim(), audioPath)
          setSavedVoiceName(voiceName)
          const { scheduleBackgroundSync } = await import('../db/sync')
          scheduleBackgroundSync()
        } catch (saveErr) {
          console.error('Auto-save voice failed:', saveErr)
          // Don't show error to user — synthesis succeeded
        }
      } else {
        setError('生成失败')
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
      {/* Description */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-1">声音设计</h2>
        <p className="text-[11px] text-gray-400 mb-4">用自然语言描述你想要的声音特征，AI 会为你生成全新的虚拟声音</p>

        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={3}
          className="w-full bg-gray-50/80 border border-gray-200 rounded-xl p-4 text-sm text-gray-800 placeholder-gray-400 focus:border-violet-400 focus:ring-2 focus:ring-violet-100 focus:outline-none resize-none leading-relaxed"
          placeholder="描述你想要的声音特征..."
        />

        <div className="mt-3 flex flex-wrap gap-1.5">
          {DESCRIPTION_EXAMPLES.map((ex, i) => (
            <button
              key={i}
              onClick={() => setDescription(ex)}
              className="text-[11px] bg-violet-50 hover:bg-violet-100 text-violet-600 hover:text-violet-700 px-2.5 py-1.5 rounded-lg transition-all truncate max-w-[200px]"
              title={ex}
            >
              {ex}
            </button>
          ))}
        </div>
      </div>

      {/* Text + Format */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <label className="block text-sm font-semibold text-gray-700 mb-3">合成文本</label>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            rows={4}
            className="w-full bg-gray-50/80 border border-gray-200 rounded-xl p-3 text-sm text-gray-800 placeholder-gray-400 focus:border-violet-400 focus:outline-none resize-none leading-relaxed"
          />
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <FormatSelector value={format} onChange={setFormat} options={['wav', 'mp3']} color="violet" />
        </div>
      </div>

      {/* Generate Button */}
      <button
        onClick={handleGenerate}
        disabled={loading || !description.trim() || !text.trim()}
        className="w-full py-3.5 bg-gradient-to-r from-violet-500 to-purple-500 hover:from-violet-600 hover:to-purple-600 disabled:from-gray-200 disabled:to-gray-200 disabled:text-gray-400 rounded-2xl font-medium text-sm text-white transition-all shadow-lg shadow-violet-200/50 hover:shadow-violet-300/50 disabled:shadow-none active:scale-[0.99]"
      >
        {loading ? '正在生成...' : '生成声音'}
      </button>

      {error && <ErrorMessage message={error} />}

      {audioSrc && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-gray-700">生成结果</span>
            {savedVoiceName && (
              <span className="text-[11px] text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg">
                已保存到「我的音色」: {savedVoiceName}
              </span>
            )}
          </div>
          <WaveformPlayer audioSrc={audioSrc} showDownload downloadFilename={`design_output.${format}`} />
        </div>
      )}
    </div>
  )
}
