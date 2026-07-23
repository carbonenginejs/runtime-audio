import { applyDecs2311 as _applyDecs2311 } from '../../_virtual/_rollupPluginBabelHelpers.js';
import { io, type, impl, carbon } from '@carbonenginejs/core-types/schema';
import { CjsModel } from '@carbonenginejs/core-types/model';
import { AudGameObjResource as _AudGameObjResource } from './AudGameObjResource.js';
import { SoundPrioritization as _SoundPrioritization, LISTENER_GAME_OBJ_ID } from './SoundPrioritization.js';

let _initProto, _initClass, _init_log, _init_extra_log, _init_audioCullingEnabled, _init_extra_audioCullingEnabled, _init_spatialAudioEnabled, _init_extra_spatialAudioEnabled, _init_settings, _init_extra_settings;

// C++ ComputeWwiseHashForSoundBank strips from the first "." then hashes via
// AK GetIDFromString; headless we key by the stripped name (adapted - the
// numeric hash only matters to Wwise).
function BankKey(name) {
  const text = String(name);
  const dot = text.indexOf(".");
  return dot === -1 ? text : text.slice(0, dot);
}

/** AudManager (audio) - engine lifecycle, bank state machine, global RTPC/state, monitored parameters. */
let _AudManager;
class AudManager extends CjsModel {
  static {
    ({
      e: [_init_log, _init_extra_log, _init_audioCullingEnabled, _init_extra_audioCullingEnabled, _init_spatialAudioEnabled, _init_extra_spatialAudioEnabled, _init_settings, _init_extra_settings, _initProto],
      c: [_AudManager, _initClass]
    } = _applyDecs2311(this, [type.define({
      className: "AudManager",
      family: "audio"
    })], [[[io, io.readwrite, void 0, type.objectRef("IAudActionLog")], 16, "log"], [[io, io.read, type, type.boolean], 16, "audioCullingEnabled"], [[io, io.read, type, type.boolean], 16, "spatialAudioEnabled"], [[impl, impl.adapted, void 0, impl.reason("Carbon supplies this via UpdateSettings() outside Blue serialization; CarbonEngineJS persists it for values interchange."), io, io.persist, void 0, type.model("AudSettings")], 16, "settings"], [[carbon, carbon.method, impl, impl.implemented], 18, "GetState"], [[void 0, carbon.renamed("GetState"), impl, impl.implemented], 18, "GetStateValue"], [[carbon, carbon.method, impl, impl.adapted, void 0, impl.reason("Wwise engine init (memory/stream/sound/spatial) is the backend's Init; the state machine, bank loads, and wake pass are faithful. Carbon's Enable bails un-enabled when Init fails (audio/src/AudManager.cpp:848-881); a missing backend seam is that failure, so headless the manager stays a true null manager and emitters keep queueing on their wake sets.")], 18, "Enable"], [[carbon, carbon.method, impl, impl.implemented], 18, "Disable"], [[carbon, carbon.method, impl, impl.implemented], 18, "LoadBank"], [[carbon, carbon.method, impl, impl.implemented], 18, "UnloadBank"], [[carbon, carbon.method, impl, impl.implemented], 18, "ClearBanks"], [[carbon, carbon.method, impl, impl.implemented], 18, "UpdateSoundBankStatus"], [[carbon, carbon.method, impl, impl.implemented], 18, "RegisterEventAfterSoundBankLoad"], [[carbon, carbon.method, impl, impl.implemented], 18, "GetSoundBankStatus"], [[carbon, carbon.method, impl, impl.implemented], 18, "GetLoadedSoundBanks"], [[carbon, carbon.method, impl, impl.implemented], 18, "SetGlobalRTPC"], [[carbon, carbon.method, impl, impl.implemented], 18, "SetState"], [[carbon, carbon.method, impl, impl.implemented], 18, "StopAll"], [[carbon, carbon.method, impl, impl.implemented], 18, "RegisterGameObject"], [[carbon, carbon.method, impl, impl.implemented], 18, "UnregisterGameObject"], [[carbon, carbon.method, impl, impl.implemented], 18, "RemoveCallbackGameObject"], [[carbon, carbon.method, impl, impl.implemented], 18, "GetAudioEmitter"], [[carbon, carbon.method, impl, impl.implemented], 18, "GetListener"], [[carbon, carbon.method, impl, impl.implemented], 18, "RegisterParameter"], [[carbon, carbon.method, impl, impl.implemented], 18, "UnregisterParameter"], [[carbon, carbon.method, impl, impl.implemented], 18, "GetParameterInfo"], [[carbon, carbon.method, impl, impl.implemented], 18, "UpdateMonitoredParameters"], [[carbon, carbon.method, impl, impl.implemented], 18, "Process"], [[carbon, carbon.method, impl, impl.implemented], 18, "UpdateSettings"], [[carbon, carbon.method, impl, impl.implemented], 18, "DisableAudioCulling"], [[carbon, carbon.method, impl, impl.implemented], 18, "EnableAudioCulling"], [[carbon, carbon.method, impl, impl.adapted, void 0, impl.reason("Carbon returns SoundPrioritization's current debug list; CarbonEngineJS returns a defensive array of the same current order.")], 18, "GetPrioritizedEmitters"], [[carbon, carbon.method, impl, impl.adapted, void 0, impl.reason("Carbon's native debug renderer reads a global flag; CarbonEngineJS retains the flag for an injected renderer.")], 18, "EnableDebugDisplayAllEmitters"], [[carbon, carbon.method, impl, impl.adapted, void 0, impl.reason("Carbon's native debug renderer reads a global flag; CarbonEngineJS retains the flag for an injected renderer.")], 18, "DisableDebugDisplayAllEmitters"], [[carbon, carbon.method, impl, impl.adapted, void 0, impl.reason("The value is available to browser renderers even though runtime-audio does not draw debug geometry.")], 18, "GetDebugDisplayAllEmitters"], [[carbon, carbon.method, impl, impl.notSupported], 18, "EnableSpatialAudio"], [[carbon, carbon.method, impl, impl.notSupported], 18, "DisableSpatialAudio"], [[carbon, carbon.method, impl, impl.notSupported], 18, "SpatialAudioIsSupported"], [[carbon, carbon.method, impl, impl.notSupported], 18, "RegisterAudioDeviceChangeCallback"], [[carbon, carbon.method, impl, impl.notSupported], 18, "StartProfilerCapture"], [[carbon, carbon.method, impl, impl.notSupported], 18, "StopProfilerCapture"], [[carbon, carbon.method, impl, impl.notSupported], 18, "IsProfilerCapturing"], [[carbon, carbon.method, impl, impl.implemented], 18, "ResetCullingSettings"]], 0, void 0, CjsModel));
  }
  /** m_log (IAudActionLogPtr) [READWRITE] */
  log = (_initProto(this), _init_log(this, null));

