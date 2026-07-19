// Ported from CarbonEngine (MIT, (c) 2026 CCP Games) - https://github.com/carbonengine/trinity
//   audio/src/AudManager.h + AudManager.cpp
// Hand-owned since 2026-07-18 (behavior port); the generator skips this file.
// Verify against audio/AudManager.json.
//
// Headless behavior port of the lifecycle/bank state machine. Wwise engine
// init, RenderAudio, and device concerns route through the backend seam
// (AudGameObjResource.backend); state, bank tracking, deferred-event flush,
// monitored-parameter refcounts, and prioritization wiring are pure logic.
import { carbon, impl, io, type } from "@carbonenginejs/core-types/schema";
import { CjsModel } from "@carbonenginejs/core-types/model";
import { AudGameObjResource } from "./AudGameObjResource.js";
import { LISTENER_GAME_OBJ_ID, SoundPrioritization } from "./SoundPrioritization.js";

// C++ ComputeWwiseHashForSoundBank strips from the first "." then hashes via
// AK GetIDFromString; headless we key by the stripped name (adapted - the
// numeric hash only matters to Wwise).
function BankKey(name)
{
  const text = String(name);
  const dot = text.indexOf(".");
  return dot === -1 ? text : text.slice(0, dot);
}

/** AudManager (audio) - engine lifecycle, bank state machine, global RTPC/state, monitored parameters. */
@type.define({ className: "AudManager", family: "audio" })
export class AudManager extends CjsModel
{

  /** m_log (IAudActionLogPtr) [READWRITE] */
  @io.readwrite
  @type.objectRef("IAudActionLog")
  log = null;

  /** m_audioCullingEnabled (mutable bool) [READ] */
  @io.read
  @type.boolean
  audioCullingEnabled = true;

  /** m_spatialAudioEnabled (bool) [READ] */
  @io.read
  @type.boolean
  spatialAudioEnabled = true;

  /** m_settings (AudSettingsPtr) [AUTHORED] */
  @impl.adapted
  @impl.reason("Carbon supplies this via UpdateSettings() outside Blue serialization; CarbonEngineJS persists it for values interchange.")
  @io.persist
  @type.model("AudSettings")
  settings = null;

  // AudioState (Uninitialized/Disabled/Enabled) as lowercase strings;
  // GetStateValue preserves Carbon's 0/1/2.
  #state = "uninitialized";

  #soundBankInfoMap = new Map();

  #monitoredParameters = new Map();

  #callbackGameObjects = new Map();

  // CarbonEngineJS-original: the prioritization is a public collaborator so
  // emitters can read weights directly (see AudGameObjResource notes).
  soundPrioritization = new SoundPrioritization();

  /** Enabled convenience over the Carbon state (the guard emitters check). */
  get enabled()
  {
    return this.#state === "enabled";
  }

  /** Carbon method GetState. */
  @carbon.method
  @impl.implemented
  GetState()
  {
    return this.#state;
  }

  /** Carbon method GetStateValue: Carbon's scripting int (0/1/2). */
  @carbon.renamed("GetState")
  @impl.implemented
  GetStateValue()
  {
    return this.#state === "uninitialized" ? 0 : this.#state === "disabled" ? 1 : 2;
  }

