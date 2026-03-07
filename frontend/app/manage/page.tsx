'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { startScrape, getScrapeStatus, startIndex, getIndexStatus, startIndexUpload } from '@/lib/api'
import type { BackgroundTask } from '@/lib/types'

// ─── Live log panel ───────────────────────────────────────────────────────────

function LiveLog({ task, onDone }: { task: BackgroundTask | null; onDone?: (outputFile?: string) => void }) {
  const logRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [task?.logs])

  useEffect(() => {
    if (task?.status === 'done' && onDone) onDone(task.output_file)
  }, [task?.status, task?.output_file, onDone])

  if (!task) return null

  const statusColor = task.status === 'done' ? '#22c55e' : task.status === 'error' ? '#ef4444' : '#f59e0b'
  const statusLabel = task.status === 'done' ? '✓ Done' : task.status === 'error' ? '✗ Error' : '⟳ Running'

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      style={{ borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden', marginTop: 16 }}>
      <div style={{
        padding: '10px 16px', background: 'rgba(255,255,255,0.03)',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Live Log
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {task.status === 'running' && (
            <motion.div animate={{ opacity: [1, 0.3, 1] }} transition={{ repeat: Infinity, duration: 1.2 }}
              style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor }} />
          )}
          <span style={{ fontSize: 11, fontWeight: 700, color: statusColor }}>{statusLabel}</span>
        </div>
      </div>
      <div ref={logRef} style={{
        height: 280, overflowY: 'auto', padding: '10px 14px',
        background: '#050810', fontFamily: 'monospace', fontSize: 11, lineHeight: 1.7,
      }}>
        {task.logs.map((line, i) => {
          const isSuccess = line.startsWith('✓')
          const isError = line.startsWith('✗')
          const isDone = line.includes('[DONE]')
          const isSearch = line.includes('[SEARCH]')
          const isFail = line.includes('[FAIL]')
          return (
            <div key={i} style={{
              color: isSuccess ? '#22c55e' : isError || isFail ? '#ef4444' : isDone ? '#06b6d4' : isSearch ? '#a5b4fc' : '#64748b',
              padding: '1px 0',
            }}>
              {line}
            </div>
          )
        })}
        {task.status === 'running' && (
          <motion.div animate={{ opacity: [1, 0] }} transition={{ repeat: Infinity, duration: 0.8 }}
            style={{ display: 'inline-block', width: 8, height: 12, background: '#475569', marginLeft: 4 }} />
        )}
      </div>
    </motion.div>
  )
}

// ─── Scrape tab ───────────────────────────────────────────────────────────────

