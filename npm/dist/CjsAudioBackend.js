// CarbonEngineJS original (no Carbon counterpart). WebAudio realization of the
// AudGameObjResource.backend seam - see .agents/AUDIO-PORT-KB.md for the seam
// contract this implements. Signal chain per the 2026-07-05 direction:
// source -> source gain -> emitter gain -> PannerNode(HRTF, inverse distance)
// -> master gain -> destination. Each playing source owns the source gain so
// stop-fades and replays cannot bleed across concurrent events on one emitter.
//
// Injectables keep this node-testable and decode-agnostic:
// - context: an AudioContext (or compatible fake); never created here.
// - loadBuffer(eventID, eventName) -> Promise<AudioBuffer> - the app wires
//   runtime-resource's wem->ogg->decode chain (catalog route) behind this.
// - isLoop(eventName) - loop flag source (usually the static data repository).

const DEFAULT_FADE_SECONDS = 1;

/** WebAudio backend for the audio graph: emitter nodes, playing sources, listener pose. */
class CjsAudioBackend {
  #context = null;
  #loadBuffer = null;
  #isLoop = null;
  #masterGain = null;
  #sfxGain = null;
  #emitterNodes = new Map();
  #playing = new Map();
  #globalRtpcValues = new Map();
  #nextPlayingID = 1;

  // Wwise-scale world units -> WebAudio panner units. EVE positions run to
  // thousands of meters; the inverse distance model with refDistance 1 makes
  // that inaudible. Scale is the app's acoustic choice.
  #distanceScale = 1;

