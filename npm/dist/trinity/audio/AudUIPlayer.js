import { applyDecs2311 as _applyDecs2311 } from '../../_virtual/_rollupPluginBabelHelpers.js';
import { io, carbon, impl, type } from '@carbonenginejs/core-types/schema';
import { CjsModel } from '@carbonenginejs/core-types/model';

let _initProto, _initClass, _init_eventSenderCallback, _init_extra_eventSenderCallback;

/** AudUIPlayer (audio) - generated from schema shapeHash 81f49333.... */
let _AudUIPlayer;
class AudUIPlayer extends CjsModel {
  static {
    ({
      e: [_init_eventSenderCallback, _init_extra_eventSenderCallback, _initProto],
      c: [_AudUIPlayer, _initClass]
    } = _applyDecs2311(this, [type.define({
      className: "AudUIPlayer",
      family: "audio"
    })], [[[io, io.readwrite, void 0, type.rawStruct("BlueScriptCallback")], 16, "eventSenderCallback"], [[carbon, carbon.method, impl, impl.notImplemented], 18, "GetEventPlayPosition"], [[carbon, carbon.method, impl, impl.notImplemented], 18, "PostDialogueEvent"], [[carbon, carbon.method, impl, impl.notImplemented], 18, "SendEventWithCallback"]], 0, void 0, CjsModel));
  }
  constructor(...args) {
    super(...args);
    _init_extra_eventSenderCallback(this);
  }
  /** m_callback (BlueScriptCallback) [READWRITE] */
  eventSenderCallback = (_initProto(this), _init_eventSenderCallback(this, null));

  /** Carbon method GetEventPlayPosition (MAP_METHOD_AND_WRAP). */
  GetEventPlayPosition(...args) {
    throw new Error("AudUIPlayer.GetEventPlayPosition is not implemented in CarbonEngineJS.");
  }

  /** Carbon method PostDialogueEvent (MAP_METHOD_AND_WRAP). */
  PostDialogueEvent(...args) {
    throw new Error("AudUIPlayer.PostDialogueEvent is not implemented in CarbonEngineJS.");
  }

  /** Carbon method SendEventWithCallback (MAP_METHOD_AND_WRAP). */
  SendEventWithCallback(...args) {
    throw new Error("AudUIPlayer.SendEventWithCallback is not implemented in CarbonEngineJS.");
  }
  static {
    _initClass();
  }
}

export { _AudUIPlayer as AudUIPlayer };
//# sourceMappingURL=AudUIPlayer.js.map
