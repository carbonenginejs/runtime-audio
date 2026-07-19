import { AudGameObjResource as _AudGameObjResource } from './trinity/audio/AudGameObjResource.js';
import { AudManager as _AudManager } from './trinity/audio/AudManager.js';
import { AudStaticDataRepository as _AudStaticDataReposit } from './trinity/audio/AudStaticDataRepository.js';
import { CjsAudioBackend } from './CjsAudioBackend.js';
import { CjsMusicEngine } from './CjsMusicEngine.js';

// CarbonEngineJS original (no Carbon counterpart). The audio system
// composition root: owns the AudManager + AudStaticDataRepository + WebAudio
// backend and wires them into the AudGameObjResource realization seams.
// Implements the ICjsAudioSystem contract shape (runtime-core service slot).
//
// Headless-first: constructing the system does NOT require an AudioContext -
// pass one (or a factory) only when sound should actually be realized. Without
// it, the graph runs in Carbon's null-manager/headless mode untouched.

/** Audio system composition root: repository + manager + backend, attached to the graph seams. */
class CjsAudioSystem {
  manager = new _AudManager();
  repository = new _AudStaticDataReposit();
  backend = null;
  musicEngine = null;
  #attached = false;
  #loadBuffer = null;
  #createContext = null;
  #distanceScale = 1;
  #musicGraph = null;
  #loadMedia = null;
  constructor({
    createContext,
    loadBuffer,
    audioMetadata,
    distanceScale,
    musicGraph,
    loadMedia
  } = {}) {
    this.#createContext = createContext ?? null;
    this.#loadBuffer = loadBuffer ?? null;
    this.#distanceScale = Number(distanceScale) || 1;
    this.#musicGraph = musicGraph ?? null;
    this.#loadMedia = loadMedia ?? null;
    if (audioMetadata) {
      this.repository.Initialize(audioMetadata);
    }
  }

  /** Wires the three AudGameObjResource seams to this system. One system at a time. */
  Attach() {
    _AudGameObjResource.manager = this.manager;
    _AudGameObjResource.staticDataRepository = this.repository;
    _AudGameObjResource.backend = this.backend;
    this.#attached = true;
    return this;
  }

  /** Clears the seams (back to headless). */
  Detach() {
    if (this.#attached) {
      _AudGameObjResource.manager = null;
      _AudGameObjResource.staticDataRepository = null;
      _AudGameObjResource.backend = null;
      this.#attached = false;
    }
  }

  /**
   * Creates the WebAudio backend (browser-gesture time) and enables the engine.
   * Returns whether the engine actually enabled. Without a context the manager
   * stays a true null manager (Carbon Init-failure semantics): banks are never
   * tracked, posts return 0 and queue emitter-side for replay on a later
   * successful Enable's wake pass.
   */
  Enable(soundBanksToLoad = []) {
    if (!this.backend && this.#createContext) {
      const context = this.#createContext();
      if (context) {
        this.backend = new CjsAudioBackend({
          context,
          loadBuffer: this.#loadBuffer,
          isLoop: eventName => this.repository.EventIsLoop(eventName),
          distanceScale: this.#distanceScale
        });
        if (this.#musicGraph && !this.musicEngine) {
          this.musicEngine = new CjsMusicEngine({
            graph: this.#musicGraph,
            context,
            loadMedia: this.#loadMedia,
            destination: this.backend.masterGain ?? context.destination
          });
        }
        this.backend.musicEngine = this.musicEngine;
      }
    }
    if (this.#attached) {
      _AudGameObjResource.backend = this.backend;
    }
    this.manager.Enable(soundBanksToLoad);
    return this.manager.enabled;
  }

  /** Culls, clears banks, drops the engine to disabled. */
  Disable() {
    this.manager.Disable();
  }

  /** Per-frame drive: culling + render + log flush. */
  Process(now) {
    this.manager.Process(now);
  }
}

export { CjsAudioSystem };
//# sourceMappingURL=CjsAudioSystem.js.map
