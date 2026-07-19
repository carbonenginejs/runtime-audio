import { applyDecs2311 as _applyDecs2311 } from '../../_virtual/_rollupPluginBabelHelpers.js';
import { impl, carbon, type } from '@carbonenginejs/core-types/schema';
import { vec3 } from '@carbonenginejs/core-math/vec3';
import { AudGameObjResource as _AudGameObjResource } from './AudGameObjResource.js';
import { LISTENER_GAME_OBJ_ID } from './SoundPrioritization.js';

let _initProto, _initClass;
const FLOAT_MAX = 3.4028234663852886e38;

/** AudListener (audio) - the singleton ears; fixed id 4, never culled by prioritization. */
let _AudListener;
class AudListener extends _AudGameObjResource {
  static {
    ({
      e: [_initProto],
      c: [_AudListener, _initClass]
    } = _applyDecs2311(this, [type.define({
      className: "AudListener",
      family: "audio"
    })], [[[void 0, carbon.renamed("SetPosition"), impl, impl.implemented], 18, "SetPosition"], [[carbon, carbon.method, impl, impl.adapted, void 0, impl.reason("Backend push (RH2LH::convertListener + default-listener registration) is realization; the headless graph stores the position.")], 18, "SetPositionHelper"]], 0, void 0, _AudGameObjResource));
  }
  constructor() {
    // Carbon: AudGameObjResource(LISTENER_GAME_OBJ_ID) - fixed id must be set
    // before manager registration; name "Listener", FLT_MAX additional weight
    // so the listener always sorts first.
    _initProto(super(LISTENER_GAME_OBJ_ID));
    this.name = "Listener";
    this.additionalCullingWeight = FLOAT_MAX;
  }

  /** Carbon method SetPosition -> SetPositionHelper (Blue mapping). */
  SetPosition(front, top, position) {
    return this.SetPositionHelper(front, top, position);
  }

  /** Carbon override: listener stores position with a looser gate and uses the listener RH->LH flip. */
  SetPositionHelper(front, top, positionValue) {
    vec3.copy(this.position, positionValue);
    _AudGameObjResource.backend?.SetListenerPosition?.(this.ID, front, top, positionValue);
    return 1;
  }
  static {
    _initClass();
  }
}

export { _AudListener as AudListener };
//# sourceMappingURL=AudListener.js.map