function ScrapeTab() {
  const [keywords, setKeywords] = useState('')
  const [outputFile, setOutputFile] = useState('scraped_manual.json')
  const [scrapeTask, setScrapeTask] = useState<BackgroundTask | null>(null)
  const [scrapeTaskId, setScrapeTaskId] = useState<string | null>(null)
  const [indexTask, setIndexTask] = useState<BackgroundTask | null>(null)
  const [indexTaskId, setIndexTaskId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Poll scrape task
  useEffect(() => {
    if (!scrapeTaskId || !scrapeTask || scrapeTask.status !== 'running') return
    const interval = setInterval(async () => {
      try {
        const updated = await getScrapeStatus(scrapeTaskId)
        setScrapeTask(updated)
        if (updated.status === 'done') {
          const file = updated.output_file || outputFile
          // Auto-start indexing
          const { task_id } = await startIndex(file, true, false)
          setIndexTaskId(task_id)
          setIndexTask({ status: 'running', logs: [`Sending ${file} to vector storage…`], started_at: Date.now() / 1000 })
        }
      } catch { clearInterval(interval) }
    }, 1500)
    return () => clearInterval(interval)
  }, [scrapeTaskId, scrapeTask?.status, outputFile])

  // Poll index task
  useEffect(() => {
    if (!indexTaskId || !indexTask || indexTask.status !== 'running') return
    const interval = setInterval(async () => {
      try {
        const updated = await getIndexStatus(indexTaskId)
        setIndexTask(updated)
      } catch { clearInterval(interval) }
    }, 1500)
    return () => clearInterval(interval)
  }, [indexTaskId, indexTask?.status])

  const handleStart = async () => {
    const lines = keywords.split('\n').map(s => s.trim()).filter(Boolean)
    if (lines.length === 0) return
    setLoading(true)
    setScrapeTask(null)
    setIndexTask(null)
    setIndexTaskId(null)
    try {
      const { task_id } = await startScrape(lines, outputFile)
      setScrapeTaskId(task_id)
      setScrapeTask({ status: 'running', logs: [`Starting scrape for ${lines.length} keyword(s)…`], started_at: Date.now() / 1000 })
    } finally {
      setLoading(false)
    }
  }

  const keywordCount = keywords.split('\n').filter(s => s.trim()).length
  const isBusy = loading || scrapeTask?.status === 'running' || indexTask?.status === 'running'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 16 }}>
        {/* Left: keywords */}
        <div style={{ flex: 2 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>
            Keywords to scrape <span style={{ color: '#334155', fontWeight: 400 }}>(one per line)</span>
          </label>
          <textarea
            value={keywords}
            onChange={e => setKeywords(e.target.value)}
            placeholder={'Samsung 65 QLED 4K\n65 Zoll OLED TV\nLG C3 OLED 65\nPhilips Ambilight 4K'}
            rows={10}
            style={{
              width: '100%', padding: '12px 14px', borderRadius: 10, resize: 'vertical',
              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)',
              color: '#e2e8f0', fontSize: 13, fontFamily: 'monospace', lineHeight: 1.6, outline: 'none',
            }}
            onFocus={e => (e.currentTarget.style.borderColor = 'rgba(99,102,241,0.45)')}
            onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.09)')}
          />
          <div style={{ fontSize: 11, color: '#334155', marginTop: 5 }}>
            {keywordCount > 0 ? `${keywordCount} keyword${keywordCount !== 1 ? 's' : ''} — will search e-tec.at, expert.at, electronic4you.at` : 'Enter keywords…'}
          </div>
        </div>

        {/* Right: options */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>Output file</label>
            <input value={outputFile} onChange={e => setOutputFile(e.target.value)}
              style={{
                width: '100%', padding: '9px 12px', borderRadius: 10,
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)',
                color: '#e2e8f0', fontSize: 12, outline: 'none',
              }}
              onFocus={e => (e.currentTarget.style.borderColor = 'rgba(99,102,241,0.45)')}
              onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.09)')}
            />
          </div>

          <div style={{ padding: 14, borderRadius: 10, background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#6366f1', marginBottom: 8 }}>Automatic Pipeline</div>
            {[
              { label: '1. Scrape search results', done: !!scrapeTask },
              { label: '2. Extract product pages', done: !!scrapeTask },
              { label: '3. Write JSON output', done: scrapeTask?.status === 'done' },
              { label: '4. Index into Weaviate', done: indexTask?.status === 'done', active: indexTask?.status === 'running' },
            ].map((s, i) => (
              <div key={i} style={{ fontSize: 11, color: s.done ? '#22c55e' : s.active ? '#f59e0b' : '#475569', padding: '2px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: s.done ? '#22c55e' : s.active ? '#f59e0b' : '#6366f1' }}>{s.done ? '✓' : s.active ? '⟳' : '→'}</span>{s.label}
              </div>
            ))}
          </div>

          <button
            onClick={handleStart}
            disabled={isBusy || keywordCount === 0}
            style={{
              padding: '11px', borderRadius: 10, border: 'none', fontWeight: 700, fontSize: 13,
              cursor: isBusy || keywordCount === 0 ? 'not-allowed' : 'pointer',
              background: isBusy || keywordCount === 0 ? 'rgba(99,102,241,0.15)' : 'linear-gradient(135deg, #6366f1, #7c3aed)',
              color: isBusy || keywordCount === 0 ? '#334155' : '#fff',
              boxShadow: isBusy || keywordCount === 0 ? 'none' : '0 4px 20px rgba(99,102,241,0.4)',
              transition: 'all 0.15s',
            }}
          >
            {scrapeTask?.status === 'running' ? '⟳ Scraping…' : indexTask?.status === 'running' ? '⟳ Indexing…' : `▶ Start (${keywordCount || 0} keywords)`}
          </button>
        </div>
      </div>

      {/* Scrape log */}
      <LiveLog task={scrapeTask} />

      {/* Index status banner + log */}
      <AnimatePresence>
        {indexTask && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
            <div style={{
              padding: '12px 16px', borderRadius: 10, marginBottom: 8,
              background: indexTask.status === 'done' ? 'rgba(34,197,94,0.08)' : indexTask.status === 'error' ? 'rgba(239,68,68,0.08)' : 'rgba(6,182,212,0.08)',
              border: `1px solid ${indexTask.status === 'done' ? 'rgba(34,197,94,0.25)' : indexTask.status === 'error' ? 'rgba(239,68,68,0.25)' : 'rgba(6,182,212,0.25)'}`,
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              {indexTask.status === 'running' && (
                <motion.div animate={{ opacity: [1, 0.3, 1] }} transition={{ repeat: Infinity, duration: 1.2 }}
                  style={{ width: 8, height: 8, borderRadius: '50%', background: '#06b6d4', flexShrink: 0 }} />
              )}
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: indexTask.status === 'done' ? '#22c55e' : indexTask.status === 'error' ? '#ef4444' : '#06b6d4' }}>
                  {indexTask.status === 'done' ? '✓ Indexed into Weaviate — ready to search' : indexTask.status === 'error' ? '✗ Indexing failed' : 'Sending to vector storage…'}
                </div>
                {indexTask.status === 'running' && (
                  <div style={{ fontSize: 11, color: '#334155', marginTop: 2 }}>
                    Products are being embedded and stored in Weaviate. You will be notified once complete.
                  </div>
                )}
              </div>
            </div>
            <LiveLog task={indexTask} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Index tab ────────────────────────────────────────────────────────────────

type IndexMode = 'upload' | 'paste'

function Toggle({ value, onChange, label, desc }: { value: boolean; onChange: (v: boolean) => void; label: string; desc: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#94a3b8' }}>{label}</div>
        <div style={{ fontSize: 11, color: '#334155', marginTop: 2 }}>{desc}</div>
      </div>
      <button onClick={() => onChange(!value)}
        style={{
          width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer',
          background: value ? '#6366f1' : 'rgba(255,255,255,0.1)',
          position: 'relative', transition: 'background 0.2s', flexShrink: 0,
        }}
      >
        <div style={{
          position: 'absolute', top: 3, left: value ? 21 : 3, width: 16, height: 16,
          borderRadius: '50%', background: '#fff', transition: 'left 0.2s',
        }} />
      </button>
    </div>
  )
}

function IndexTab() {
  const [mode, setMode] = useState<IndexMode>('upload')
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [pastedJson, setPastedJson] = useState('')
  const [dragging, setDragging] = useState(false)
  const [jsonError, setJsonError] = useState<string | null>(null)
  const [scraped, setScraped] = useState(true)
  const [reset, setReset] = useState(false)
  const [task, setTask] = useState<BackgroundTask | null>(null)
  const [taskId, setTaskId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!taskId || !task || task.status !== 'running') return
    const interval = setInterval(async () => {
      try {
        const updated = await getIndexStatus(taskId)
        setTask(updated)
      } catch { clearInterval(interval) }
    }, 1500)
    return () => clearInterval(interval)
  }, [taskId, task?.status])

  const handleFile = (f: File) => {
    setUploadedFile(f)
    setJsonError(null)
  }

  const handlePasteChange = (v: string) => {
    setPastedJson(v)
    setJsonError(null)
    if (v.trim()) {
      try { JSON.parse(v) } catch { setJsonError('Invalid JSON') }
    }
  }

  const isReady = () => {
    if (mode === 'upload') return !!uploadedFile
    if (mode === 'paste') return !!pastedJson.trim() && !jsonError
    return false
  }

  const handleStart = async () => {
    if (!isReady() || loading || task?.status === 'running') return
    setLoading(true)
    try {
      const result = await startIndexUpload(
        mode === 'upload' ? { file: uploadedFile! } : { jsonContent: pastedJson },
        scraped,
        reset,
      )
      setTask({ status: 'running', logs: ['Uploading and indexing…'], started_at: Date.now() / 1000 })
      setTaskId(result.task_id)
    } catch (e) {
      setTask({ status: 'error', logs: [e instanceof Error ? e.message : 'Failed to start'], started_at: Date.now() / 1000 })
    } finally {
      setLoading(false)
    }
  }

  const MODE_OPTS: { id: IndexMode; label: string }[] = [
    { id: 'upload', label: 'Upload File' },
    { id: 'paste', label: 'Paste JSON' },
  ]

  const btnDisabled = !isReady() || loading || task?.status === 'running'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Mode selector */}
      <div style={{ display: 'flex', gap: 4, background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 4, width: 'fit-content' }}>
        {MODE_OPTS.map(opt => (
          <button key={opt.id} onClick={() => setMode(opt.id)}
            style={{
              padding: '6px 16px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
              background: mode === opt.id ? 'rgba(6,182,212,0.18)' : 'transparent',
              color: mode === opt.id ? '#06b6d4' : '#475569',
              transition: 'all 0.15s',
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 16 }}>
        <div style={{ flex: 2, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <AnimatePresence mode="wait">
            {mode === 'upload' && (
              <motion.div key="upload" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <input ref={fileInputRef} type="file" accept=".json" style={{ display: 'none' }}
                  onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={e => { e.preventDefault(); setDragging(true) }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={e => { e.preventDefault(); setDragging(false); e.dataTransfer.files[0] && handleFile(e.dataTransfer.files[0]) }}
                  style={{
                    border: `2px dashed ${dragging ? 'rgba(6,182,212,0.6)' : uploadedFile ? 'rgba(34,197,94,0.4)' : 'rgba(255,255,255,0.12)'}`,
                    borderRadius: 12, padding: '32px 20px', textAlign: 'center', cursor: 'pointer',
                    background: dragging ? 'rgba(6,182,212,0.06)' : 'rgba(255,255,255,0.02)',
                    transition: 'all 0.15s',
                  }}
                >
                  {uploadedFile ? (
                    <>
                      <div style={{ fontSize: 28, marginBottom: 8 }}>✓</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#22c55e' }}>{uploadedFile.name}</div>
                      <div style={{ fontSize: 11, color: '#475569', marginTop: 4 }}>
                        {(uploadedFile.size / 1024).toFixed(1)} KB — click to replace
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize: 28, marginBottom: 8, opacity: 0.3 }}>📂</div>
                      <div style={{ fontSize: 13, color: '#475569' }}>Drop a JSON file here</div>
                      <div style={{ fontSize: 11, color: '#334155', marginTop: 4 }}>or click to browse</div>
                    </>
                  )}
                </div>
              </motion.div>
            )}

            {mode === 'paste' && (
              <motion.div key="paste" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>Paste JSON</label>
                  {jsonError && <span style={{ fontSize: 11, color: '#ef4444' }}>{jsonError}</span>}
                  {pastedJson && !jsonError && <span style={{ fontSize: 11, color: '#22c55e' }}>✓ Valid JSON</span>}
                </div>
                <textarea
                  value={pastedJson}
                  onChange={e => handlePasteChange(e.target.value)}
                  placeholder={'[\n  { "name": "Product A", ... },\n  { "name": "Product B", ... }\n]'}
                  rows={10}
                  style={{
                    width: '100%', padding: '12px 14px', borderRadius: 10, resize: 'vertical',
                    background: 'rgba(255,255,255,0.04)',
                    border: `1px solid ${jsonError ? 'rgba(239,68,68,0.5)' : pastedJson && !jsonError ? 'rgba(34,197,94,0.4)' : 'rgba(255,255,255,0.09)'}`,
                    color: '#e2e8f0', fontSize: 12, fontFamily: 'monospace', lineHeight: 1.6, outline: 'none',
                  }}
                  onFocus={e => !jsonError && (e.currentTarget.style.borderColor = 'rgba(6,182,212,0.45)')}
                  onBlur={e => (e.currentTarget.style.borderColor = jsonError ? 'rgba(239,68,68,0.5)' : pastedJson && !jsonError ? 'rgba(34,197,94,0.4)' : 'rgba(255,255,255,0.09)')}
                />
              </motion.div>
            )}
          </AnimatePresence>

          <Toggle value={scraped} onChange={setScraped}
            label="Mark as Scraped"
            desc="Enables filtering by source in batch matching"
          />
          <Toggle value={reset} onChange={setReset}
            label="Reset collection first"
            desc="Deletes all existing Weaviate objects before indexing"
          />
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{
            padding: 14, borderRadius: 10, background: 'rgba(6,182,212,0.06)',
            border: '1px solid rgba(6,182,212,0.15)', flex: 1,
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#06b6d4', marginBottom: 8 }}>What gets indexed</div>
            {['Products embedded via OpenAI', 'Stored in Weaviate vector DB', 'Scraped flag preserved', 'Available for nearText search'].map((s, i) => (
              <div key={i} style={{ fontSize: 11, color: '#475569', padding: '2px 0' }}>
                <span style={{ color: '#06b6d4', marginRight: 6 }}>→</span>{s}
              </div>
            ))}
          </div>

          <button
            onClick={handleStart}
            disabled={btnDisabled}
            style={{
              padding: '11px', borderRadius: 10, border: 'none', fontWeight: 700, fontSize: 13,
              cursor: btnDisabled ? 'not-allowed' : 'pointer',
              background: btnDisabled ? 'rgba(6,182,212,0.12)' : 'linear-gradient(135deg, #0891b2, #06b6d4)',
              color: btnDisabled ? '#334155' : '#fff',
              boxShadow: btnDisabled ? 'none' : '0 4px 20px rgba(6,182,212,0.3)',
              transition: 'all 0.15s',
            }}
          >
            {task?.status === 'running' ? '⟳ Indexing…' : '▶ Start Indexing'}
          </button>
        </div>
      </div>

      <LiveLog task={task} />

      <AnimatePresence>
        {task?.status === 'done' && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
            style={{ padding: '14px 18px', borderRadius: 10, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#22c55e' }}>✓ Indexing complete</div>
            <div style={{ fontSize: 12, color: '#475569', marginTop: 4 }}>
              Products are now searchable. Head to <strong style={{ color: '#64748b' }}>Search</strong> to find substitutes.
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'scrape', label: '🌐 Scrape from Web', desc: 'Scrape product pages using keywords' },
  { id: 'index', label: '⚡ Index from File', desc: 'Import a JSON file into Weaviate' },
]

export default function IndexPage() {
  const [tab, setTab] = useState<'scrape' | 'index'>('scrape')

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        padding: '20px 28px 0', borderBottom: '1px solid rgba(255,255,255,0.055)',
        background: 'rgba(255,255,255,0.01)', flexShrink: 0,
      }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#e2e8f0', letterSpacing: '-0.02em', marginBottom: 4 }}>
          Index Manager
        </h1>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: '#334155' }}>
          Scrape product pages from the web or index a local JSON file into Weaviate.
        </p>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 2 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id as 'scrape' | 'index')}
              style={{
                padding: '10px 20px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                borderBottom: tab === t.id ? '2px solid #6366f1' : '2px solid transparent',
                background: 'transparent',
                color: tab === t.id ? '#a5b4fc' : '#475569',
                transition: 'all 0.15s',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflow: 'auto', padding: 28 }}>
        <AnimatePresence mode="wait">
          <motion.div key={tab} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.15 }}>
            {tab === 'scrape' ? <ScrapeTab /> : <IndexTab />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
