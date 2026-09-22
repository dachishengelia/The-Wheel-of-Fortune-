import { AnimatePresence, motion } from 'framer-motion'
import confetti from 'canvas-confetti'
import { useEffect, useMemo, useRef, useState } from 'react'
import useSound from 'use-sound'
import './App.css'

const defaultNames = ['Dachi', 'Alex', 'Mariam', 'Nika', 'Sandro']
const wheelColors = ['#f36f56', '#f5b544', '#80a86b', '#6a9bc7', '#d7a0a8', '#8d7cae']
const spinDuration = 3600
const namesStorageKey = 'wheel-of-fortune-names'
const themeStorageKey = 'wheel-of-fortune-theme'
const soundStorageKey = 'wheel-of-fortune-sound'
const confettiPieces = Array.from({ length: 34 }, (_, index) => index)

const createOption = (name, index) => ({
  id: `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
  name,
  weight: 1,
  color: wheelColors[index % wheelColors.length],
})

const createDefaultOptions = () => defaultNames.map(createOption)

const loadOptions = () => {
  try {
    const storedOptions = JSON.parse(window.localStorage.getItem(namesStorageKey))
    if (Array.isArray(storedOptions)) {
      return storedOptions.map((option, index) => {
        if (typeof option === 'string') return createOption(option, index)
        if (!option || typeof option.name !== 'string') return null
        return {
          id: option.id || createOption(option.name, index).id,
          name: option.name.trim(),
          weight: Math.min(10, Math.max(1, Number(option.weight) || 1)),
          color: /^#[\da-f]{6}$/i.test(option.color) ? option.color : wheelColors[index % wheelColors.length],
        }
      }).filter((option) => option?.name)
    }
  } catch {
    return createDefaultOptions()
  }

  return createDefaultOptions()
}

const loadTheme = () => {
  try {
    return window.localStorage.getItem(themeStorageKey) === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

const loadSound = () => {
  return false
}

function Icon({ name }) {
  const paths = {
    moon: <path d="M20.5 14.2A8.6 8.6 0 0 1 9.8 3.5 8.7 8.7 0 1 0 20.5 14.2Z" />,
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
    expand: <><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M21 16v5h-5" /><path d="m3 8 5-5M16 3l5 5M3 16l5 5M16 21l5-5" /></>,
    minimize: <><path d="M8 3v5H3M16 3v5h5M8 21v-5H3M21 16h-5v5" /></>,
    volume: <><path d="M4 9v6h4l5 4V5L8 9H4Z" /><path d="M17 9.5a4 4 0 0 1 0 5M19.5 7a7.5 7.5 0 0 1 0 10" /></>,
    mute: <><path d="M4 9v6h4l5 4V5L8 9H4Z" /><path d="m18 9 4 6M22 9l-4 6" /></>,
  }
  return <svg className="control-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

function App() {
  const [options, setOptions] = useState(loadOptions)
  const [inputValue, setInputValue] = useState('')
  const [winner, setWinner] = useState('')
  const [, setNotice] = useState('')
  const [isSpinning, setIsSpinning] = useState(false)
  const [rotation, setRotation] = useState(0)
  const [theme, setTheme] = useState(loadTheme)
  const [soundEnabled, setSoundEnabled] = useState(loadSound)
  const [showWinnerDialog, setShowWinnerDialog] = useState(false)
  const [showConfetti, setShowConfetti] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [playTick] = useSound('/sounds/tick.mp3', { soundEnabled })
  const [playWin] = useSound('/sounds/win.mp3', { soundEnabled })
  const spinTimeout = useRef(null)
  const confettiTimeout = useRef(null)
  const audioContext = useRef(null)
  const soundTimer = useRef(null)

  const totalWeight = options.reduce((total, option) => total + option.weight, 0)
  const weightedSlices = useMemo(() => {
    return options.reduce((slices, option) => {
      const start = slices.at(-1)?.end || 0
      const size = option.weight / totalWeight * 360
      return [...slices, { ...option, start, size, end: start + size, middle: start + size / 2 }]
    }, [])
  }, [options, totalWeight])

  const wheelBackground = useMemo(() => {
    if (!weightedSlices.length) return 'conic-gradient(#777 0 100%)'
    return `conic-gradient(${weightedSlices.map((slice) => `${slice.color} ${slice.start / 3.6}% ${(slice.start + slice.size) / 3.6}%`).join(', ')})`
  }, [weightedSlices])

  useEffect(() => {
    window.localStorage.setItem(namesStorageKey, JSON.stringify(options))
  }, [options])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    window.localStorage.setItem(themeStorageKey, theme)
  }, [theme])

  useEffect(() => {
    window.localStorage.setItem(soundStorageKey, soundEnabled ? 'on' : 'off')
  }, [soundEnabled])

  useEffect(() => {
    const syncFullscreen = () => setIsFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', syncFullscreen)
    return () => document.removeEventListener('fullscreenchange', syncFullscreen)
  }, [])

  useEffect(() => {
    if (!showWinnerDialog) return undefined
    const closeOnEscape = (event) => event.key === 'Escape' && setShowWinnerDialog(false)
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [showWinnerDialog])

  const stopSound = () => {
    window.clearInterval(soundTimer.current)
    soundTimer.current = null
  }

  const playSpinSound = () => {
    if (!soundEnabled) return
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext
      if (!AudioContextClass) return
      const context = audioContext.current || new AudioContextClass()
      audioContext.current = context
      context.resume()
      stopSound()
      const playCasinoClick = () => {
        playTick({ id: 'roulette-tick' })
        const click = context.createOscillator()
        const clickGain = context.createGain()
        const lowTick = context.createOscillator()
        const lowGain = context.createGain()
        const now = context.currentTime
        click.type = 'square'
        click.frequency.setValueAtTime(1250 + Math.random() * 260, now)
        click.frequency.exponentialRampToValueAtTime(620, now + 0.035)
        clickGain.gain.setValueAtTime(0.0001, now)
        clickGain.gain.exponentialRampToValueAtTime(0.075, now + 0.004)
        clickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045)
        lowTick.type = 'triangle'
        lowTick.frequency.setValueAtTime(145, now)
        lowGain.gain.setValueAtTime(0.0001, now)
        lowGain.gain.exponentialRampToValueAtTime(0.04, now + 0.003)
        lowGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06)
        click.connect(clickGain).connect(context.destination)
        lowTick.connect(lowGain).connect(context.destination)
        click.start(now)
        lowTick.start(now)
        click.stop(now + 0.05)
        lowTick.stop(now + 0.07)
      }
      playCasinoClick()
      soundTimer.current = window.setInterval(playCasinoClick, 108)
    } catch {
      setSoundEnabled(false)
    }
  }

  const playConfettiSound = () => {
    if (!soundEnabled || !audioContext.current) return
    try {
      const context = audioContext.current
      context.resume()
      const playPop = (startTime, pitch) => {
        const length = Math.floor(context.sampleRate * 0.12)
        const buffer = context.createBuffer(1, length, context.sampleRate)
        const noise = buffer.getChannelData(0)
        for (let index = 0; index < length; index += 1) {
          noise[index] = (Math.random() * 2 - 1) * (1 - index / length)
        }
        const source = context.createBufferSource()
        const filter = context.createBiquadFilter()
        const gain = context.createGain()
        source.buffer = buffer
        filter.type = 'highpass'
        filter.frequency.setValueAtTime(500, startTime)
        gain.gain.setValueAtTime(0.0001, startTime)
        gain.gain.exponentialRampToValueAtTime(0.2, startTime + 0.006)
        gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.12)
        source.connect(filter).connect(gain).connect(context.destination)
        source.start(startTime)
        source.stop(startTime + 0.13)

        const popTone = context.createOscillator()
        const toneGain = context.createGain()
        popTone.type = 'sine'
        popTone.frequency.setValueAtTime(pitch, startTime)
        popTone.frequency.exponentialRampToValueAtTime(pitch * 0.42, startTime + 0.13)
        toneGain.gain.setValueAtTime(0.0001, startTime)
        toneGain.gain.exponentialRampToValueAtTime(0.09, startTime + 0.004)
        toneGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.15)
        popTone.connect(toneGain).connect(context.destination)
        popTone.start(startTime)
        popTone.stop(startTime + 0.16)
      }

      const now = context.currentTime
      playPop(now, 720)
      playPop(now + 0.12, 920)
      playPop(now + 0.24, 1120)

      const horn = context.createOscillator()
      const hornGain = context.createGain()
      horn.type = 'sawtooth'
      horn.frequency.setValueAtTime(220, now + 0.28)
      horn.frequency.exponentialRampToValueAtTime(520, now + 0.72)
      horn.frequency.exponentialRampToValueAtTime(340, now + 0.9)
      hornGain.gain.setValueAtTime(0.0001, now + 0.28)
      hornGain.gain.exponentialRampToValueAtTime(0.045, now + 0.34)
      hornGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.92)
      horn.connect(hornGain).connect(context.destination)
      horn.start(now + 0.28)
      horn.stop(now + 0.95)

      ;[523.25, 659.25, 783.99].forEach((frequency, index) => {
        const oscillator = context.createOscillator()
        const gain = context.createGain()
        const startTime = now + 0.92 + index * 0.09
        oscillator.type = 'sine'
        oscillator.frequency.setValueAtTime(frequency, startTime)
        gain.gain.setValueAtTime(0.0001, startTime)
        gain.gain.exponentialRampToValueAtTime(0.055, startTime + 0.025)
        gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.42)
        oscillator.connect(gain).connect(context.destination)
        oscillator.start(startTime)
        oscillator.stop(startTime + 0.44)
      })
    } catch {
      setSoundEnabled(false)
    }
  }

  const updateOption = (id, changes) => {
    if (isSpinning) return
    setOptions((current) => current.map((option) => option.id === id ? { ...option, ...changes } : option))
  }

  const handleAddName = (event) => {
    event.preventDefault()
    const trimmedValue = inputValue.trim()
    if (!trimmedValue) return setNotice('Type a name before adding it.')
    if (options.some((option) => option.name.toLowerCase() === trimmedValue.toLowerCase())) {
      setNotice('That option is already on the wheel.')
      setInputValue('')
      return
    }
    setOptions((current) => [...current, createOption(trimmedValue, current.length)])
    setInputValue('')
    setWinner('')
    setNotice(`${trimmedValue} was added to the wheel.`)
  }

  const handleRemoveName = (id) => {
    if (isSpinning) return
    const option = options.find((item) => item.id === id)
    if (options.length <= 2) return setNotice('Keep at least 2 options to spin.')
    setOptions((current) => current.filter((item) => item.id !== id))
    setWinner('')
    setNotice(`${option?.name} was removed.`)
  }

  const handleResetNames = () => {
    if (isSpinning) return
    setOptions(createDefaultOptions())
    setWinner('')
    setInputValue('')
    setNotice('The list was reset to the original options.')
  }

  const handleRemoveWinner = () => {
    if (!winner || isSpinning) return
    setOptions((current) => current.filter((option) => option.name !== winner))
    setNotice(`${winner} was removed from the wheel.`)
    setWinner('')
    setShowWinnerDialog(false)
  }

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await document.documentElement.requestFullscreen()
    } catch {
      setNotice('Fullscreen is not available in this browser.')
    }
  }

  const spinWheel = () => {
    if (isSpinning || options.length < 2) return
    setIsSpinning(true)
    setWinner('')
    setNotice('Choosing a winner...')
    playSpinSound()
    const randomValue = Math.random() * totalWeight
    const winningSlice = weightedSlices.find((slice) => randomValue < slice.start / 360 * totalWeight + slice.weight) || weightedSlices.at(-1)
    const randomSpins = Math.floor(Math.random() * 5) + 5
    const offsetToPointer = 360 - winningSlice.middle
    setRotation((current) => current + randomSpins * 360 + offsetToPointer)
    spinTimeout.current = window.setTimeout(() => {
      stopSound()
      setIsSpinning(false)
      setWinner(winningSlice.name)
      setNotice('Winner selected')
      setShowWinnerDialog(true)
      setShowConfetti(true)
      playWin({ id: 'winner-fanfare' })
      confetti({
        particleCount: 150,
        spread: 80,
        origin: { y: 0.6 },
        colors: wheelColors,
      })
      playConfettiSound()
      confettiTimeout.current = window.setTimeout(() => setShowConfetti(false), 1800)
    }, spinDuration)
  }

  useEffect(() => () => {
    window.clearTimeout(spinTimeout.current)
    window.clearTimeout(confettiTimeout.current)
    stopSound()
    audioContext.current?.close()
  }, [])

  return (
    <main className={`app-shell ${isFullscreen ? 'is-fullscreen' : ''}`}>
      <div className="app-frame">
        {!isFullscreen && <header className="app-header">
          <div><p className="eyebrow">A little chance</p><h1>The Wheel of Fortune</h1></div>
          <button type="button" className="theme-toggle icon-button" onClick={() => setTheme((current) => current === 'light' ? 'dark' : 'light')} aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`} title={`Switch to ${theme === 'light' ? 'Dark' : 'Light'} theme`}><Icon name={theme === 'light' ? 'moon' : 'sun'} /></button>
        </header>}

        <AnimatePresence>{showConfetti && <motion.div className="confetti-layer" aria-hidden="true" initial={{ opacity: 1 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>{confettiPieces.map((piece) => <span key={piece} className="confetti-piece" style={{ '--confetti-x': `${(piece * 37) % 110 - 5}%`, '--confetti-rotate': `${(piece * 67) % 360}deg`, '--confetti-delay': `${(piece % 8) * 35}ms`, '--confetti-color': wheelColors[piece % wheelColors.length] }} />)}</motion.div>}</AnimatePresence>

        <div className="workspace">
          <section className="wheel-area" aria-labelledby="wheel-title">
            <div className="section-intro"><h2 id="wheel-title">Who gets picked?</h2></div>
            <div className="wheel-stage">
              <div className="wheel-tools">
                <button type="button" className="icon-button" onClick={toggleFullscreen} aria-label={isFullscreen ? 'Exit fullscreen' : 'Open fullscreen'} title={isFullscreen ? 'Exit fullscreen' : 'Open fullscreen'}><Icon name={isFullscreen ? 'minimize' : 'expand'} /></button>
              </div>
              <div className="wheel-pointer" aria-hidden="true" />
              <div className="wheel-wrapper">
                <motion.div className="wheel" animate={{ rotate: rotation }} transition={{ duration: spinDuration / 1000, ease: [0.12, 0.72, 0.18, 1] }} style={{ background: wheelBackground }}>
                  {weightedSlices.map((slice) => <div key={slice.id} className="wheel-label" style={{ transform: `rotate(${slice.middle}deg)` }}><span>{slice.name}</span></div>)}
                </motion.div>
                <button type="button" className="spin-button" onClick={spinWheel} disabled={isSpinning || options.length < 2} aria-busy={isSpinning}><span>{isSpinning ? 'Wait' : 'Spin'}</span><small>{isSpinning ? 'choosing' : 'the wheel'}</small></button>
              </div>
            </div>
          
          </section>

          {!isFullscreen && <aside className="options-panel" aria-labelledby="options-title">
            <div className="options-heading"><div><p className="section-label">The shortlist</p><h2 id="options-title">Your options</h2></div><span className="list-count">{options.length}</span></div>
            <form className="add-form" onSubmit={handleAddName}><label className="sr-only" htmlFor="add-option">Add an option</label><input id="add-option" type="text" value={inputValue} onChange={(event) => setInputValue(event.target.value)} placeholder="Add someone..." disabled={isSpinning} /><button type="submit" disabled={isSpinning}>Add</button></form>
            <div className="name-list">{options.length ? options.map((option, index) => <motion.div layout key={option.id} className="name-item detailed-item" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -8 }}>
              <span className="name-index">{String(index + 1).padStart(2, '0')}</span>
              <input className="name-value name-input" value={option.name} onChange={(event) => updateOption(option.id, { name: event.target.value })} onBlur={(event) => { if (!event.target.value.trim()) updateOption(option.id, { name: option.name }) }} disabled={isSpinning} aria-label={`Name for option ${index + 1}`} />
              <input className="color-input" type="color" value={option.color} onChange={(event) => updateOption(option.id, { color: event.target.value })} disabled={isSpinning} aria-label={`Color for ${option.name}`} title={`Choose color for ${option.name}`} />
              <div className="weight-control"><button type="button" onClick={() => updateOption(option.id, { weight: Math.max(1, option.weight - 1) })} disabled={isSpinning || option.weight <= 1} aria-label={`Decrease weight for ${option.name}`}>−</button><span aria-label={`Weight ${option.weight}`}>{option.weight}</span><button type="button" onClick={() => updateOption(option.id, { weight: Math.min(10, option.weight + 1) })} disabled={isSpinning || option.weight >= 10} aria-label={`Increase weight for ${option.name}`}>+</button></div>
              <button type="button" className="remove-button" onClick={() => handleRemoveName(option.id)} disabled={isSpinning} aria-label={`Remove ${option.name}`} title={`Remove ${option.name}`}>×</button>
            </motion.div>) : <div className="empty-state">Add at least two options to get started.</div>}</div>
            <div className="list-footer"><p>{options.length < 2 ? 'Add another option to spin.' : 'Weight changes slice size.'}</p><button type="button" className="ghost-button" onClick={handleResetNames} disabled={isSpinning}>Reset list</button></div>
          </aside>}
        </div>

        <AnimatePresence>{showWinnerDialog && winner && <motion.div className="dialog-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => event.target === event.currentTarget && setShowWinnerDialog(false)}><motion.div className="winner-dialog" role="dialog" aria-modal="true" aria-labelledby="winner-dialog-title" initial={{ opacity: 0, y: 18, scale: .96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: .97 }}><p className="dialog-kicker">The wheel has spoken</p><h2 id="winner-dialog-title">{winner}</h2><p className="dialog-copy">This is your pick for this round.</p><div className="dialog-actions"><button type="button" className="dialog-close" onClick={() => setShowWinnerDialog(false)}>Close</button><button type="button" className="dialog-remove" onClick={handleRemoveWinner}>Remove from list</button></div></motion.div></motion.div>}</AnimatePresence>
      </div>
    </main>
  )
}

export default App
