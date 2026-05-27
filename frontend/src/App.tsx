import { useState, useEffect, lazy, Suspense, Component, type ReactNode } from 'react'
import { TaskProvider } from './contexts/TaskContext'
import Sidebar from './components/Sidebar'
import { checkUpdate } from './api/client'
import type { UpdateInfo } from './api/client'

const TTSWorkbench = lazy(() => import('./pages/TTSWorkbench'))
const VoiceClone = lazy(() => import('./pages/VoiceClone'))
const VoiceDesign = lazy(() => import('./pages/VoiceDesign'))
const VoiceMarket = lazy(() => import('./pages/VoiceMarket'))
const BatchProcess = lazy(() => import('./pages/BatchProcess'))
const History = lazy(() => import('./pages/History'))
const Settings = lazy(() => import('./pages/Settings'))

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: string }> {
  state = { hasError: false, error: '' }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mb-4">
            <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
            </svg>
          </div>
          <p className="text-sm text-gray-600 mb-2">页面加载出错</p>
          <p className="text-xs text-gray-400 mb-4">{this.state.error}</p>
          <button onClick={() => { this.setState({ hasError: false }); window.location.reload() }} className="px-4 py-2 bg-indigo-500 text-white text-sm rounded-xl">
            重新加载
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

const tabs = [
  { id: 'tts', label: 'TTS', icon: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
    </svg>
  )},
  { id: 'clone', label: '克隆', icon: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
    </svg>
  )},
  { id: 'design', label: '设计', icon: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.53 16.122a3 3 0 0 0-5.78 1.128 2.25 2.25 0 0 1-2.4 2.245 4.5 4.5 0 0 0 8.4-2.245c0-.399-.078-.78-.22-1.128Zm0 0a15.998 15.998 0 0 0 3.388-1.62m-5.043-.025a15.994 15.994 0 0 1 1.622-3.395m3.42 3.42a15.995 15.995 0 0 0 4.764-4.648l3.876-5.814a1.151 1.151 0 0 0-1.597-1.597L14.146 6.32a15.996 15.996 0 0 0-4.649 4.763m3.42 3.42a6.776 6.776 0 0 0-3.42-3.42" />
    </svg>
  )},
  { id: 'batch', label: '批量', icon: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 6.878V6a2.25 2.25 0 0 1 2.25-2.25h7.5A2.25 2.25 0 0 1 18 6v.878m-12 0c.235-.083.487-.128.75-.128h10.5c.263 0 .515.045.75.128m-12 0A2.25 2.25 0 0 0 4.5 9v.878m13.5-3A2.25 2.25 0 0 1 19.5 9v.878m0 0a2.246 2.246 0 0 0-.75-.128H5.25c-.263 0-.515.045-.75.128m15 0A2.25 2.25 0 0 1 21 12v6a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 18v-6c0-1.014.682-1.878 1.616-2.152" />
    </svg>
  )},
  { id: 'market', label: '市场', icon: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 .75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349M3.75 21V9.349m0 0a3.001 3.001 0 0 0 3.75-.615A2.993 2.993 0 0 0 9.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 0 0 2.25 1.016c.896 0 1.7-.393 2.25-1.015a3.001 3.001 0 0 0 3.75.614m-16.5 0a3.004 3.004 0 0 1-.621-4.72l1.189-1.19A1.5 1.5 0 0 1 5.378 3h13.243a1.5 1.5 0 0 1 1.06.44l1.19 1.189a3 3 0 0 1-.621 4.72M6.75 18h3.75a.75.75 0 0 0 .75-.75V13.5a.75.75 0 0 0-.75-.75H6.75a.75.75 0 0 0-.75.75v3.75c0 .414.336.75.75.75Z" />
    </svg>
  )},
  { id: 'history', label: '历史', icon: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
  )},
  { id: 'settings', label: '设置', icon: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    </svg>
  )},
]

