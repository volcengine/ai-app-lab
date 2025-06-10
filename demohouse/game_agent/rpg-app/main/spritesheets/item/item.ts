import { Spritesheet, Animation } from '@rpgjs/client'

const to = () => {
    const array: any = [];
    let k = 0;
    const durationFrame = 2;
    for (let j = 0; j < 1; j++) {
        array.push({ time: k * durationFrame, frameX: j, frameY: 0 });
        k++;
    }
    array.push({ time: k * durationFrame });
    return array;
}
@Spritesheet({
    framesWidth: 1,
    framesHeight: 1,
    width: 135,
    height: 16,
    opacity: 1,
    anchor: [0.5],
    textures: {
        [Animation.Stand]: {
            animations: () => [to()]
        },
    }
})
export default class ItemAnimations { }