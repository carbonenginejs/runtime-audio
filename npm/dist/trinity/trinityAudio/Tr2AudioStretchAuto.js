import { applyDecs2311 as _applyDecs2311 } from '../../_virtual/_rollupPluginBabelHelpers.js';
import { io, type } from '@carbonenginejs/core-types/schema';
import { Tr2AudioStretchBase as _Tr2AudioStretchBase } from './Tr2AudioStretchBase.js';

let _initClass, _init_impactEvent, _init_extra_impactEvent, _init_outburstEvent, _init_extra_outburstEvent, _init_stretchEvent, _init_extra_stretchEvent;

/** Tr2AudioStretchAuto (trinityAudio) - generated from schema shapeHash 66b9fbdd.... */
let _Tr2AudioStretchAuto;
class Tr2AudioStretchAuto extends _Tr2AudioStretchBase {
  static {
    ({
      e: [_init_impactEvent, _init_extra_impactEvent, _init_outburstEvent, _init_extra_outburstEvent, _init_stretchEvent, _init_extra_stretchEvent],
      c: [_Tr2AudioStretchAuto, _initClass]
    } = _applyDecs2311(this, [type.define({
      className: "Tr2AudioStretchAuto",
      family: "trinityAudio"
    })], [[[io, io.persist, type, type.string], 16, "impactEvent"], [[io, io.persist, type, type.string], 16, "outburstEvent"], [[io, io.persist, type, type.string], 16, "stretchEvent"]], 0, void 0, _Tr2AudioStretchBase));
  }
  constructor(...args) {
    super(...args);
    _init_extra_stretchEvent(this);
  }
  /** m_impactEvent (std::wstring) [READWRITE, PERSIST] */
  impactEvent = _init_impactEvent(this, "");

  /** m_outburstEvent (std::wstring) [READWRITE, PERSIST] */
  outburstEvent = (_init_extra_impactEvent(this), _init_outburstEvent(this, ""));

  /** m_stretchEvent (std::wstring) [READWRITE, PERSIST] */
  stretchEvent = (_init_extra_outburstEvent(this), _init_stretchEvent(this, ""));
  static {
    _initClass();
  }
}

export { _Tr2AudioStretchAuto as Tr2AudioStretchAuto };
//# sourceMappingURL=Tr2AudioStretchAuto.js.map