  /** m_audioCullingEnabled (mutable bool) [READ] */
  audioCullingEnabled = (_init_extra_log(this), _init_audioCullingEnabled(this, true));

  /** m_spatialAudioEnabled (bool) [READ] */
  spatialAudioEnabled = (_init_extra_audioCullingEnabled(this), _init_spatialAudioEnabled(this, true));

  /** m_settings (AudSettingsPtr) [AUTHORED] */
  settings = (_init_extra_spatialAudioEnabled(this), _init_settings(this, null));

  // AudioState (Uninitialized/Disabled/Enabled) as lowercase strings;
  // GetStateValue preserves Carbon's 0/1/2.
  #state = (_init_extra_settings(this), "uninitialized");
  #soundBankInfoMap = new Map();
  #monitoredParameters = new Map();
  #callbackGameObjects = new Map();
  #debugDisplayAllEmitters = false;

  // CarbonEngineJS-original: the prioritization is a public collaborator so
  // emitters can read weights directly (see AudGameObjResource notes).
  soundPrioritization = new _SoundPrioritization();

  /** Enabled convenience over the Carbon state (the guard emitters check). */
  get enabled() {
    return this.#state === "enabled";
  }

  /** Carbon method GetState. */
  GetState() {
    return this.#state;
  }

  /** Carbon method GetStateValue: Carbon's scripting int (0/1/2). */
  GetStateValue() {
    return this.#state === "uninitialized" ? 0 : this.#state === "disabled" ? 1 : 2;
  }