function App() {
  const [activeTab, setActiveTab] = useState('tts')
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [updateDismissed, setUpdateDismissed] = useState(false)

  useEffect(() => {
    checkUpdate().then(info => {
      if (info.has_update && !info.error) setUpdateInfo(info)
    }).catch(() => {})
  }, [])

  const renderPage = () => {
    switch (activeTab) {
      case 'tts': return <TTSWorkbench />
      case 'clone': return <VoiceClone />
      case 'design': return <VoiceDesign />
      case 'market': return <VoiceMarket />
      case 'batch': return <BatchProcess />
      case 'history': return <History />
      case 'settings': return <Settings />
      default: return <TTSWorkbench />
    }
  }

  return (
    <TaskProvider>
      <div className="h-screen flex flex-col bg-[#f8f9fc] overflow-hidden">
        {/* Header - hidden on mobile */}
        <header className="hidden md:block bg-white/80 backdrop-blur-xl border-b border-gray-200/60 px-6 py-3 shrink-0 z-20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center shadow-sm shadow-indigo-200">
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
                </svg>
              </div>
              <div>
                <h1 className="text-base font-semibold text-gray-900 tracking-tight">TTS Voxa</h1>
                <p className="text-[11px] text-gray-400 -mt-0.5">AI Voice Studio</p>
              </div>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 rounded-full">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs text-emerald-700 font-medium">Ready</span>
            </div>
          </div>
        </header>

        {/* Update banner */}
        {updateInfo && !updateDismissed && (
          <div className="bg-gradient-to-r from-blue-500 to-indigo-500 text-white px-4 py-2 flex items-center justify-between shrink-0 z-20">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              <span className="text-sm font-medium">有新版本 v{updateInfo.latest} 可用</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setActiveTab('settings'); setUpdateDismissed(true) }}
                className="px-3 py-1 bg-white/20 hover:bg-white/30 rounded-lg text-xs font-medium transition-all"
              >
                查看更新
              </button>
              <button
                onClick={() => setUpdateDismissed(true)}
                className="p-1 hover:bg-white/20 rounded-lg transition-all"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Sidebar + Main (desktop) */}
        <div className="hidden md:flex flex-1 min-h-0">
          <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
          <main className="flex-1 overflow-y-auto p-6">
            <div className="max-w-5xl mx-auto">
              <ErrorBoundary>
                <Suspense fallback={<div className="text-center py-16 text-gray-400 text-sm">加载中...</div>}>
                  {renderPage()}
                </Suspense>
              </ErrorBoundary>
            </div>
          </main>
        </div>

        {/* Mobile: Main content + bottom nav */}
        <div className="flex md:hidden flex-1 flex-col min-h-0">
          {/* Mobile header */}
          <div className="bg-white/80 backdrop-blur-xl border-b border-gray-200/60 px-4 py-2.5 shrink-0 flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center shadow-sm shadow-indigo-200">
              <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
              </svg>
            </div>
            <h1 className="text-sm font-semibold text-gray-900 tracking-tight">TTS Voxa</h1>
          </div>

          {/* Mobile update banner */}
          {updateInfo && !updateDismissed && (
            <div className="bg-gradient-to-r from-blue-500 to-indigo-500 text-white px-4 py-2 flex items-center justify-between shrink-0">
              <span className="text-xs font-medium">有新版本 v{updateInfo.latest}</span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => { setActiveTab('settings'); setUpdateDismissed(true) }}
                  className="px-2 py-0.5 bg-white/20 hover:bg-white/30 rounded text-[10px] font-medium transition-all"
                >
                  查看
                </button>
                <button onClick={() => setUpdateDismissed(true)} className="p-0.5 hover:bg-white/20 rounded transition-all">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          )}

          <main className="flex-1 overflow-y-auto p-3 pb-20">
            <Suspense fallback={<div className="text-center py-16 text-gray-400 text-sm">加载中...</div>}>
              {renderPage()}
            </Suspense>
          </main>

          {/* Bottom tab bar */}
          <nav className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-xl border-t border-gray-200/60 px-2 py-1.5 flex justify-around z-30">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-xl transition-all min-w-0 ${
                  activeTab === tab.id
                    ? 'text-indigo-600'
                    : 'text-gray-400'
                }`}
              >
                {tab.icon}
                <span className="text-[10px] font-medium truncate">{tab.label}</span>
              </button>
            ))}
          </nav>
        </div>
      </div>
    </TaskProvider>
  )
}

export default App
