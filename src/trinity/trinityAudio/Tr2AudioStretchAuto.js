// Ported from CarbonEngine (MIT, (c) 2026 CCP Games) - https://github.com/carbonengine/trinity
//   trinity/trinity/Audio/Tr2AudioStretchAuto.h
// Moved from runtime-trinity generated output 2026-07-18; hand-owned by
// runtime-audio. Verify against trinityAudio/Tr2AudioStretchAuto.json.
import { io, type } from "@carbonenginejs/core-types/schema";
import { Tr2AudioStretchBase } from "./Tr2AudioStretchBase.js";

/** Tr2AudioStretchAuto (trinityAudio) - generated from schema shapeHash 66b9fbdd.... */
@type.define({ className: "Tr2AudioStretchAuto", family: "trinityAudio" })
export class Tr2AudioStretchAuto extends Tr2AudioStretchBase
{

  /** m_impactEvent (std::wstring) [READWRITE, PERSIST] */
  @io.persist
  @type.string
  impactEvent = "";

  /** m_outburstEvent (std::wstring) [READWRITE, PERSIST] */
  @io.persist
  @type.string
  outburstEvent = "";

  /** m_stretchEvent (std::wstring) [READWRITE, PERSIST] */
  @io.persist
  @type.string
  stretchEvent = "";

}
