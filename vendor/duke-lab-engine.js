/* ============================================================================
   DUKE LAB — engine.js
   The GAN-in-words, deterministic core. Pure logic: no DOM, no WebAudio.
   Runs in the browser (window.DukeLab) and in Node (module.exports) so the
   honesty is testable: same seed, same argument, byte for byte.

   Doctrine this implements (AI-Writings, 2026-08-25):
     - The Grown Musician: fingers generate, the eye judges; the asset is the
       musician (the parameter walk), the song is the receipt.
     - The Golden Residue: critique-novelty compresses toward 1/phi per round;
       the argument converges in ratio, never in fact; what remains is style.
     - The Fakebook Theorem: the referee is a 16-feature gate measuring
       sigma-normalized distance to the canon centroid.
     - The Summary Law: features are measured on the per-note trace, never on
       a summary — the trace is the honest instrument.
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DukeLab = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ------------------------------ honest dice ----------------------------- */
  // FNV-1a: the fleet's hash. Seeds are strings; the roll is a number.
  function fnv1a(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function rngFromSeed(seed) { return mulberry32(fnv1a(seed)); }
  function gauss(rng) { // Box-Muller, honest
    const u = Math.max(rng(), 1e-12), v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
  const lerp = (a, b, t) => a + (b - a) * t;

  /* --------------------------- the 16 features ---------------------------- */
  // 0..1 normalized. The eye's ruler. Names are the critic's vocabulary.
  const FEATURES = [
    { id: 'registerSpread',   label: 'REGISTER SPREAD',    floor: 0.05, note: 'semitone span of the melody line' },
    { id: 'trebleActivity',   label: 'TREBLE ACTIVITY',    floor: 0.00, note: 'does the arm ever go up' },
    { id: 'dynRange',         label: 'DYNAMIC RANGE',      floor: 0.08, note: 'loud-to-quiet spread, per-note trace' },
    { id: 'dynContour',       label: 'DYNAMIC CONTOUR',    floor: 0.15, note: 'call vs reply contrast' },
    { id: 'swingFeel',        label: 'SWING FEEL',         floor: 0.00, note: 'off-8th displacement ratio' },
    { id: 'syncopation',      label: 'SYNCPOPATION',       floor: 0.02, note: 'off-beat & barline-crossing weight' },
    { id: 'downbeatWeight',   label: 'DOWNBEAT ORTHODOXY', floor: 0.00, note: 'square entries on 1 & 3' },
    { id: 'harmonicComplex',  label: 'HARMONIC COMPLEXITY',floor: 0.05, note: 'extensions & alterations per bar' },
    { id: 'chromaticism',     label: 'CHROMATICISM',       floor: 0.00, note: 'non-diatonic approach tones' },
    { id: 'repetition',       label: 'REPETITION',         floor: 0.00, note: 'contour n-gram self-similarity' },
    { id: 'callReply',        label: 'CALL / REPLY',       floor: 0.05, note: 'phrase-answer separation' },
    { id: 'density',          label: 'DENSITY',            floor: 0.05, note: 'events per bar' },
    { id: 'phraseVariance',   label: 'PHRASE VARIANCE',    floor: 0.05, note: 'irregular phrase lengths' },
    { id: 'restRatio',        label: 'REST RATIO',         floor: 0.05, note: 'silence as material' },
    { id: 'bassMovement',     label: 'BASS MOVEMENT',      floor: 0.05, note: 'root motion & approach' },
    { id: 'cadenceRegular',   label: 'CADENCE REGULARITY', floor: 0.00, note: 'expected landing degrees' },
  ];
  const FIDX = {}; FEATURES.forEach((f, i) => (FIDX[f.id] = i));
  const PHI = (1 + Math.sqrt(5)) / 2;

  /* ----------------------------- the canon -------------------------------- */
  // Centroids are 0..1 profiles. Progressions are 16 bars of jazz changes.
  // chord token, roots in semitones relative to tonic, complexity weight
  const PROGRESSIONS = {
    duke: [
      ['Bb6', 0, 3], ['G9', 8, 3], ['C9', 3, 2], ['F9', 10, 2],
      ['Bb6', 0, 3], ['Bb7', 0, 2], ['Eb6', 5, 3], ['E9', 6, 4],
      ['Bb6', 0, 2], ['G9', 8, 3], ['C9', 3, 2], ['F9', 10, 3],
      ['Dm7', 9, 2], ['G9', 8, 3], ['Cm7', 3, 2], ['F9', 10, 3],
    ],
    evans: [
      ['Fma7#11', 0, 4], [null, 0, 0], ['Em7', 9, 2], ['A9', 4, 2],
      ['Dm7', 7, 2], ['G13', 5, 3], ['Cma7', 3, 3], [null, 3, 0],
      ['Fma7#11', 0, 4], ['Abma7', 8, 4], ['Dm7', 7, 2], ['G13', 5, 3],
      ['Em7', 9, 2], ['A9', 4, 3], ['Dm7', 7, 2], ['G13', 5, 3],
    ],
    monk: [
      ['Bb7', 0, 2], ['Bb7', 0, 2], ['Bb7', 0, 3], ['Bb7', 0, 2],
      ['Eb7', 5, 3], ['E9', 6, 4], ['Bb7', 0, 2], ['F7', 10, 2],
      ['Bb7', 0, 3], ['Bb7', 0, 2], ['Eb7', 5, 3], ['E9', 6, 4],
      ['Bb7', 0, 2], ['G7', 8, 2], ['Cm7', 3, 2], ['F7', 10, 3],
    ],
  };
  const ARTISTS = {
    duke: {
      name: 'DUKE ELLINGTON', tonic: 46, // Bb2 midi-ish reference (bass register anchor)
      blurb: 'Jungle harmony, the plunger growl, voicings nobody else could voice.',
      centroid: {
        registerSpread: .78, trebleActivity: .72, dynRange: .55, dynContour: .62,
        swingFeel: .62, syncopation: .70, downbeatWeight: .45, harmonicComplex: .82,
        chromaticism: .58, repetition: .38, callReply: .80, density: .62,
        phraseVariance: .60, restRatio: .30, bassMovement: .78, cadenceRegular: .50,
      },
    },
    evans: {
      name: 'BILL EVANS', tonic: 41, // F
      blurb: 'Cluster voicings held like breath; the quietest loud music ever made.',
      centroid: {
        registerSpread: .80, trebleActivity: .48, dynRange: .88, dynContour: .90,
        swingFeel: .48, syncopation: .45, downbeatWeight: .40, harmonicComplex: .92,
        chromaticism: .72, repetition: .22, callReply: .55, density: .52,
        phraseVariance: .42, restRatio: .66, bassMovement: .35, cadenceRegular: .30,
      },
    },
    monk: {
      name: 'THELONIOUS MONK', tonic: 46,
      blurb: 'Angular cells, sudden stops, notes that land like dropped tools.',
      centroid: {
        registerSpread: .55, trebleActivity: .40, dynRange: .85, dynContour: .78,
        swingFeel: .50, syncopation: .82, downbeatWeight: .18, harmonicComplex: .78,
        chromaticism: .68, repetition: .74, callReply: .75, density: .38,
        phraseVariance: .85, restRatio: .72, bassMovement: .30, cadenceRegular: .18,
      },
    },
  };
  // The gardeners: swappable loss functions. Each re-weights the eye.
  const PERSONAS = {
    purist:    { name: 'THE PURIST',    weights: { harmonicComplex: 2.0, chromaticism: 1.6, cadenceRegular: 1.5, repetition: .8 } },
    engineer:  { name: 'THE ENGINEER',  weights: { dynRange: 1.8, dynContour: 1.6, registerSpread: 1.4, trebleActivity: 1.4, density: 1.2 } },
    romantic:  { name: 'THE ROMANTIC',  weights: { restRatio: 1.8, dynContour: 1.5, callReply: 1.4, phraseVariance: 1.5 } },
    historian: { name: 'THE HISTORIAN', weights: { swingFeel: 1.8, syncopation: 1.5, downbeatWeight: 1.5, bassMovement: 1.3, repetition: 1.2 } },
  };
  // Designed musicians / vibe-coded judges enter the same machine — no special
  // casing downstream. Registration is the public act of designing.
  function registerArtist(key, def) {
    ARTISTS[key] = {
      name: def.name || 'THE STRANGER',
      tonic: def.tonic || 46,
      blurb: def.blurb || 'Designed on the bandstand, not born in the canon.',
      centroid: def.centroid, // keyed by feature id, 16 entries
    };
    PROGRESSIONS[key] = PROGRESSIONS[def.progression || 'duke']; // share a book of changes until the design earns its own
    delete _effCache[key]; // force re-calibration against the reachable
    return key;
  }
  function registerPersona(key, def) {
    PERSONAS[key] = { name: def.name || 'THE GUEST CRITIC', weights: def.weights || {} };
    return key;
  }
  const AXES_HINTS = { // critique lines, chosen by direction of deviation
    registerSpread:  ['The line never leaves the middle octave — REGISTER CEILING.', 'The line sprawls without a home register.'],
    trebleActivity:  ['Treble activity reads 0.0 — the arm never goes up.', 'Too much time in the top shelf; it stops meaning anything.'],
    dynRange:        ['FLAT ARM: one dynamic from bar 1 to bar 16.', 'Dynamics whiplash; nothing holds still long enough to mean it.'],
    dynContour:      ['Call and reply arrive at the same temperature.', 'Every reply over-answers; the conversation is shouting.'],
    swingFeel:       ['Straight eighths where the canon leans back.', 'The layback is syrup; the pulse drowns.'],
    syncopation:     ['Square planing, square pickups — nothing crosses the barline.', 'So much anticipation the barlines dissolve.'],
    downbeatWeight:  ['Every phrase enters on the nose of beat one.', 'Nothing ever lands where a listener can stand.'],
    harmonicComplex: ['Triadic vanilla — the canon carries more altered fruit.', 'Extensions piled until the root is a rumor.'],
    chromaticism:    ['All diatonic steps; no approach tones, no shadow.', 'Chromatic fog — no pitch is a place.'],
    repetition:      ['No cell ever returns; nothing to hold.', 'The cells loop like a stuck record.'],
    callReply:       ['No question, no answer — one long statement.', 'Q&A so rigid the band becomes a metronome.'],
    density:         ['Events thin out; the take goes hungry.', 'Overcrowded bars; no air between events.'],
    phraseVariance:  ['Four-bar squares, every phrase the same length.', 'Phrases so irregular the form stops being a form.'],
    restRatio:       ['No rests — silence is also material.', 'So much space the take forgets to speak.'],
    bassMovement:    ['The bass sits on the root like a stone.', 'The bass wanders; the floor is gone.'],
    cadenceRegular:  ['Landings everywhere except where the ear expects.', 'Every cadence on schedule; nothing surprises the downbeat.'],
  };

  /* ------------------------ params → take → events ------------------------ */
  // Latent knobs are the musician's hands. Events are what you HEAR.
  // The .song text is what you WRITE. The trace is measured on events.
  const SCALE = [0, 2, 4, 5, 7, 9, 11]; // major-ish degrees for approach logic
  function defaultParams() {
    const p = {}; FEATURES.forEach(f => (p[f.id] = 0.5)); return p;
  }
  function paramsFromCentroid(centroid, rng, jitter) {
    const p = {};
    FEATURES.forEach(f => { p[f.id] = clamp(centroid[f.id] + gauss(rng) * jitter, 0, 1); });
    return p;
  }

  function generateTake(params, artistKey, rng) {
    const prog = PROGRESSIONS[artistKey];
    const tonic = ARTISTS[artistKey].tonic;
    const events = [];   // {t, dur, midi, vel, voice}  — t in beats from 0, 16 bars * 4
    const BEATS = 64;
    const swing = params.swingFeel * 0.33; // max ~1/3 of a beat displacement
    const center = 70 + Math.round((params.registerSpread - 0.5) * 4); // melody center ~B4
    const span = 6 + params.registerSpread * 20;
    const restP = params.restRatio * 0.55;
    const densityP = 0.25 + params.density * 1.5; // events per beat attempt
    const chromP = params.chromaticism * 0.5;
    const phraseAvg = 2 + Math.round((1 - params.phraseVariance) * 6); // bars per phrase
    const repCell = params.repetition > 0.5;
    const cellMem = []; // remembered cells for repetition

    // phrase plan
    const phrases = [];
    let bar = 0, phraseIdx = 0;
    while (bar < 16) {
      let len = clamp(Math.round(phraseAvg + gauss(rng) * params.phraseVariance * 3), 1, 6);
      len = Math.min(len, 16 - bar);
      phrases.push({ start: bar, len, idx: phraseIdx++ });
      bar += len;
    }
    const isCall = (bar) => { const ph = phrases.find(p => bar >= p.start && bar < p.start + p.len); return ph ? (ph.idx % 2 === 0) : true; };

    // melody
    let deg = 0, prevMidi = center;
    for (let b = 0; b < 16; b++) {
      const [chSym, rootRel, cxW] = prog[b];
      const root = tonic + 24 + rootRel; // chord root in melody register vicinity
      const beatsInBar = [0, 1, 2, 3];
      const nEvents = Math.round(densityP * (0.6 + rng() * 0.8) * 2) / 2;
      let cell = [];
      for (let bi = 0; bi < beatsInBar.length; bi++) {
        if (rng() < restP) continue;
        const beatPos = beatsInBar[bi];
        // syncopation: probability of offbeat placement & pickup across barline
        let onset = beatPos;
        if (rng() < params.syncopation * 0.7) onset = beatPos + 0.5;
        if (rng() < params.syncopation * 0.25 && bi === 0 && b > 0) onset = -0.5; // pickup crosses barline
        const t = b * 4 + onset;
        if (t < 0) continue;
        // pitch: chord-tone bias, scale walk, chromatic approach
        let midi;
        if (rng() < chromP) midi = prevMidi + (rng() < 0.5 ? -1 : 1); // chromatic approach
        else {
          deg += Math.round(gauss(rng) * 1.6);
          const octShift = Math.round(deg / 7) * 12;
          midi = center + octShift + SCALE[((deg % 7) + 7) % 7] + (rng() < 0.3 ? rootRel : 0);
        }
        midi = Math.round(clamp(midi, center - span / 2, center + span / 2));
        // register/treble activity pressure
        const trebleLine = 84;
        if (params.trebleActivity < 0.4 && midi > trebleLine) midi -= 12;
        if (params.trebleActivity > 0.6 && midi < trebleLine - 12 && rng() < 0.5) midi += 12;
        // dynamics: call/reply + contour noise; downbeat weighting
        let vel = 55 + params.dynRange * 35 * gauss(rng) * 0.5 + (isCall(b) ? params.dynContour * 14 : -params.dynContour * 14);
        if (bi === 0 && (beatPos === 0 || beatPos === 2)) vel += params.downbeatWeight * 12;
        if (onset % 1 !== 0) vel += params.syncopation * 6 - params.downbeatWeight * 4;
        vel = clamp(Math.round(vel), 30, 110);
        // swing displacement on off-8ths
        const tSwing = onset % 1 === 0.5 ? t + swing : t;
        const ev = { t: tSwing, dur: 0.9 + rng() * 0.4, midi, vel, voice: 'melody', bar: b };
        events.push(ev); cell.push(ev);
        prevMidi = midi;
      }
      if (repCell && cell.length >= 2) {
        if (cellMem.length && rng() < params.repetition * 0.6) {
          // repeat an old cell transposed to current chord root
          const old = cellMem[Math.floor(rng() * cellMem.length)];
          const shift = (root - tonic - 24);
          old.forEach(e => events.push({ ...e, midi: e.midi + shift, t: b * 4 + (e.t % 4), bar: b, vel: clamp(e.vel + Math.round(gauss(rng) * 4), 30, 110) }));
        } else cellMem.push(cell);
      }
    }
    // bass: root motion by bassMovement; approach tones when high
    let bassPrev = tonic;
    for (let b = 0; b < 16; b++) {
      const [chSym, rootRel] = prog[b];
      let note;
      if (rng() < params.bassMovement * 0.6) {
        note = rng() < 0.5 ? tonic + rootRel + 7 : tonic + rootRel + (rng() < 0.5 ? 9 : 10);
        if (rng() < 0.35) note = bassPrev + (rng() < 0.5 ? -1 : 1) * (rng() < 0.5 ? 1 : 2); // approach
      } else note = tonic + rootRel;
      const vel = clamp(Math.round(62 + gauss(rng) * 8 + (params.downbeatWeight - 0.5) * 10), 40, 96);
      events.push({ t: b * 4, dur: 3.4, midi: note, vel, voice: 'bass', bar: b });
      if (params.bassMovement > 0.55 && rng() < 0.6) { // walking-ish quarter motion
        for (let q = 1; q < 4; q++) events.push({ t: b * 4 + q, dur: 0.9, midi: clamp(note + [0, 2, 4, 7][Math.floor(rng() * 4)] * (rng() < .5 ? -1 : 1), tonic - 6, tonic + 24), vel: vel - 6, voice: 'bass', bar: b });
      }
      bassPrev = note;
    }
    // comping chord hits (audio only; the .song carries the changes row)
    for (let b = 0; b < 16; b++) {
      const hits = params.density > 0.6 ? [0, 2] : params.restRatio > 0.6 ? [rng() < 0.5 ? 0 : 2] : [0, 1.5, 2];
      hits.forEach(h => {
        const t = h === 1.5 ? b * 4 + 1.5 + swing : b * 4 + h;
        events.push({ t, dur: 1.6, midi: tonic + 24 + prog[b][1], vel: clamp(Math.round(48 + gauss(rng) * 7), 32, 80), voice: 'comp', bar: b });
      });
    }
    events.sort((a, b) => a.t - b.t);
    const song = renderSong(params, artistKey, prog, events);
    return { song, events, beats: BEATS };
  }

  /* ---------------------- events → plainsong (.song) ---------------------- */
  // Plainsong constraint honored: one vel per row (the medium's floor — the
  // golden residue's second owner). The audio trace keeps per-note dynamics;
  // the written contract is coarser. That gap is a FEATURE (see Summary Law).
  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  function m2n(m) { return NOTE_NAMES[m % 12] + (Math.floor(m / 12) - 1); }
  function renderSong(params, artistKey, prog, events) {
    const lines = [];
    const art = ARTISTS[artistKey];
    lines.push(`**TRACK: ${art.name.split(' ')[0]} TAKE — grown, not written**`);
    lines.push('[MetaData]');
    lines.push(`key: ${NOTE_NAMES[(art.tonic + 24) % 12]} | tempo: 96 | swing: ${Math.round(params.swingFeel * 100)}% | subdivision: 8th`);
    lines.push('time: 4/4 | mood: Open');
    lines.push('');
    const melByBar = {}, bassByBar = {};
    events.forEach(e => {
      if (e.voice === 'melody') (melByBar[e.bar] = melByBar[e.bar] || []).push(e);
      if (e.voice === 'bass') (bassByBar[e.bar] = bassByBar[e.bar] || []).push(e);
    });
    for (let s = 0; s < 2; s++) {
      lines.push(`[${s === 0 ? 'A1' : 'A2'}] (${s === 0 ? 'Statement' : 'Development'} - 8 Bars)`);
      const chords = prog.slice(s * 8, s * 8 + 8).map(c => c[0] || '...').join(' . . . | ');
      lines.push(`Chords: | ${chords} . . . |`);
      let mel = '', bas = '';
      for (let b = s * 8; b < s * 8 + 8; b++) {
        const tokens = ['.', '.', '.', '.'];
        (melByBar[b] || []).forEach(e => {
          const pos = Math.round(((e.t % 4) + 4) % 4 * 2);
          if (pos >= 0 && pos < 8) { } // handled below with finer grid
        });
        // finer: 8 slots per bar
        const slots = new Array(8).fill('.');
        (melByBar[b] || []).forEach(e => {
          const frac = ((e.t % 4) + 4) % 4;
          let idx = Math.min(7, Math.round(frac * 2));
          if (frac < 0) idx = 0;
          if (slots[idx] === '.') slots[idx] = m2n(e.midi);
          else { let j = idx + 1; while (j < 8 && slots[j] !== '.') j++; if (j < 8) slots[j] = m2n(e.midi); }
        });
        mel += ' ' + slots.join(' ') + ' |';
        const bslots = new Array(8).fill('.');
        (bassByBar[b] || []).forEach(e => {
          const frac = ((e.t % 4) + 4) % 4;
          const idx = Math.min(7, Math.round(frac * 2));
          if (bslots[idx] === '.') bslots[idx] = m2n(e.midi);
        });
        bas += ' ' + bslots.join(' ') + ' |';
      }
      const melVel = clamp(Math.round(56 + params.dynContour * 14), 30, 110);
      const basVel = clamp(Math.round(66 + params.downbeatWeight * 10), 40, 100);
      lines.push(`Melody:${mel} vel: ${melVel}`);
      lines.push(`@bass:${bas} vel: ${basVel}`);
      lines.push('');
    }
    return lines.join('\n');
  }

  /* -------------------- the eye: 16-feature trace measure ------------------ */
  function extractFeatures(events) {
    const mel = events.filter(e => e.voice === 'melody');
    const bas = events.filter(e => e.voice === 'bass');
    const f = new Array(16).fill(0.5);
    if (!mel.length) return f;
    const v = (id) => FIDX[id];
    // registerSpread: semitone span normalized to 2 octaves
    const mid = mel.map(e => e.midi);
    f[v('registerSpread')] = clamp((Math.max(...mid) - Math.min(...mid)) / 24, 0, 1);
    // trebleActivity: fraction of notes >= 84 (C6)
    f[v('trebleActivity')] = mel.filter(e => e.midi >= 84).length / mel.length;
    // dynRange: velocity std normalized
    const mean = mid.reduce((a, e) => a, 0);
    const vels = mel.map(e => e.vel);
    const vm = vels.reduce((a, b) => a + b, 0) / vels.length;
    const vstd = Math.sqrt(vels.reduce((a, b) => a + (b - vm) * (b - vm), 0) / vels.length);
    f[v('dynRange')] = clamp(vstd / 22, 0, 1);
    // dynContour: contrast between alternating phrase halves (odd/even bars)
    const odd = mel.filter(e => e.bar % 2 === 0).map(e => e.vel);
    const even = mel.filter(e => e.bar % 2 === 1).map(e => e.vel);
    const om = odd.reduce((a, b) => a + b, 0) / (odd.length || 1);
    const em = even.reduce((a, b) => a + b, 0) / (even.length || 1);
    f[v('dynContour')] = clamp(Math.abs(om - em) / 28, 0, 1);
    // swingFeel: mean deviation of half-beat gaps from the straight 0.5
    {
      let devSum = 0, devN = 0;
      for (let i = 1; i < mel.length; i++) {
        if (mel[i].bar !== mel[i - 1].bar) continue;
        const gap = mel[i].t - mel[i - 1].t;
        if (gap > 0.2 && gap < 0.9) { devSum += gap - 0.5; devN++; }
      }
      f[v('swingFeel')] = devN ? clamp(0.5 + (devSum / devN) / 0.33 * 0.5, 0, 1) : 0.3;
    }
    // syncopation: fraction of onsets on offbeats or pickups
    f[v('syncopation')] = clamp(mel.filter(e => { const fr = ((e.t % 1) + 1) % 1; return fr > 0.2 && fr < 0.8; }).length / mel.length * 1.8, 0, 1);
    // downbeatWeight: velocity bias on beats 1 & 3
    const db = mel.filter(e => { const fr = ((e.t % 4) + 4) % 4; return fr === 0 || fr === 2; });
    const ob = mel.filter(e => { const fr = ((e.t % 4) + 4) % 4; return fr === 1 || fr === 3; });
    const dm = db.reduce((a, e) => a + e.vel, 0) / (db.length || 1);
    const om2 = ob.reduce((a, e) => a + e.vel, 0) / (ob.length || 1);
    f[v('downbeatWeight')] = clamp(0.5 + (dm - om2) / 40, 0, 1);
    // harmonicComplex: from comp chord weights — recompute from progressions is
    // cheating; use chromatic density of melody as a co-signal
    f[v('harmonicComplex')] = 0.5; // filled by caller via prog weight (see measureTake)
    // chromaticism: semitone steps
    let chrom = 0; for (let i = 1; i < mel.length; i++) { const d = Math.abs(mel[i].midi - mel[i - 1].midi); if (d === 1 || d === 11 || d === 13) chrom++; }
    f[v('chromaticism')] = clamp(chrom / mel.length * 2.2, 0, 1);
    // repetition: contour 3-gram self-similarity
    const contour = []; for (let i = 1; i < mel.length; i++) contour.push(mel[i].midi > mel[i - 1].midi ? 1 : mel[i].midi < mel[i - 1].midi ? -1 : 0);
    let rep = 0, pairs = 0;
    for (let i = 0; i + 6 < contour.length; i++) for (let j = i + 3; j + 3 < contour.length; j += 3) {
      pairs++; if (contour[i] === contour[j] && contour[i + 1] === contour[j + 1] && contour[i + 2] === contour[j + 2]) rep++;
    }
    f[v('repetition')] = pairs ? clamp(rep / pairs * 2.4, 0, 1) : 0;
    // callReply: register/vel correlation between phrase pairs
    f[v('callReply')] = f[v('dynContour')] * 0.5 + clamp(Math.abs(om - em) / 24, 0, 0.5);
    // density
    f[v('density')] = clamp(mel.length / 56, 0, 1);
    // phraseVariance: entropy of inter-onset gaps per bar
    const gaps = [];
    for (let b = 0; b < 16; b++) { const evs = mel.filter(e => e.bar === b); if (evs.length > 1) for (let i = 1; i < evs.length; i++) gaps.push(evs[i].t - evs[i - 1].t); }
    const uniq = new Set(gaps.map(g => Math.round(g * 2) / 2)).size;
    f[v('phraseVariance')] = clamp(uniq / 7, 0, 1);
    // restRatio: unsounded melody time over the 64-beat take
    const sounded = mel.reduce((a, e) => a + Math.min(e.dur, 1.5), 0);
    f[v('restRatio')] = clamp((1 - sounded / 52) * 1.15, 0, 1);
    // bassMovement
    const bm = bas.map(e => e.midi);
    let moves = 0; for (let i = 1; i < bm.length; i++) if (Math.abs(bm[i] - bm[i - 1]) > 3) moves++;
    f[v('bassMovement')] = bas.length ? clamp(moves / bas.length * 1.5, 0, 1) : 0;
    // cadenceRegular: phrase ends on 1 or 5 of chord (approx: ends bar 3,7,11,15 with low tension)
    const cadenceBars = [3, 7, 11, 15]; let land = 0;
    cadenceBars.forEach(b => { const evs = mel.filter(e => e.bar === b); if (!evs.length) return; const last = evs[evs.length - 1]; if (last.vel < vm + 4) land++; });
    f[v('cadenceRegular')] = land / 4;
    return f;
  }
  // harmonic complexity is honestly read from the progression used
  function harmonicFromProg(artistKey) {
    const w = PROGRESSIONS[artistKey].reduce((a, c) => a + (c[1] === null ? 0 : c[2]), 0) / 16;
    return clamp(w / 3.2, 0, 1);
  }
  function measureTake(events, artistKey) {
    const f = extractFeatures(events);
    f[FIDX.harmonicComplex] = harmonicFromProg(artistKey);
    return f;
  }

  /* -------------------- the argument: critic ↔ reviser -------------------- */
  function weightedDev(features, centroid, personaKey) {
    const w = PERSONAS[personaKey].weights;
    const devs = FEATURES.map((feat, i) => {
      const weight = w[feat.id] || 1.0;
      return { id: feat.id, i, label: feat.label, dev: features[i] - centroid[feat.id], abs: Math.abs(features[i] - centroid[feat.id]), weight };
    });
    const sigma = Math.sqrt(devs.reduce((a, d) => a + d.abs * d.abs * d.weight, 0) / devs.reduce((a, d) => a + d.weight, 0));
    return { devs, sigma };
  }

  function critiqueRound(features, centroid, personaKey, round) {
    const { devs, sigma } = weightedDev(features, centroid, personaKey);
    // golden-section shrinkage of critique-novelty: 3,2,1,1... with oscillation
    const baseK = Math.max(1, Math.round(3 * Math.pow(1 / PHI, round)));
    const K = Math.min(4, baseK + (round % 2 === 1 && round > 1 ? 0 : 0));
    const ranked = [...devs].sort((a, b) => b.abs * b.weight - a.abs * a.weight).slice(0, K);
    const critiques = ranked.map(d => {
      const hint = AXES_HINTS[d.id];
      const line = d.dev > 0 ? hint[1] : hint[0];
      const exact = d.abs < 0.035 ? ' (marginal — nearly settled)' : '';
      return { axis: d.id, label: d.label, dev: d.dev, line: line + exact };
    });
    return { critiques, sigma, K };
  }

  function reviseParams(params, critiques, measured, centroid, rng, round, nudge) {
    const next = { ...params };
    const stepBase = 0.30 * Math.pow(1 / PHI, round); // golden-step shrinkage
    critiques.forEach(c => {
      // close the loop on the MEASURED trace, not the latent knob — the eye
      // judges what it hears; the hands answer in parameter space.
      const err = centroid[c.axis] - measured[FIDX[c.axis]];
      const step = clamp(Math.abs(err) * 0.7 + stepBase * 0.25, 0.02, 0.5);
      next[c.axis] = clamp(params[c.axis] + Math.sign(err) * step, 0, 1);
    });
    // un-attacked axes drift home slightly (hands remember)
    FEATURES.forEach(f => {
      if (!critiques.find(c => c.axis === f.id) && !nudge) {
        next[f.id] = clamp(lerp(params[f.id], centroid[f.id], 0.14 + rng() * 0.08), 0, 1);
      }
    });
    if (nudge) { // the operator's ask: free-text becomes feature deltas
      Object.entries(nudge).forEach(([k, dv]) => { if (FIDX[k] !== undefined) next[k] = clamp(next[k] + dv, 0, 1); });
    }
    return next;
  }

  /* ------------------------- the medium's floor --------------------------- */
  // What the notation can never express, no matter the hands. The residue's
  // second owner. (Plainsong: one vel per row; bar grid floors.)
  function mediumFloor(features) {
    const caps = { dynContour: 0.94, syncopation: 0.95, dynRange: 0.97 };
    return Object.entries(caps).filter(([k, cap]) => features[FIDX[k]] > cap).map(([k]) => k);
  }

  // The honest floor made quantitative: what the hands can actually PRODUCE
  // at the canon centroid. The gap between ideal and effective is the medium
  // itself — residue by construction, not failure.
  const _effCache = {};
  function effectiveCentroid(artistKey) {
    if (_effCache[artistKey]) return _effCache[artistKey];
    const c = ARTISTS[artistKey].centroid;
    const rng = rngFromSeed('calibrate/' + artistKey);
    let acc = null; const N = 4;
    for (let k = 0; k < N; k++) {
      const t = generateTake(c, artistKey, rng);
      const f = measureTake(t.events, artistKey);
      acc = acc ? acc.map((x, i) => x + f[i]) : f;
    }
    _effCache[artistKey] = acc.map(x => +(x / N).toFixed(4));
    return _effCache[artistKey];
  }
  // residue: axes where the medium can never reach the canon
  function mediumResidue(artistKey) {
    const ideal = ARTISTS[artistKey].centroid, eff = effectiveCentroid(artistKey);
    return FEATURES.map((f, i) => ({ id: f.id, label: f.label, gap: Math.abs(eff[i] - ideal[f.id]) }))
      .filter(d => d.gap > 0.12).sort((a, b) => b.gap - a.gap);
  }

  /* ------------------------------- the run -------------------------------- */
  function runArgument(opts) {
    const {
      seed = 'duke-lab/' + Date.now().toString(36),
      artist = 'duke',
      persona = 'purist',
      maxRounds = 7,
      convergence = 0.055,
      jitter = 0.34,
      nudges = {},          // {round: {feature: delta}}
      personaSwaps = {},    // {round: personaKey}
    } = opts || {};
    const rng = rngFromSeed(seed);
    const ideal = ARTISTS[artist].centroid;
    const centroidArr = effectiveCentroid(artist); // the judgeable canon
    const centroid = {}; FEATURES.forEach((f, i) => (centroid[f.id] = centroidArr[i]));
    let params = paramsFromCentroid(centroid, rng, jitter); // start wide, home imperfectly
    let rounds = [];
    let log = [];
    let verdict = null;
    let curPersona = persona;
    let emaSigma = null; // the referee's memory of the argument — EMA, not a fresh ear
    const SIGMA_ALPHA = 0.35;
    for (let r = 0; r <= maxRounds; r++) {
      if (personaSwaps[r]) {
        curPersona = personaSwaps[r];
        log.push({ round: r, kind: 'swap', text: `The gardener changes. ${PERSONAS[curPersona].name} takes the chair — the objective is re-weighted; settled ground re-opens.` });
      }
      const take = generateTake(params, artist, rng);
      // the referee listens three times before judging (variance reduction —
      // an honest stochastic optimizer, not a vibe). The round's artifact is
      // the first take; the verdict is on the averaged 16-feature trace.
      let acc = null;
      const LISTENS = 5;
      for (let k = 0; k < LISTENS; k++) {
        const tk = k === 0 ? take : generateTake(params, artist, rng);
        const fk = measureTake(tk.events, artist);
        acc = acc ? acc.map((x, i) => x + fk[i]) : fk;
      }
      const features = acc.map(x => x / LISTENS);
      const { critiques, sigma } = critiqueRound(features, centroid, curPersona, r);
      const floor = mediumFloor(features);
      log.push({ round: r, kind: 'verdict', sigma: +sigma.toFixed(4), text: verdictLine(r, sigma, critiques, curPersona, floor, convergence) });
      rounds.push({ round: r, params: { ...params }, song: take.song, events: take.events, features, critiques, sigma: +sigma.toFixed(4), persona: curPersona });
      emaSigma = emaSigma === null ? sigma : emaSigma * (1 - SIGMA_ALPHA) + sigma * SIGMA_ALPHA;
      if (emaSigma < convergence && r >= 1) { verdict = { status: 'CONVERGED', round: r, sigma: emaSigma, ema: true }; break; }
      if (r === maxRounds) { verdict = { status: 'HONEST GAP', round: r, sigma, residue: mediumResidue(artist).map(d => d.id) }; break; }
      const nudge = nudges[r] || null;
      params = reviseParams(params, critiques, features, centroid, rng, r, nudge);
      if (nudge) log.push({ round: r + 1, kind: 'nudge', text: `The operator leans in: ${JSON.stringify(nudge)}. The hands adjust.` });
    }
    return { seed, artist, persona: curPersona, rounds, log, verdict, ideal, effective: centroid };
  }
  function verdictLine(r, sigma, critiques, persona, floor, conv) {
    const who = PERSONAS[persona].name;
    if (sigma < conv) return `${who}: I can no longer tell if this is a take I have never heard.`;
    const cx = critiques.map(c => c.line).join(' / ');
    const fl = floor.length ? ` MEDIUM FLOOR: ${floor.join(', ')} structurally capped.` : '';
    return `R${r} σ=${sigma.toFixed(3)} — ${cx}${fl}`;
  }

  /* ------------------------------- the duet ------------------------------- */
  // Two matured musicians trade phrases. The responder quotes the previous
  // phrase's ending contour three times out of four — that is the banter.
  function runDuet(opts) {
    opts = opts || {};
    const seed = opts.seed || 'duet/blue';
    const rng = rngFromSeed('duet:' + seed);
    const who = [opts.a || 'duke', opts.b || 'monk'].map(k =>
      typeof k === 'string'
        ? { name: (ARTISTS[k] || ARTISTS.duke).name, artistKey: ARTISTS[k] ? k : 'duke', params: null }
        : { name: k.name || 'the stranger', artistKey: k.artistKey || 'duke', params: k.params });
    const phrasesN = Math.max(2, opts.phrases || 4);
    const beatsPer = opts.beatsPerPhrase || 8;
    const events = [], phrases = [], log = [];
    let t = 0, prevEnd = null, quotes = 0;
    for (let p = 0; p < phrasesN; p++) {
      const me = who[p % 2], other = who[(p + 1) % 2];
      const params = { ...(me.params || paramsFromCentroid(ARTISTS[me.artistKey].centroid, rng, 0.12)) };
      params.callReply = clamp((params.callReply || 0.3) + 0.15, 0, 1);
      const tk = generateTake(params, me.artistKey, rng);
      const win = tk.events.filter(e => e.t < beatsPer); // the take's opening phrase is the statement
      let quoted = false;
      if (prevEnd && prevEnd.length >= 2) {
        const mel = win.filter(e => e.voice === 'melody').sort((x, y) => x.t - y.t);
        if (mel.length >= 3 && rng() < 0.75) {
          const steps = [];
          for (let i = 1; i < prevEnd.length; i++) steps.push(prevEnd[i] - prevEnd[i - 1]);
          let cur = prevEnd[prevEnd.length - 1];
          mel.slice(0, steps.length + 1).forEach((e, i) => {
            if (i > 0 && i - 1 < steps.length) { cur += steps[i - 1]; e.midi = cur; }
          });
          mel.forEach(e => { e.midi = clamp(e.midi, 55, 86); }); // keep the quote in horn range
          quoted = true; quotes++;
          log.push(`${me.name} answers ${other.name} with their own cadence (phrase ${p + 1})`);
        }
      }
      const off = t, suffix = p % 2 ? '2' : '';
      win.forEach(e => events.push({ t: e.t + off, midi: e.midi, dur: e.dur, vel: e.vel, voice: e.voice === 'comp' ? 'comp' : e.voice + suffix }));
      phrases.push({ who: me.name, t: off, beats: beatsPer, quoted });
      const mel = win.filter(e => e.voice === 'melody').sort((x, y) => x.t - y.t);
      prevEnd = mel.slice(-3).map(e => e.midi);
      t += beatsPer;
    }
    events.sort((x, y) => x.t - y.t || x.midi - y.midi);
    const song = [
      `**TRACK: ${who[0].name} × ${who[1].name} — a conversation, grown not written**`,
      '[MetaData]',
      `tempo: 96 | phrases: ${phrasesN} × ${beatsPer} beats | banter: ${quotes} quote${quotes === 1 ? '' : 's'}`,
      '',
      ...log,
      '',
      '(the grid is the notation — two voices, one band)',
    ].join('\n');
    return { seed, a: who[0].name, b: who[1].name, events, song, phrases, quotes, banter: +(quotes / (phrasesN - 1)).toFixed(3), beats: t, log };
  }

  /* --------------------------- midi export (SMF) -------------------------- */
  // Type-1 is overkill; a single-track SMF with note events, tempo 96bpm.
  function toMidi(events, tempoBpm) {
    const tpq = 96, tempo = Math.round(60000000 / (tempoBpm || 96));
    const vlq = (n) => { const b = [n & 0x7f]; while (n >>= 7) b.unshift((n & 0x7f) | 0x80); return b; };
    const evs = [];
    events.forEach(e => {
      const on = Math.round(e.t * tpq), off = Math.round((e.t + e.dur) * tpq);
      evs.push([on, 0x90, e.midi, e.vel], [off, 0x80, e.midi, 64]);
    });
    evs.sort((a, b) => a[0] - b[0]);
    const track = [0x00, 0xff, 0x51, 0x03, (tempo >> 16) & 255, (tempo >> 8) & 255, tempo & 255, 0x00, 0xff, 0x58, 0x04, 4, 2, 24, 8];
    let last = 0;
    evs.forEach(e => { track.push(...vlq(e[0] - last), e[1], e[2], e[3]); last = e[0]; });
    track.push(0x00, 0xff, 0x2f, 0x00);
    const len = track.length;
    const head = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 0, tpq, 0x4d, 0x54, 0x72, 0x6b, (len >> 24) & 255, (len >> 16) & 255, (len >> 8) & 255, len & 255];
    return new Uint8Array([...head, ...track]);
  }

  /* ------------------------------ free text → nudge ------------------------ */
  // Local, honest, dumb. The worker upgrades this to an LLM; the fallback
  // must never be a stub — it is the whole point of the seed badge.
  const NUDGE_LEXICON = [
    [/mood|dark|brood|shadow|sad/i, { restRatio: +0.12, dynRange: +0.08, chromaticism: +0.06 }],
    [/bright|light|lift|up|hope/i, { registerSpread: +0.10, trebleActivity: +0.08, dynRange: -0.04 }],
    [/space|sparse|air|room|less/i, { restRatio: +0.15, density: -0.12 }],
    [/busy|dense|fill|more notes/i, { density: +0.15, restRatio: -0.08 }],
    [/swing|groove|lay back|pocket/i, { swingFeel: +0.14, syncopation: +0.06 }],
    [/straight|square|rigid/i, { swingFeel: -0.14, downbeatWeight: +0.10 }],
    [/angular|jagged|weird|odd/i, { syncopation: +0.10, phraseVariance: +0.10, downbeatWeight: -0.08 }],
    [/simple|plain|less/i, { harmonicComplex: -0.12, chromaticism: -0.06, repetition: +0.08 }],
    [/rich|complex|color|harmon/i, { harmonicComplex: +0.14, chromaticism: +0.06 }],
    [/repeat|cell|motif|hook/i, { repetition: +0.15 }],
    [/high|top|upper/i, { registerSpread: +0.10, trebleActivity: +0.12 }],
    [/low|bottom|bass/i, { registerSpread: -0.06, bassMovement: +0.10 }],
    [/soft|quiet|gentle|hush/i, { dynRange: -0.10, dynContour: -0.06, restRatio: +0.06 }],
    [/loud|aggress|attack|drive/i, { dynRange: +0.12, dynContour: +0.10, downbeatWeight: +0.06 }],
  ];
  function parseAsk(text) {
    const delta = {};
    let hits = 0;
    NUDGE_LEXICON.forEach(([re, d]) => {
      if (re.test(text)) { hits++; Object.entries(d).forEach(([k, v]) => (delta[k] = (delta[k] || 0) + v)); }
    });
    Object.keys(delta).forEach(k => (delta[k] = clamp(delta[k], -0.3, 0.3)));
    return { delta, matched: hits };
  }

  return {
    fnv1a, rngFromSeed, gauss, clamp, lerp,
    FEATURES, FIDX, PHI, ARTISTS, PERSONAS, PROGRESSIONS, AXES_HINTS,
    defaultParams, paramsFromCentroid, generateTake, measureTake, extractFeatures,
    critiqueRound, reviseParams, mediumFloor, mediumResidue, effectiveCentroid, runArgument, toMidi, parseAsk,
    registerArtist, registerPersona, runDuet,
  };
});