  /** Carbon method Enable: init if needed, enable, load Init.bnk + requested banks, wake everything. */
  Enable(soundBanksToLoad = []) {
    if (this.#state === "enabled") {
      return;
    }
    const backend = _AudGameObjResource.backend;
    if (this.#state === "uninitialized") {
      const repository = _AudGameObjResource.staticDataRepository;
      if (!repository?.IsInitialized()) {
        return;
      }
      // The backend seam is the sound engine: absent, or an Init that
      // explicitly fails, means Carbon's Init() failure - stay un-enabled.
      // A backend without an Init method counts as initialized.
      if (!backend || backend.Init?.(this.settings) === false) {
        return;
      }
      this.#state = "disabled";
    }
    if (!backend) {
      return;
    }
    this.#state = "enabled";
    this.LoadBank("Init.bnk");
    for (const bank of soundBanksToLoad) {
      this.LoadBank(bank);
    }
    for (const gameObject of this.soundPrioritization.GetGameObjects()) {
      gameObject.Wake();
    }
  }

  /** Carbon method Disable: cull everything, clear banks, drop to disabled (engine stays initialized). */
  Disable() {
    if (this.#state !== "enabled") {
      return;
    }
    for (const gameObject of this.soundPrioritization.GetGameObjects()) {
      gameObject.Cull();
    }
    this.ClearBanks();
    this.#state = "disabled";
  }

