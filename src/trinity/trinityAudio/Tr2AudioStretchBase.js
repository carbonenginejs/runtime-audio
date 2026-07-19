// Ported from CarbonEngine (MIT, (c) 2026 CCP Games) - https://github.com/carbonengine/trinity
//   trinity/trinity/Audio/Tr2AudioStretchBase.h
// Moved from runtime-trinity generated output 2026-07-18; hand-owned by
// runtime-audio. Verify against trinityAudio/Tr2AudioStretchBase.json.
import { io, type } from "@carbonenginejs/core-types/schema";
import { CjsModel } from "@carbonenginejs/core-types/model";

/** Tr2AudioStretchBase (trinityAudio) - generated from schema shapeHash f6d14e40.... */
@type.define({ className: "Tr2AudioStretchBase", family: "trinityAudio" })
export class Tr2AudioStretchBase extends CjsModel
{

  /** m_stretchEmitter (ITr2AudEmitterPtr) [READWRITE, PERSIST] */
  @io.persist
  @type.model("ITr2AudEmitter")
  stretchEmitter = null;

  /** m_destEmitter (ITr2AudEmitterPtr) [READWRITE, PERSIST] */
  @io.persist
  @type.model("ITr2AudEmitter")
  destinationEmitter = null;

  /** m_sourceEmitter (ITr2AudEmitterPtr) [READWRITE, PERSIST] */
  @io.persist
  @type.model("ITr2AudEmitter")
  sourceEmitter = null;

}
