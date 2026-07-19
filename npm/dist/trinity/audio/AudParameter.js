import { applyDecs2311 as _applyDecs2311 } from '../../_virtual/_rollupPluginBabelHelpers.js';
import { io, type } from '@carbonenginejs/core-types/schema';
import { CjsModel } from '@carbonenginejs/core-types/model';

let _initClass, _init_name, _init_extra_name, _init_value, _init_extra_value;

/** AudParameter (audio) - generated from schema shapeHash daad2621.... */
let _AudParameter;
class AudParameter extends CjsModel {
  static {
    ({
      e: [_init_name, _init_extra_name, _init_value, _init_extra_value],
      c: [_AudParameter, _initClass]
    } = _applyDecs2311(this, [type.define({
      className: "AudParameter",
      family: "audio"
    })], [[[io, io.readwrite, type, type.string], 16, "name"], [[io, io.notify, io, io.readwrite, type, type.float32], 16, "value"]], 0, void 0, CjsModel));
  }
  constructor(...args) {
    super(...args);
    _init_extra_value(this);
  }
  /** m_name (std::wstring) [READWRITE] */
  name = _init_name(this, "");

  /** m_value (float) [READWRITE, NOTIFY] */
  value = (_init_extra_name(this), _init_value(this, 0));
  static {
    _initClass();
  }
}

export { _AudParameter as AudParameter };
//# sourceMappingURL=AudParameter.js.map