  /** Carbon method LoadBank: async - tracked LOADING immediately; backend callback drives LOADED. */
  LoadBank(name) {
    if (this.#state !== "enabled") {
      return;
    }
    const key = BankKey(name);
    const status = this.GetSoundBankStatus(name);
    if (status === "loaded" || status === "loading") {
      return;
    }
    this.#soundBankInfoMap.set(key, {
      soundBankStatus: "loading",
      soundBankID: key,
      soundBankName: String(name),
      waitingEventsAfterLoad: []
    });
    _AudGameObjResource.backend?.LoadBank?.(String(name), loaded => this.UpdateSoundBankStatus(key, loaded ? "loaded" : "not_loaded"));
  }

  /** Carbon method UnloadBank. */
  UnloadBank(name) {
    if (this.#state !== "enabled") {
      return;
    }
    const key = BankKey(name);
    const status = this.GetSoundBankStatus(name);
    if (status === "not_loaded" || status === "unloading") {
      return;
    }
    this.UpdateSoundBankStatus(key, "unloading");
    _AudGameObjResource.backend?.UnloadBank?.(String(name), () => this.#soundBankInfoMap.delete(key));
  }

  /** Carbon method ClearBanks. */
  ClearBanks() {
    if (this.#state !== "uninitialized") {
      _AudGameObjResource.backend?.ClearBanks?.();
      this.#soundBankInfoMap.clear();
    }
  }

  // The deferred-event flush: waiting events fire with bypassPrefix=true
  // exactly on the transition to LOADED, then the queue clears.
  /** Carbon method UpdateSoundBankStatus. */
  UpdateSoundBankStatus(bankID, status) {
    const info = this.#soundBankInfoMap.get(bankID);
    if (!info) {
      return;
    }
    info.soundBankStatus = status;
    if (status === "loaded") {
      for (const [emitter, eventName] of info.waitingEventsAfterLoad) {
        emitter?.PostEvent(eventName, true);
      }
      info.waitingEventsAfterLoad.length = 0;
    }
  }

  /** Carbon method RegisterEventAfterSoundBankLoad: queue an event on a LOADING bank (matched by name). */
  RegisterEventAfterSoundBankLoad(soundBankName, eventName, emitter) {
    for (const info of this.#soundBankInfoMap.values()) {
      if (info.soundBankName === String(soundBankName)) {
        info.waitingEventsAfterLoad.push([emitter, String(eventName)]);
      }
    }
  }

  /** Carbon method GetSoundBankStatus: by name or key; "not_loaded" when unknown. */
  GetSoundBankStatus(name) {
    const byKey = this.#soundBankInfoMap.get(BankKey(name));
    if (byKey) {
      return byKey.soundBankStatus;
    }
    for (const info of this.#soundBankInfoMap.values()) {
      if (info.soundBankName === String(name)) {
        return info.soundBankStatus;
      }
    }
    return "not_loaded";
  }

  /** Carbon method GetLoadedSoundBanks: names with status loaded OR loading (Carbon counts both). */
  GetLoadedSoundBanks() {
    const names = [];
    for (const info of this.#soundBankInfoMap.values()) {
      if (info.soundBankStatus === "loaded" || info.soundBankStatus === "loading") {
        names.push(info.soundBankName);
      }
    }
    return names;
  }

  /** Carbon method SetGlobalRTPC: pure backend passthrough, enabled-gated, no caching. */
  SetGlobalRTPC(rtpcName, value) {
    if (this.#state !== "enabled") {
      return false;
    }
    _AudGameObjResource.backend?.SetGlobalRTPCValue?.(rtpcName, value);
    return true;
  }

  /** Carbon method SetState (global state group): passthrough, enabled-gated. */
  SetState(stateGroup, stateName) {
    if (this.#state !== "enabled") {
      return false;
    }
    _AudGameObjResource.backend?.SetGlobalState?.(stateGroup, stateName);
    return true;
  }

  /** Carbon method StopAll: every prioritized emitter stops everything. */
  StopAll() {
    if (this.#state !== "uninitialized") {
      for (const gameObject of this.soundPrioritization.GetGameObjects()) {
        gameObject.StopAll?.();
      }
    }
  }

  /** Carbon method RegisterGameObject: callback map + prioritization registration. */
  RegisterGameObject(gameObjID, gameObject) {
    if (!gameObject) {
      return;
    }
    this.#callbackGameObjects.set(gameObjID, gameObject);
    this.soundPrioritization.RegisterGameObject(gameObject);
  }

  /** Carbon method UnregisterGameObject. */
  UnregisterGameObject(gameObjID) {
    this.soundPrioritization.UnregisterGameObject(gameObjID);
  }

  /** Carbon method RemoveCallbackGameObject. */
  RemoveCallbackGameObject(gameObjID) {
    this.#callbackGameObjects.delete(gameObjID);
  }

  /** Carbon method GetAudioEmitter (by game-object id). */
  GetAudioEmitter(gameObjID) {
    return this.#callbackGameObjects.get(gameObjID) ?? null;
  }

  /** Carbon method GetListener: the fixed-id listener object. */
  GetListener() {
    return this.GetAudioEmitter(LISTENER_GAME_OBJ_ID);
  }

  /** Carbon method RegisterParameter: watcher refcount, entry created at 1. */
  RegisterParameter(name) {
    if (this.#state === "uninitialized") {
      return;
    }
    const entry = this.#monitoredParameters.get(String(name)) ?? {
      parameterValue: 0,
      parameterExists: false,
      watchers: 0
    };
    entry.watchers++;
    this.#monitoredParameters.set(String(name), entry);
  }

  /** Carbon method UnregisterParameter: erased when watchers hit 0. */
  UnregisterParameter(name) {
    if (this.#state === "uninitialized") {
      return;
    }
    const entry = this.#monitoredParameters.get(String(name));
    if (entry && --entry.watchers === 0) {
      this.#monitoredParameters.delete(String(name));
    }
  }

  /** Carbon method GetParameterInfo. */
  GetParameterInfo(name) {
    return this.#monitoredParameters.get(String(name)) ?? null;
  }

  /** Carbon method UpdateMonitoredParameters: refresh every entry from the backend RTPC query. */
  UpdateMonitoredParameters() {
    for (const [name, entry] of this.#monitoredParameters) {
      const value = _AudGameObjResource.backend?.GetGlobalRTPCValue?.(name);
      entry.parameterExists = value !== undefined && value !== null;
      entry.parameterValue = entry.parameterExists ? Number(value) : entry.parameterValue;
    }
  }

  /** Carbon method Process: cull (when enabled+flagged), render, flush the log. */
  Process(now) {
    if (this.#state === "uninitialized") {
      return;
    }
    if (this.#state === "enabled") {
      if (this.soundPrioritization.GetAudioCullingEnabled()) {
        this.soundPrioritization.CullAudio(now);
      }
      _AudGameObjResource.backend?.RenderAudio?.();
    }
    this.log?.Flush?.();
  }

  /** Carbon method UpdateSettings. */
  UpdateSettings(settings) {
    this.settings = settings;
  }

  /** Carbon method DisableAudioCulling: wake all objects, then disable prioritization. */
  DisableAudioCulling() {
    for (const object of this.soundPrioritization.GetGameObjects()) {
      if (object.IsCulled?.()) {
        object.Wake?.();
      }
    }
    this.soundPrioritization.SetAudioCullingEnabled(false);
    this.audioCullingEnabled = false;
  }

  /** Carbon method EnableAudioCulling. */
  EnableAudioCulling() {
    this.soundPrioritization.SetAudioCullingEnabled(true);
    this.audioCullingEnabled = true;
  }

  /** Carbon debug method GetPrioritizedEmitters: defensive current-order snapshot. */
  GetPrioritizedEmitters() {
    return this.soundPrioritization.GetGameObjects();
  }

  /** Carbon debug flag; renderer consumption remains optional. */
  EnableDebugDisplayAllEmitters() {
    this.#debugDisplayAllEmitters = true;
  }

  /** Carbon debug flag; renderer consumption remains optional. */
  DisableDebugDisplayAllEmitters() {
    this.#debugDisplayAllEmitters = false;
  }

  /** Carbon debug flag query. */
  GetDebugDisplayAllEmitters() {
    return this.#debugDisplayAllEmitters;
  }

  /** Native Wwise output-device replacement has no WebAudio equivalent. */
  EnableSpatialAudio() {
    return false;
  }

  /** Native Wwise output-device replacement has no WebAudio equivalent. */
  DisableSpatialAudio() {
    return false;
  }

  /** OS/Wwise spatial-output support cannot be inferred from a WebAudio panner. */
  SpatialAudioIsSupported() {
    return false;
  }

  /** Native audio-device callbacks have no owned browser equivalent. */
  RegisterAudioDeviceChangeCallback(callback) {
    return false;
  }

  /** Native Wwise profiler capture is unavailable in WebAudio. */
  StartProfilerCapture() {
    return false;
  }

  /** Native Wwise profiler capture is unavailable in WebAudio. */
  StopProfilerCapture() {
    return false;
  }

  /** Native Wwise profiler capture is unavailable in WebAudio. */
  IsProfilerCapturing() {
    return false;
  }

  /** Carbon method ResetCullingSettings. */
  ResetCullingSettings() {
    this.soundPrioritization.ResetCullingSettings();
  }
  static {
    _initClass();
  }
}

export { _AudManager as AudManager };
//# sourceMappingURL=AudManager.js.map
