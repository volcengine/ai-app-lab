import { Animation, Spritesheet } from '@rpgjs/client'
import { Direction } from '@rpgjs/common'

const LPCSpritesheetPreset = () => {
    const frameY = (direction: Direction) => {
        return {
            [Direction.Down]: 2,
            [Direction.Left]: 1,
            [Direction.Right]: 3,
            [Direction.Up]: 0
        }[direction]
    }

    const stand = (direction: Direction) => [{ time: 0, frameX: 1, frameY: frameY(direction) }]
    const anim = (direction: Direction, framesWidth: number, speed: number = 5) => {
        const array: any = []
        for (let i = 0; i < framesWidth; i++) {
            array.push({ time: i * speed, frameX: i, frameY: frameY(direction) })
        }
        return array
    }

    return {
        rectWidth: 192,
        rectHeight: 192,
        spriteRealSize: {
            width: 40,
            height: 40,
        },
        framesWidth: 8,
        framesHeight: 4,
        textures: {
            [Animation.Attack]: {
                offset: {
                    x: 0,
                    y: 0,
                },
                framesWidth: 8,
                framesHeight: 4,
                animations: (direction: Direction) => [anim(direction, 8, 3)]
            }
        },
    }
}

@Spritesheet({
    ...LPCSpritesheetPreset(),
})
export default class LPCSpritesheet {
}
