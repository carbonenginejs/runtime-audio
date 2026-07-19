import { applyDecs2311 as _applyDecs2311 } from '../../_virtual/_rollupPluginBabelHelpers.js';
import { io, type } from '@carbonenginejs/core-types/schema';
import { CjsModel } from '@carbonenginejs/core-types/model';

let _initClass, _init_stretchEmitter, _init_extra_stretchEmitter, _init_destinationEmitter, _init_extra_destinationEmitter, _init_sourceEmitter, _init_extra_sourceEmitter;

/** Tr2AudioStretchBase (trinityAudio) - generated from schema shapeHash f6d14e40.... */
let _Tr2AudioStretchBase;
class Tr2AudioStretchBase extends CjsModel {
  static {
    ({
      e: [_init_stretchEmitter, _init_extra_stretchEmitter, _init_destinationEmitter, _init_extra_destinationEmitter, _init_sourceEmitter, _init_extra_sourceEmitter],
      c: [_Tr2AudioStretchBase, _initClass]
    } = _applyDecs2311(this, [type.define({
      className: "Tr2AudioStretchBase",
      family: "trinityAudio"
    })], [[[io, io.persist, void 0, type.model("ITr2AudEmitter")], 16, "stretchEmitter"], [[io, io.persist, void 0, type.model("ITr2AudEmitter")], 16, "destinationEmitter"], [[io, io.persist, void 0, type.model("ITr2AudEmitter")], 16, "sourceEmitter"]], 0, void 0, CjsModel));
  }
  constructor(...args) {
    super(...args);
    _init_extra_sourceEmitter(this);
  }
  /** m_stretchEmitter (ITr2AudEmitterPtr) [READWRITE, PERSIST] */
  stretchEmitter = _init_stretchEmitter(this, null);

  /** m_destEmitter (ITr2AudEmitterPtr) [READWRITE, PERSIST] */
  destinationEmitter = (_init_extra_stretchEmitter(this), _init_destinationEmitter(this, null));

  /** m_sourceEmitter (ITr2AudEmitterPtr) [READWRITE, PERSIST] */
  sourceEmitter = (_init_extra_destinationEmitter(this), _init_sourceEmitter(this, null));
  static {
    _initClass();
  }
}

export { _Tr2AudioStretchBase as Tr2AudioStretchBase };
//# sourceMappingURL=Tr2AudioStretchBase.js.map
