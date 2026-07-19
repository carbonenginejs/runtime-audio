// Ported from CarbonEngine (MIT, (c) 2026 CCP Games) - https://github.com/carbonengine/trinity
//   audio/src/AudListener.h + AudListener.cpp
// Hand-owned since 2026-07-18 (behavior port); the generator skips this file.
// Verify against audio/AudListener.json.
import { carbon, impl, type } from "@carbonenginejs/core-types/schema";
import { vec3 } from "@carbonenginejs/core-math/vec3";
import { AudGameObjResource } from "./AudGameObjResource.js";
import { LISTENER_GAME_OBJ_ID } from "./SoundPrioritization.js";

const FLOAT_MAX = 3.4028234663852886e38;

/** AudListener (audio) - the singleton ears; fixed id 4, never culled by prioritization. */
@type.define({ className: "AudListener", family: "audio" })
export class AudListener extends AudGameObjResource
{

  constructor()
  {
    // Carbon: AudGameObjResource(LISTENER_GAME_OBJ_ID) - fixed id must be set
    // before manager registration; name "Listener", FLT_MAX additional weight
    // so the listener always sorts first.
    super(LISTENER_GAME_OBJ_ID);
    this.name = "Listener";
    this.additionalCullingWeight = FLOAT_MAX;
  }

  /** Carbon method SetPosition -> SetPositionHelper (Blue mapping). */
  @carbon.renamed("SetPosition")
  @impl.implemented
  SetPosition(front, top, position)
  {
    return this.SetPositionHelper(front, top, position);
  }

  /** Carbon override: listener stores position with a looser gate and uses the listener RH->LH flip. */
  @carbon.method
  @impl.adapted
  @impl.reason("Backend push (RH2LH::convertListener + default-listener registration) is realization; the headless graph stores the position.")
  SetPositionHelper(front, top, positionValue)
  {
    vec3.copy(this.position, positionValue);
    AudGameObjResource.backend?.SetListenerPosition?.(this.ID, front, top, positionValue);
    return 1;
  }

}
