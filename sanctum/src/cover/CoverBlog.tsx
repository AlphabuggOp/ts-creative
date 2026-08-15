import { useEffect, useRef, useState } from 'react'
import './cover.css'

/* ── THE COVER: "SIGNAL & STATIC" ───────────────────────────────────
   A shortwave-listener's field-notes blog, abandoned in March 2013.
   It must survive scrutiny on its own: real history, real texture,
   dead links, a quiet life. NOTHING here points at the Sanctum —
   except one photo that should not exist, and a door that asks.

   THE RITUAL (see PLANNING/JUDGES_ACCESS.md):
     photos → click the ring photo 3× → THE DOOR ASKS → 0528
     (the blog teaches the code: "the hum at 0528") → name → inside. */

const CODE = '0528'

type Post = { d: string; t: string; body: string[]; tags: string; plant?: boolean }

const POSTS: Post[] = [
  {
    d: '14 MAR 2013', t: 'last log. the band is tired.', tags: 'meta',
    body: [
      'Tried all week. The FM band is the same forty songs in a trench coat, MW is preachers and cricket, and even 40m at 3 a.m. sounds like it is thinking about something else.',
      'Someone asked me why I bother pointing antennas at static. I never had a good answer. You listen long enough and the static starts to feel like a room you live in.',
      'The meter is at the bottom of the page; it has not moved in months, so I suppose nobody will read this. Good. This was always a notebook, not a broadcast.',
      'I am leaving the pages up. The hosting is paid through the decade and down here, dust does not settle — static does.',
      '— m.',
    ],
  },
  {
    d: '22 AUG 2011', t: 'the hum at 0528', tags: 'logbook · odd', plant: true,
    body: [
      'Found it again last night, third time this month. Around 0528 kHz — evenings only, never weekends — there is a carrier with no programme on it. Just a pure tone, steady as a struck glass. It sits below the legal band edge where nobody seriously listens.',
      'Here is the part I would not say out loud at the club: when I transmit nothing — key down, carrier only, three short pulses — the tone changes afterwards. Warmer. As if it straightened in its chair.',
      'Three knocks. Always three. I have tried one, I have tried seven; nothing. Three, and the static leans in.',
      'If anyone else ever finds the ring in the photo drawer, knock three times. It answers at 0528. Remember the number the way you remember a doorbell.',
      '— m.',
    ],
  },
  {
    d: '30 MAY 2011', t: 'the wow! signal, 34 years on', tags: 'history',
    body: [
      'August 15, 1977. Big Ear observatory, Ohio. A volunteer — Jerry Ehman — is reviewing the printout when one column stops being noise: 6EQUJ5. An intensity sequence climbing and falling exactly the way a point source should over the telescope\'s 72-second window. He circles it and writes one word in the margin: "Wow!"',
      'Seventy-two seconds. Never heard again despite every serious effort. Not a satellite, not terrestrial — it sat within 50 kHz of the hydrogen line, 1420 MHz, which is exactly where you would shout if you wanted the galaxy\'s radio astronomers to hear you.',
      'I keep a scan of that printout above the desk. Somebody once asked if it depresses me, listening for a knock that came once in 1977 and never again. No. Somebody knocked. That is the whole point.',
      '— m.',
    ],
  },
  {
    d: '02 NOV 2010', t: 'uvb-76 — the buzzer, and the night it stopped', tags: 'logbook',
    body: [
      '4625 kHz. Since at least the late 1970s, day and night: a short, flat buzz, roughly 25 a minute, all year. Everyone in this hobby ends up at "The Buzzer" eventually; it is our campfire.',
      'What keeps it eerie is the obedience. For years, almost nothing. Then, very rarely, the buzz drops and a voice — live, room noise behind it — reads a callsign and a string: numbers, names, sometimes nonsense words. Then the buzz resumes, like a door closing.',
      'In June 2010 the buzzing stopped entirely for a day and the whole community sat up in bed. It came back. It always comes back. Whatever it is for — and nobody with clearance is telling — it is still being maintained, by somebody, right now.',
      '— m.',
    ],
  },
  {
    d: '17 APR 2009', t: 'numbers stations: a primer for the two people who asked', tags: 'guides',
    body: [
      'Shortwave, usually upper sideband, at odd hours of the night: a synthesized voice — often a woman or a child, deliberately flat — reads groups of five numbers or letters for twenty minutes. Then silence. This happens on dozens of frequencies, in English, German, Spanish, Russian, on a schedule you could set a watch by.',
      'The respectable explanation is one-time pads: truly random keys, used once, mathematically unbreakable, and the numbers are just the ciphertext in the open air. The genius of it is the deniability — anyone may listen; only the pad\'s twin may understand.',
      'The Lincolnshire Poacher (RAF Akrotiri, they say) opened with two bars of an English folk song before every read. Imagine designing espionage and deciding it needs a doorbell. Whoever you were, out there: I heard it too.',
      '— m.',
    ],
  },
  {
    d: '09 SEP 2008', t: 'first light on the rt-64', tags: 'logbook · trips',
    body: [
      'Kalyazin. Six hours out of Moscow by road that stopped pretending an hour in, and then the dish arrives before the town does — 64 meters of it, standing over the tree line like furniture left by a previous tenant of the planet.',
      'RT-64 was built for the Venera probes. Venus. Somebody pointed this thing at another world and took dictation from it, and now the gate is chained and the birch trees are reclaiming the service road.',
      'The caretaker let us take photographs and said the panels still "remember the shape of the sky." I did not ask what he meant. Down here at night you do not ask what people mean; you write it down and you keep the torch on.',
      '— m.',
    ],
  },
]

