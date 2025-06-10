import { Spritesheet, Presets } from '@rpgjs/client'

const { RMSpritesheet } = Presets

@Spritesheet({
    ...RMSpritesheet(3, 4)
})
export default class Characters { }