  // Optional interactive-music engine (CjsMusicEngine); owns events found
  // in its graph and plays through its own gain into the master gain.
  #musicEngine = null;
  constructor({
    context,
    loadBuffer,
    isLoop,
    distanceScale,
    musicEngine
  } = {}) {
    this.#context = context ?? null;
    this.#loadBuffer = loadBuffer ?? null;
    this.#isLoop = isLoop ?? (() => false);
    this.#distanceScale = Number(distanceScale) || 1;
    if (this.#context) {
      this.#masterGain = this.#context.createGain();
      // Safety limiter: many concurrent one-shots (weapon volleys) sum
      // well past 0 dBFS and hard-clip audibly without it. Wwise
      // projects carry a master-bus limiter for the same reason.
      const limiter = this.#context.createDynamicsCompressor?.() ?? null;
      if (limiter) {
        limiter.threshold.value = -6;
        limiter.knee.value = 6;
        limiter.ratio.value = 12;
        limiter.attack.value = 0.003;
        limiter.release.value = 0.25;
        this.#masterGain.connect(limiter);
        limiter.connect(this.#context.destination);
      } else {
        this.#masterGain.connect(this.#context.destination);
      }
      // SFX bus: every emitter chain routes through it so effect volume
      // is controllable independently of music (which feeds the master
      // gain directly through the music engine's own output gain).
      this.#sfxGain = this.#context.createGain();
      this.#sfxGain.connect(this.#masterGain);
    }
    this.#musicEngine = musicEngine ?? null;
  }

  /** The mix bus new output chains should connect into (music engine, meters). */
  get masterGain() {
    return this.#masterGain;
  }
  get sfxGain() {
    return this.#sfxGain;
  }

  /** Effect-bus volume (0..1); music is unaffected. */
  SetSfxVolume(value) {
    SetAudioParam(this.#sfxGain?.gain, Math.max(0, Math.min(1, Number(value) || 0)), this.#context);
  }
  get musicEngine() {
    return this.#musicEngine;
  }

  /** Late attachment: the engine needs the master gain, which needs the context. */
  set musicEngine(engine) {
    this.#musicEngine = engine ?? null;
  }

  /** Engine init (Carbon's InitLowLevel/InitSound collapse into context supply). */
  Init() {
    return !!this.#context;
  }

  /** Registers an emitter's node chain (gain -> panner -> [analyser] -> master). */
  RegisterGameObj(gameObjID) {
    if (!this.#context || this.#emitterNodes.has(gameObjID)) {
      return;
    }
    const panner = this.#context.createPanner();
    panner.panningModel = "HRTF";
    panner.distanceModel = "inverse";
    const gain = this.#context.createGain();
    gain.connect(panner);
    // Optional per-emitter level tap (post-panner, so it reflects what is
    // actually heard incl. distance attenuation). Absent on minimal fake
    // contexts - metering then reports 0.
    const analyser = this.#context.createAnalyser?.() ?? null;
    if (analyser) {
      analyser.fftSize = 256;
      panner.connect(analyser);
      analyser.connect(this.#sfxGain);
    } else {
      panner.connect(this.#sfxGain);
    }
    this.#emitterNodes.set(gameObjID, {
      gain,
      panner,
      analyser,
      scalingFactor: 1
    });
  }

  /** Tears down an emitter's node chain and halts its playing sources, loaded or pending. */
  UnregisterGameObj(gameObjID) {
    const nodes = this.#emitterNodes.get(gameObjID);
    if (nodes) {
      for (const [playingID, record] of [...this.#playing]) {
        if (record.gameObjID === gameObjID) {
          record.stopped = true;
          if (record.music) {
            this.#musicEngine?.ExecuteAction("stop", playingID, 0);
          }
          record.source?.stop?.(this.#context.currentTime);
          this.#FinishPlaying(playingID);
        }
      }
      nodes.gain.disconnect?.();
      nodes.panner.disconnect?.();
      nodes.analyser?.disconnect?.();
      this.#emitterNodes.delete(gameObjID);
    }
  }

  /** Starts an event: allocates the playing id synchronously, starts when the media resolves. */
  PostEvent(eventID, gameObjID, additionalFlags, emitter, eventName) {
    // Music-graph events route to the interactive-music engine.
    if (this.#musicEngine?.HandlesEvent(eventName)) {
      const playingID = this.#nextPlayingID++;
      const record = {
        gameObjID,
        emitter,
        eventName,
        source: null,
        sourceGain: null,
        stopped: false,
        music: true
      };
      this.#playing.set(playingID, record);
      this.#musicEngine.PostEvent(eventName, playingID, () => this.#FinishPlaying(playingID));
      return playingID;
    }
    const nodes = this.#emitterNodes.get(gameObjID);
    if (!this.#context || !this.#loadBuffer || !nodes) {
      return 0;
    }
    const playingID = this.#nextPlayingID++;
    const sourceGain = this.#context.createGain();
    sourceGain.connect(nodes.gain);
    const record = {
      gameObjID,
      emitter,
      eventName,
      source: null,
      sourceGain,
      stopped: false
    };
    this.#playing.set(playingID, record);
    Promise.resolve(this.#loadBuffer(eventID, eventName)).then(buffer => {
      if (!buffer || record.stopped || !this.#playing.has(playingID)) {
        this.#FinishPlaying(playingID);
        return;
      }
      const source = this.#context.createBufferSource();
      source.buffer = buffer;
      source.loop = !!this.#isLoop(eventName);
      source.connect(record.sourceGain);
      source.onended = () => this.#FinishPlaying(playingID);
      record.source = source;
      source.start();
    }).catch(() => this.#FinishPlaying(playingID));
    return playingID;
  }

  /** Stop ("stop") fades then halts; break ("break") lets non-loops finish, halts loops at the fade. */
  ExecuteActionOnPlayingID(action, playingID, fadeOutDuration = 1000) {
    const record = this.#playing.get(playingID);
    if (!record) {
      return;
    }
    if (record.music) {
      this.#musicEngine?.ExecuteAction(action, playingID, fadeOutDuration);
      return;
    }
    if (action === "break") {
      // Pending sources have no BufferSource yet; the loop flag comes
      // from the injected delegate so a broken pending one-shot still
      // plays out once its media resolves, like a loaded one.
      const loops = record.source ? !!record.source.loop : !!this.#isLoop(record.eventName);
      if (!loops) {
        return;
      }
    }
    record.stopped = true;
    if (record.source) {
      // An explicit 0 means an immediate stop; only a missing/invalid
      // duration falls back to the default fade.
      const ms = Number(fadeOutDuration);
      const seconds = Number.isFinite(ms) ? Math.max(0, ms) / 1000 : DEFAULT_FADE_SECONDS;
      if (seconds > 0) {
        record.sourceGain.gain?.linearRampToValueAtTime?.(0, this.#context.currentTime + seconds);
      } else {
        SetAudioParam(record.sourceGain.gain, 0, this.#context);
      }
      record.source.stop(this.#context.currentTime + seconds);
    } else {
      this.#FinishPlaying(playingID);
    }
  }

  /** Emitter position -> panner. WebAudio is right-handed like Carbon's scene; Wwise's RH->LH flip does not apply. */
  SetPosition(gameObjID, front, top, position) {
    const panner = this.#emitterNodes.get(gameObjID)?.panner;
    if (panner) {
      SetAudioParam(panner.positionX, position[0] * this.#distanceScale, this.#context);
      SetAudioParam(panner.positionY, position[1] * this.#distanceScale, this.#context);
      SetAudioParam(panner.positionZ, position[2] * this.#distanceScale, this.#context);
    }
  }

  /** Listener pose -> context.listener. */
  SetListenerPosition(gameObjID, front, top, position) {
    const listener = this.#context?.listener;
    if (listener) {
      SetAudioParam(listener.positionX, position[0] * this.#distanceScale, this.#context);
      SetAudioParam(listener.positionY, position[1] * this.#distanceScale, this.#context);
      SetAudioParam(listener.positionZ, position[2] * this.#distanceScale, this.#context);
      SetAudioParam(listener.forwardX, front[0], this.#context);
      SetAudioParam(listener.forwardY, front[1], this.#context);
      SetAudioParam(listener.forwardZ, front[2], this.#context);
      SetAudioParam(listener.upX, top[0], this.#context);
      SetAudioParam(listener.upY, top[1], this.#context);
      SetAudioParam(listener.upZ, top[2], this.#context);
    }
  }

  /** Attenuation scaling -> panner distance scaling. */
  SetScalingFactor(gameObjID, value) {
    const nodes = this.#emitterNodes.get(gameObjID);
    if (nodes) {
      nodes.scalingFactor = value;
      if (nodes.panner.refDistance !== undefined) {
        nodes.panner.refDistance = Math.max(1e-4, value);
      }
    }
  }

  /** Per-object RTPC - stored; audible mappings (e.g. rtpc->gain) are future work. */
  SetRTPCValue(rtpcName, value, gameObjID) {}

  /** Per-object switch - stored by the emitter; feeds the music engine's tree arguments. */
  SetSwitch(switchGroup, switchState, gameObjID) {
    this.#musicEngine?.SetSwitch(switchGroup, switchState);
  }

  /**
   * Global RTPC store (feeds GetGlobalRTPCValue / monitored parameters).
   * Carbon's volume control groups are RTPCs (menu_main_master_level,
   * menu_main_music_level, ... - all 0..1 user settings); the known volume
   * levels are applied audibly to the matching bus. Category levels
   * (menu_advanced_*) are stored but not yet mapped.
   */
  SetGlobalRTPCValue(rtpcName, value) {
    const name = String(rtpcName);
    const numeric = Number(value);
    this.#globalRtpcValues.set(name, numeric);
    if (name === "menu_main_master_level") {
      SetAudioParam(this.#masterGain?.gain, Math.max(0, Math.min(1, numeric || 0)), this.#context);
    } else if (name === "menu_main_music_level") {
      this.#musicEngine?.SetMusicVolume(numeric);
    }
  }

  /** Global state group - feeds the music engine's tree arguments. */
  SetGlobalState(stateGroup, stateName) {
    this.#musicEngine?.SetState(stateGroup, stateName);
  }

  /** Monitored-parameter query source. */
  GetGlobalRTPCValue(rtpcName) {
    return this.#globalRtpcValues.get(String(rtpcName));
  }

  /** Banks are virtual on the catalog route: media resolves per event, so loads complete immediately. */
  LoadBank(name, callback) {
    callback?.(true);
  }

  /** Virtual unload. */
  UnloadBank(name, callback) {
    callback?.();
  }

  /** Virtual clear. */
  ClearBanks() {}

  /** WebAudio renders continuously; the tick drives music-engine lookahead scheduling. */
  RenderAudio() {
    this.#musicEngine?.Process();
  }

  /** Active playing ids (introspection/tests). */
  GetPlayingCount() {
    return this.#playing.size;
  }

  /**
   * Current output level (RMS, 0..~0.7) of one emitter's post-panner signal.
   * 0 when the context has no analyser support or the emitter is unknown.
   */
  GetGameObjLevel(gameObjID) {
    const analyser = this.#emitterNodes.get(gameObjID)?.analyser;
    if (!analyser?.getFloatTimeDomainData) {
      return 0;
    }
    const samples = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(samples);
    let sum = 0;
    for (let i = 0; i < samples.length; i++) {
      sum += samples[i] * samples[i];
    }
    return Math.sqrt(sum / samples.length);
  }
  #FinishPlaying(playingID) {
    const record = this.#playing.get(playingID);
    if (record) {
      this.#playing.delete(playingID);
      record.sourceGain?.disconnect?.();
      record.emitter?.EventFinishedCallback?.(playingID);
    }
  }
}
function SetAudioParam(param, value, context) {
  if (param && typeof param === "object" && "value" in param) {
    param.value = value;
  }
}

export { CjsAudioBackend };
//# sourceMappingURL=CjsAudioBackend.js.map
