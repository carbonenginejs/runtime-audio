// CarbonEngineJS original (no Carbon counterpart). The audio system
// composition root: owns the AudManager + AudStaticDataRepository + WebAudio
// backend and wires them into the AudGameObjResource realization seams.
// Implements the ICjsAudioSystem contract shape (runtime-core service slot).
//
// Headless-first: constructing the system does NOT require an AudioContext -
// pass one (or a factory) only when sound should actually be realized. Without
// it, the graph runs in Carbon's null-manager/headless mode untouched.
import { AudGameObjResource } from "./trinity/audio/AudGameObjResource.js";
import { AudManager } from "./trinity/audio/AudManager.js";
import { AudStaticDataRepository } from "./trinity/audio/AudStaticDataRepository.js";
import { CjsAudioBackend } from "./CjsAudioBackend.js";
import { CjsMusicEngine } from "./CjsMusicEngine.js";

/** Audio system composition root: repository + manager + backend, attached to the graph seams. */
export class CjsAudioSystem
{
    manager = new AudManager();

    repository = new AudStaticDataRepository();

    backend = null;

    musicEngine = null;

    #attached = false;

    #loadBuffer = null;

    #createContext = null;

    #distanceScale = 1;

    #musicGraph = null;

    #loadMedia = null;

    constructor({ createContext, loadBuffer, audioMetadata, distanceScale, musicGraph, loadMedia } = {})
    {
        this.#createContext = createContext ?? null;
        this.#loadBuffer = loadBuffer ?? null;
        this.#distanceScale = Number(distanceScale) || 1;
        this.#musicGraph = musicGraph ?? null;
        this.#loadMedia = loadMedia ?? null;
        if (audioMetadata)
        {
            this.repository.Initialize(audioMetadata);
        }
    }

    /** Wires the three AudGameObjResource seams to this system. One system at a time. */
    Attach()
    {
        AudGameObjResource.manager = this.manager;
        AudGameObjResource.staticDataRepository = this.repository;
        AudGameObjResource.backend = this.backend;
        this.#attached = true;
        return this;
    }

    /** Clears the seams (back to headless). */
    Detach()
    {
        if (this.#attached)
        {
            AudGameObjResource.manager = null;
            AudGameObjResource.staticDataRepository = null;
            AudGameObjResource.backend = null;
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
    Enable(soundBanksToLoad = [])
    {
        if (!this.backend && this.#createContext)
        {
            const context = this.#createContext();
            if (context)
            {
                this.backend = new CjsAudioBackend({
                    context,
                    loadBuffer: this.#loadBuffer,
                    isLoop: eventName => this.repository.EventIsLoop(eventName),
                    distanceScale: this.#distanceScale
                });
                if (this.#musicGraph && !this.musicEngine)
                {
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
        if (this.#attached)
        {
            AudGameObjResource.backend = this.backend;
        }
        this.manager.Enable(soundBanksToLoad);
        return this.manager.enabled;
    }

    /** Culls, clears banks, drops the engine to disabled. */
    Disable()
    {
        this.manager.Disable();
    }

    /** Per-frame drive: culling + render + log flush. */
    Process(now)
    {
        this.manager.Process(now);
    }
}