  /** Carbon method Enable: init if needed, enable, load Init.bnk + requested banks, wake everything. */
  @carbon.method
  @impl.adapted
  @impl.reason("Wwise engine init (memory/stream/sound/spatial) is the backend's Init; the state machine, bank loads, and wake pass are faithful. Carbon's Enable bails un-enabled when Init fails (audio/src/AudManager.cpp:848-881); a missing backend seam is that failure, so headless the manager stays a true null manager and emitters keep queueing on their wake sets.")
  Enable(soundBanksToLoad = [])
  {
    if (this.#state === "enabled")
    {
      return;
    }
    const backend = AudGameObjResource.backend;
    if (this.#state === "uninitialized")
    {
      const repository = AudGameObjResource.staticDataRepository;
      if (!repository?.IsInitialized())
      {
        return;
      }
      // The backend seam is the sound engine: absent, or an Init that
      // explicitly fails, means Carbon's Init() failure - stay un-enabled.
      // A backend without an Init method counts as initialized.
      if (!backend || backend.Init?.(this.settings) === false)
      {
        return;
      }
      this.#state = "disabled";
    }
    if (!backend)
    {
      return;
    }
    this.#state = "enabled";
    this.LoadBank("Init.bnk");
    for (const bank of soundBanksToLoad)
    {
      this.LoadBank(bank);
    }
    for (const gameObject of this.soundPrioritization.GetGameObjects())
    {
      gameObject.Wake();
    }
  }

  /** Carbon method Disable: cull everything, clear banks, drop to disabled (engine stays initialized). */
  @carbon.method
  @impl.implemented
  Disable()
  {
    if (this.#state !== "enabled")
    {
      return;
    }
    for (const gameObject of this.soundPrioritization.GetGameObjects())
    {
      gameObject.Cull();
    }
    this.ClearBanks();
    this.#state = "disabled";
  }

  /** Carbon method LoadBank: async - tracked LOADING immediately; backend callback drives LOADED. */
  @carbon.method
  @impl.implemented
  LoadBank(name)
  {
    if (this.#state !== "enabled")
    {
      return;
    }
    const key = BankKey(name);
    const status = this.GetSoundBankStatus(name);
    if (status === "loaded" || status === "loading")
    {
      return;
    }
    this.#soundBankInfoMap.set(key, { soundBankStatus: "loading", soundBankID: key, soundBankName: String(name), waitingEventsAfterLoad: [] });
    AudGameObjResource.backend?.LoadBank?.(String(name), loaded => this.UpdateSoundBankStatus(key, loaded ? "loaded" : "not_loaded"));
  }

  /** Carbon method UnloadBank. */
  @carbon.method
  @impl.implemented
  UnloadBank(name)
  {
    if (this.#state !== "enabled")
    {
      return;
    }
    const key = BankKey(name);
    const status = this.GetSoundBankStatus(name);
    if (status === "not_loaded" || status === "unloading")
    {
      return;
    }
    this.UpdateSoundBankStatus(key, "unloading");
    AudGameObjResource.backend?.UnloadBank?.(String(name), () => this.#soundBankInfoMap.delete(key));
  }

  /** Carbon method ClearBanks. */
  @carbon.method
  @impl.implemented
  ClearBanks()
  {
    if (this.#state !== "uninitialized")
    {
      AudGameObjResource.backend?.ClearBanks?.();
      this.#soundBankInfoMap.clear();
    }
  }

  // The deferred-event flush: waiting events fire with bypassPrefix=true
  // exactly on the transition to LOADED, then the queue clears.
  /** Carbon method UpdateSoundBankStatus. */
  @carbon.method
  @impl.implemented
  UpdateSoundBankStatus(bankID, status)
  {
    const info = this.#soundBankInfoMap.get(bankID);
    if (!info)
    {
      return;
    }
    info.soundBankStatus = status;
    if (status === "loaded")
    {
      for (const [emitter, eventName] of info.waitingEventsAfterLoad)
      {
        emitter?.PostEvent(eventName, true);
      }
      info.waitingEventsAfterLoad.length = 0;
    }
  }

  /** Carbon method RegisterEventAfterSoundBankLoad: queue an event on a LOADING bank (matched by name). */
  @carbon.method
  @impl.implemented
  RegisterEventAfterSoundBankLoad(soundBankName, eventName, emitter)
  {
    for (const info of this.#soundBankInfoMap.values())
    {
      if (info.soundBankName === String(soundBankName))
      {
        info.waitingEventsAfterLoad.push([emitter, String(eventName)]);
      }
    }
  }

  /** Carbon method GetSoundBankStatus: by name or key; "not_loaded" when unknown. */
  @carbon.method
  @impl.implemented
  GetSoundBankStatus(name)
  {
    const byKey = this.#soundBankInfoMap.get(BankKey(name));
    if (byKey)
    {
      return byKey.soundBankStatus;
    }
    for (const info of this.#soundBankInfoMap.values())
    {
      if (info.soundBankName === String(name))
      {
        return info.soundBankStatus;
      }
    }
    return "not_loaded";
  }

  /** Carbon method GetLoadedSoundBanks: names with status loaded OR loading (Carbon counts both). */
  @carbon.method
  @impl.implemented
  GetLoadedSoundBanks()
  {
    const names = [];
    for (const info of this.#soundBankInfoMap.values())
    {
      if (info.soundBankStatus === "loaded" || info.soundBankStatus === "loading")
      {
        names.push(info.soundBankName);
      }
    }
    return names;
  }

  /** Carbon method SetGlobalRTPC: pure backend passthrough, enabled-gated, no caching. */
  @carbon.method
  @impl.implemented
  SetGlobalRTPC(rtpcName, value)
  {
    if (this.#state !== "enabled")
    {
      return false;
    }
    AudGameObjResource.backend?.SetGlobalRTPCValue?.(rtpcName, value);
    return true;
  }

  /** Carbon method SetState (global state group): passthrough, enabled-gated. */
  @carbon.method
  @impl.implemented
  SetState(stateGroup, stateName)
  {
    if (this.#state !== "enabled")
    {
      return false;
    }
    AudGameObjResource.backend?.SetGlobalState?.(stateGroup, stateName);
    return true;
  }

  /** Carbon method StopAll: every prioritized emitter stops everything. */
  @carbon.method
  @impl.implemented
  StopAll()
  {
    if (this.#state !== "uninitialized")
    {
      for (const gameObject of this.soundPrioritization.GetGameObjects())
      {
        gameObject.StopAll?.();
      }
    }
  }

  /** Carbon method RegisterGameObject: callback map + prioritization registration. */
  @carbon.method
  @impl.implemented
  RegisterGameObject(gameObjID, gameObject)
  {
    if (!gameObject)
    {
      return;
    }
    this.#callbackGameObjects.set(gameObjID, gameObject);
    this.soundPrioritization.RegisterGameObject(gameObject);
  }

  /** Carbon method UnregisterGameObject. */
  @carbon.method
  @impl.implemented
  UnregisterGameObject(gameObjID)
  {
    this.soundPrioritization.UnregisterGameObject(gameObjID);
  }

  /** Carbon method RemoveCallbackGameObject. */
  @carbon.method
  @impl.implemented
  RemoveCallbackGameObject(gameObjID)
  {
    this.#callbackGameObjects.delete(gameObjID);
  }

  /** Carbon method GetAudioEmitter (by game-object id). */
  @carbon.method
  @impl.implemented
  GetAudioEmitter(gameObjID)
  {
    return this.#callbackGameObjects.get(gameObjID) ?? null;
  }

  /** Carbon method GetListener: the fixed-id listener object. */
  @carbon.method
  @impl.implemented
  GetListener()
  {
    return this.GetAudioEmitter(LISTENER_GAME_OBJ_ID);
  }

  /** Carbon method RegisterParameter: watcher refcount, entry created at 1. */
  @carbon.method
  @impl.implemented
  RegisterParameter(name)
  {
    if (this.#state === "uninitialized")
    {
      return;
    }
    const entry = this.#monitoredParameters.get(String(name)) ?? { parameterValue: 0, parameterExists: false, watchers: 0 };
    entry.watchers++;
    this.#monitoredParameters.set(String(name), entry);
  }

  /** Carbon method UnregisterParameter: erased when watchers hit 0. */
  @carbon.method
  @impl.implemented
  UnregisterParameter(name)
  {
    if (this.#state === "uninitialized")
    {
      return;
    }
    const entry = this.#monitoredParameters.get(String(name));
    if (entry && --entry.watchers === 0)
    {
      this.#monitoredParameters.delete(String(name));
    }
  }

  /** Carbon method GetParameterInfo. */
  @carbon.method
  @impl.implemented
  GetParameterInfo(name)
  {
    return this.#monitoredParameters.get(String(name)) ?? null;
  }

  /** Carbon method UpdateMonitoredParameters: refresh every entry from the backend RTPC query. */
  @carbon.method
  @impl.implemented
  UpdateMonitoredParameters()
  {
    for (const [name, entry] of this.#monitoredParameters)
    {
      const value = AudGameObjResource.backend?.GetGlobalRTPCValue?.(name);
      entry.parameterExists = value !== undefined && value !== null;
      entry.parameterValue = entry.parameterExists ? Number(value) : entry.parameterValue;
    }
  }

  /** Carbon method Process: cull (when enabled+flagged), render, flush the log. */
  @carbon.method
  @impl.implemented
  Process(now)
  {
    if (this.#state === "uninitialized")
    {
      return;
    }
    if (this.#state === "enabled")
    {
      if (this.soundPrioritization.GetAudioCullingEnabled())
      {
        this.soundPrioritization.CullAudio(now);
      }
      AudGameObjResource.backend?.RenderAudio?.();
    }
    this.log?.Flush?.();
  }

  /** Carbon method UpdateSettings. */
  @carbon.method
  @impl.implemented
  UpdateSettings(settings)
  {
    this.settings = settings;
  }

  /** Carbon method ResetCullingSettings. */
  @carbon.method
  @impl.implemented
  ResetCullingSettings()
  {
    this.soundPrioritization.ResetCullingSettings();
  }

}