const PHOTOS = [
  { src: '/blog/kalyazin.jpg', cap: 'kalyazin rt-64. we climbed the fence. don\'t.' },
  { src: '/blog/trails.jpg', cap: 'star trails over the one-mile, 55 min, f/4. the sky does the work.' },
  { src: '/blog/dial.jpg', cap: 'the hallicrafters, 3 a.m., 40m open. this is most of the hobby.' },
  { src: '/blog/soviet.jpg', cap: 'soviet-era array, location withheld. the birds own it now.' },
  { src: '/blog/tower.jpg', cap: 'relay tower in fog, red side up. 0.62 megapixels and honest.' },
  { src: '/blog/observatory.jpg', cap: 'the old observatory, dome open. nothing here anymore.' },
  { src: '/blog/portal.jpg', cap: 'IMG_0528 — DO NOT', anomaly: true },
]

type DoorStage = 'closed' | 'asks' | 'name'

export default function CoverBlog({ onUnlock }: { onUnlock: (name: string) => void }) {
  const [tab, setTab] = useState<'log' | 'photos' | 'about'>('log')
  const [knocks, setKnocks] = useState(0)
  const [flicker, setFlicker] = useState(false)
  const [door, setDoor] = useState<DoorStage>('closed')
  const [code, setCode] = useState('')
  const [denied, setDenied] = useState(false)
  const [shaking, setShaking] = useState(false)
  const [name, setName] = useState('')
  const codeRef = useRef<HTMLInputElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)

  /* three knocks: each click tightens the air; the third door opens */
  const knock = () => {
    if (door !== 'closed') return
    setFlicker(true)
    window.setTimeout(() => setFlicker(false), 360)
    setKnocks((k) => {
      const n = k + 1
      if (n >= 3) {
        window.setTimeout(() => {
          setDoor('asks')
          window.setTimeout(() => codeRef.current?.focus(), 120)
        }, 260)
      }
      return n
    })
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && door === 'asks') { setDoor('closed'); setKnocks(0); setCode(''); setDenied(false) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [door])

  const submitCode = (v: string) => {
    if (v.length < 4) return
    if (v === CODE) {
      setDenied(false)
      setDoor('name')
      window.setTimeout(() => nameRef.current?.focus(), 120)
    } else {
      setDenied(true)
      setShaking(true)
      window.setTimeout(() => setShaking(false), 420)
      window.setTimeout(() => setCode(''), 620)
    }
  }

  const submitName = () => {
    const n = name.trim()
    if (n.length < 2) return
    onUnlock(n.toUpperCase().slice(0, 18))
  }

  return (
    <div className={`cv-root ${flicker ? 'cv-flicker' : ''}`} data-cover>
      <div className="cv-wrap">
        <header className="cv-masthead" data-cv-masthead>
          <h1 className="cv-title">SIGNAL <span className="cv-amp">&amp;</span> STATIC</h1>
          <p className="cv-tag">field notes from a dying band — shortwave, numbers, and whatever answers back</p>
          <p className="cv-meta-line">est. SEP 2008 · last transmission 14 MAR 2013 · keeper: m. · the comments are closed. they have been closed for years.</p>
        </header>

        <nav className="cv-nav">
          <a href="#" data-cv-tab="log" className={tab === 'log' ? 'cv-on' : ''} onClick={(e) => { e.preventDefault(); setTab('log') }}>LOG</a>
          <a href="#" data-cv-tab="photos" className={tab === 'photos' ? 'cv-on' : ''} onClick={(e) => { e.preventDefault(); setTab('photos') }}>PHOTOS</a>
          <a href="#" data-cv-tab="about" className={tab === 'about' ? 'cv-on' : ''} onClick={(e) => { e.preventDefault(); setTab('about') }}>ABOUT</a>
          <a href="#" className="cv-dead" onClick={(e) => e.preventDefault()} title="closed. it has been closed for years.">GUESTBOOK</a>
        </nav>

        <div className="cv-cols">
          <main>
            {tab === 'log' && POSTS.map((p) => (
              <article key={p.t} className={`cv-post ${p.plant ? 'cv-plant' : ''}`}>
                <h2><a href="#" onClick={(e) => e.preventDefault()}>{p.t}</a></h2>
                <p className="cv-date">{p.d}</p>
                {p.body.map((para, i) => <p key={i}>{para}</p>)}
                <p className="cv-filed">filed under <a href="#" onClick={(e) => e.preventDefault()}>{p.tags}</a> · comments (0) · permalink</p>
              </article>
            ))}

            {tab === 'photos' && (
              <div>
                <p style={{ fontStyle: 'italic', color: '#8a94a5', fontSize: 13, marginTop: 0 }}>
                  the drawer. mostly the same three subjects for five years. full-size versions are gone with the hard drive; these are the resized ones.
                </p>
                <div className="cv-photos">
                  {PHOTOS.map((ph) => (
                    <figure key={ph.src} className="cv-photo" {...(ph.anomaly ? { 'data-anomaly': '1' } : {})}>
                      {ph.anomaly ? (
                        <a href="#" data-portal-photo data-knocks={knocks} onClick={(e) => { e.preventDefault(); knock() }}>
                          <img src={ph.src} alt={ph.cap} className={knocks === 1 ? 'cv-f1' : knocks >= 2 ? 'cv-f2' : ''} />
                        </a>
                      ) : (
                        <a href="#" onClick={(e) => e.preventDefault()}><img src={ph.src} alt={ph.cap} loading="lazy" /></a>
                      )}
                      <figcaption>{ph.cap}</figcaption>
                    </figure>
                  ))}
                </div>
              </div>
            )}

            {tab === 'about' && (
              <div className="cv-about cv-post" style={{ borderBottom: 0 }}>
                <h2>about the keeper</h2>
                <p className="cv-date">updated 12 JAN 2011</p>
                <p>m. — one battered hallicrafters receiver, two long wires in the pines, and a logbook going back to 2007. I work nights. The radios like nights.</p>
                <p>This site is a notebook, not a broadcast. Everything here was typed by hand into a text editor and uploaded over a connection that complained about it. If a link is dead, it died naturally; out here we do not bury our links, we just stop mentioning them.</p>
                <p>Do not ask about the drawer in the photos page. Some photographs are taken, and some are received.</p>
                <p className="cv-sig">— m. · qth withheld · SWL, never a ham</p>
              </div>
            )}
          </main>

          <aside className="cv-side">
            <h3>STATUS</h3>
            <p>listening post: quiet<br />antenna 2: down (storm)<br />coffee: operational</p>
            <h3>ARCHIVE</h3>
            <ul>
              <li><a href="#" onClick={(e) => e.preventDefault()}>mar 2013</a></li>
              <li><a href="#" onClick={(e) => e.preventDefault()}>aug 2011</a></li>
              <li><a href="#" onClick={(e) => e.preventDefault()}>may 2011</a></li>
              <li><a href="#" onClick={(e) => e.preventDefault()}>nov 2010</a></li>
              <li><a href="#" onClick={(e) => e.preventDefault()}>apr 2009</a></li>
              <li><a href="#" onClick={(e) => e.preventDefault()}>sep 2008</a></li>
            </ul>
            <h3>BLOGROLL</h3>
            <ul>
              <li><a href="#" onClick={(e) => e.preventDefault()}>the swling post (gone)</a></li>
              <li><a href="#" onClick={(e) => e.preventDefault()}>numbers &amp; oddities</a></li>
              <li><a href="#" onClick={(e) => e.preventDefault()}>priyom.org</a></li>
              <li><a href="#" onClick={(e) => e.preventDefault()}>spy numbers (mirror)</a></li>
            </ul>
            <h3>COUNTER</h3>
            <span className="cv-counter" data-cv-counter>001337</span>
            <h3>PEDANTICS</h3>
            <div className="cv-badge">BEST VIEWED AT 1024×768</div>
            <div className="cv-badge">VALID HTML 4.01 (it once was)</div>
            <div className="cv-badge">NO TRACKING. NO COOKIES. ONLY STATIC.</div>
          </aside>
        </div>

        <footer className="cv-footer">
          <span>SIGNAL &amp; STATIC © 2008–2013 m. — surviving is not the same as being alive, but it\'s close</span>
          <span><a href="#" onClick={(e) => e.preventDefault()}>rss</a> · <a href="#" onClick={(e) => e.preventDefault()}>atom</a> · part of the <a href="#" onClick={(e) => e.preventDefault()}>shortwave webring</a> ← random →</span>
        </footer>
      </div>

      {/* ── THE DOOR ── */}
      {door !== 'closed' && (
        <div className={`cv-door ${shaking ? 'cv-shake' : ''}`} data-door={door}>
          <div className="cv-door-box">
            {door === 'asks' && (
              <>
                <p className="cv-door-title">THE DOOR ASKS.</p>
                <p className="cv-door-sub">four digits. the blog already told you.</p>
                <div className="cv-code-row">
                  {[0, 1, 2, 3].map((i) => <span key={i}>{code[i] ?? '·'}</span>)}
                </div>
                <input
                  ref={codeRef}
                  data-code-input
                  inputMode="numeric"
                  maxLength={4}
                  value={code}
                  autoFocus
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, '').slice(0, 4)
                    setCode(v)
                    setDenied(false)
                    if (v.length === 4) submitCode(v)
                  }}
                  aria-label="the code"
                />
                <p className="cv-door-note" data-code-note>{denied ? 'THE DOOR DOES NOT KNOW THAT WORD.' : ''}</p>
                <p className="cv-door-hint">ESC — step back into the dust</p>
              </>
            )}
            {door === 'name' && (
              <>
                <p className="cv-door-title">THE NETWORK MUST KNOW</p>
                <p className="cv-door-sub">WHAT TO CALL YOU.</p>
                <input
                  ref={nameRef}
                  data-name-input
                  className="cv-name-input"
                  maxLength={18}
                  value={name}
                  placeholder="YOUR NAME"
                  autoFocus
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') submitName() }}
                  aria-label="your name"
                />
                <br />
                <button className="cv-name-go" data-name-go onClick={submitName} disabled={name.trim().length < 2}>
                  STEP INSIDE ⟩
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
