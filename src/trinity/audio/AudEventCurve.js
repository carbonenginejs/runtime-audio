// Ported from CarbonEngine (MIT, (c) 2026 CCP Games) - https://github.com/carbonengine/trinity
//   audio/src/AudEventCurve.h + AudEventCurve.cpp
// Hand-owned since 2026-07-18 (behavior port); the generator skips this file.
// Verify against audio/AudEventCurve.json.
import { carbon, impl, io, schema, type } from "@carbonenginejs/core-types/schema";
import { CjsModel } from "@carbonenginejs/core-types/model";
import { TriExtrapolation } from "@carbonenginejs/runtime-const/graphics";
import { AudEventKey } from "./AudEventKey.js";

/** AudEventCurve (audio) - timeline curve whose keys fire audio events. */
@type.define({ className: "AudEventCurve", family: "audio" })
export class AudEventCurve extends CjsModel
{

  /** m_extrapolation (TRIEXTRAPOLATION - enum TRIEXTRAPOLATION) [READWRITE, PERSIST, ENUM] */
  @io.persist
  @type.int32
  @schema.enum("TRIEXTRAPOLATION")
  extrapolation = 0;

  /** m_time (double) [READ] */
  @io.read
  @type.float64
  time = 0;

  /** m_length (float) [READ] */
  @io.read
  @type.float32
  length = 0;

  /** m_localTime (float) [READ] */
  @io.read
  @type.float32
  localTime = 0;

  /** m_name (std::string) [READWRITE, PERSIST] */
  @io.persist
  @type.string
  name = "";

  /** m_value (std::wstring) [READWRITE, PERSIST] */
  @io.persist
  @type.string
  value = "";

  /** m_sourceTriObserver (ITriObserverLocalPtr) [READWRITE, PERSIST] */
  @io.persist
  @type.model("ITriObserverLocal")
  sourceTriObserver = null;

  /** m_keys (PAudEventKeyVector) [PERSISTONLY] */
  @io.persistOnly
  @type.list("AudEventKey")
  keys = [];

  /** m_audioEmitter (AudEmitterPtr) [READ] */
  @io.read
  @type.objectRef("AudEmitter")
  audioEmitter = null;

  // Playback cursor (C++ m_currentKeyIt) - runtime state, rebuildable.
  #currentKeyIndex = 0;

  /** Carbon method AddKey (MAP_METHOD_AND_WRAP). Appends a key and resorts. */
  @carbon.method
  @impl.implemented
  AddKey(time, evtName)
  {
    const key = new AudEventKey();
    key.time = Number(time) || 0;
    key.value = String(evtName ?? "");
    this.InsertKey(key);
  }

  /** Carbon method InsertKey (not Blue-mapped): insert, sort, reset cursor, refresh length. */
  @carbon.method
  @impl.implemented
  InsertKey(key)
  {
    this.keys.push(key);
    SortKeys(this.keys);
    this.#currentKeyIndex = 0;
    this.length = this.keys[this.keys.length - 1].time;
  }

  /** Carbon method GetKeyCount (MAP_METHOD_AND_WRAP). */
  @carbon.method
  @impl.implemented
  GetKeyCount()
  {
    return this.keys.length;
  }

  /** Carbon method GetKeyTime (MAP_METHOD_AND_WRAP). Returns 0 out of range. */
  @carbon.method
  @impl.implemented
  GetKeyTime(ix)
  {
    return InRange(this.keys, ix) ? this.keys[ix].time : 0;
  }

  /** Carbon method GetKeyValue (MAP_METHOD_AND_WRAP). Returns "" out of range. */
  @carbon.method
  @impl.implemented
  GetKeyValue(ix)
  {
    return InRange(this.keys, ix) ? this.keys[ix].value : "";
  }

  /** Carbon method SetKeyTime (MAP_METHOD_AND_WRAP). Resorts and refreshes length. */
  @carbon.method
  @impl.implemented
  SetKeyTime(ix, time)
  {
    if (!InRange(this.keys, ix))
    {
      return;
    }
    this.keys[ix].time = Number(time) || 0;
    SortKeys(this.keys);
    this.length = this.keys[this.keys.length - 1].time;
  }

  /** Carbon method SetKeyValue (MAP_METHOD_AND_WRAP). */
  @carbon.method
  @impl.implemented
  SetKeyValue(ix, value)
  {
    if (InRange(this.keys, ix))
    {
      this.keys[ix].value = String(value ?? "");
    }
  }

  // Carbon leaves length untouched when the last key is removed - preserved.
  /** Carbon method RemoveKey (MAP_METHOD_AND_WRAP). */
  @carbon.method
  @impl.implemented
  RemoveKey(ix)
  {
    if (!InRange(this.keys, ix))
    {
      return;
    }
    this.keys.splice(ix, 1);
    SortKeys(this.keys);
    this.#currentKeyIndex = 0;
    if (this.keys.length > 0)
    {
      this.length = this.keys[this.keys.length - 1].time;
    }
  }

  /** Carbon method Initialize (IInitialize, not Blue-mapped): sort persisted keys, refresh length. */
  @carbon.method
  @impl.adapted
  @impl.reason("Carbon also creates/attaches an AudEmitter here; the headless graph defers emitter creation to the audio system.")
  Initialize()
  {
    SortKeys(this.keys);
    this.#currentKeyIndex = 0;
    if (this.keys.length > 0)
    {
      this.length = this.keys[this.keys.length - 1].time;
    }
    return true;
  }

  /** Carbon method Reset (ITriFunction, not Blue-mapped): rewind the playback cursor. */
  @carbon.method
  @impl.implemented
  Reset()
  {
    this.#currentKeyIndex = 0;
  }

  /** Carbon method GetSourceTriObserver (MAP_METHOD_AND_WRAP). */
  @carbon.method
  @impl.implemented
  GetSourceTriObserver()
  {
    return this.sourceTriObserver;
  }

  /** Carbon method SetSourceTriObserver (MAP_METHOD_AND_WRAP). */
  @carbon.method
  @impl.adapted
  @impl.reason("Carbon calls CreateAudioEmitter() here; the headless graph assigns the reference only and defers emitter creation to the audio system.")
  SetSourceTriObserver(sourceTriObserver)
  {
    this.sourceTriObserver = sourceTriObserver;
  }

  /** Carbon method UpdateValue (ITriFunction): fires keyed events as time advances. */
  @carbon.method
  @impl.notImplemented
  @impl.note("Lands with realization: event dispatch requires a live ITr2AudEmitter (SendEvent + position gate).")
  UpdateValue(...args)
  {
    throw new Error("AudEventCurve.UpdateValue is not implemented in CarbonEngineJS.");
  }

  // Carbon enum TRIEXTRAPOLATION (blue/include/ITriConstants.h:33) - shared
  // vocabulary owned by runtime-const; aliased as a class static per the org
  // enum rule so @schema.enum("TRIEXTRAPOLATION") resolves and users address
  // AudEventCurve.TRIEXTRAPOLATION.TRIEXT_CYCLE (TriOperator pattern).
  static TRIEXTRAPOLATION = TriExtrapolation;

}

function SortKeys(keys)
{
  keys.sort((a, b) => a.time - b.time);
}

function InRange(keys, ix)
{
  return Number.isInteger(ix) && ix >= 0 && ix < keys.length;
}
