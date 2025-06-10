import { type RpgSceneMapHooks, RpgSceneMap, Control, inject, RpgClientEngine } from '@rpgjs/client'

const sceneMap: RpgSceneMapHooks = {
    onAfterLoading(scene: RpgSceneMap) {
        scene.viewport?.setZoom(0.5) 
    }
}

export default sceneMap