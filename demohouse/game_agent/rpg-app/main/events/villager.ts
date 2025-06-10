// import { RpgEvent, EventData, RpgPlayer } from '@rpgjs/server'

// @EventData({
//     name: 'EV-1', 
//     hitbox: {
//         width: 32,
//         height: 16
//     }
// })
// export default class VillagerEvent extends RpgEvent {
//     onInit() {
//         this.setGraphic('female')
//     }
//     async onAction(player: RpgPlayer) {
//         await player.showText('I give you 10 gold.', {
//             talkWith: this
//         })
//         player.gold += 10
//     }
// } 

import { RpgEvent, EventData, RpgPlayer, Move } from '@rpgjs/server'

@EventData({
    name: 'villager_1'
})
export default class CharaEvent1 extends RpgEvent {
    onInit() {
        this.setGraphic('Female 10-1')
        this.setHitbox(16, 16)
        this.speed = 5 // 设置移动速度，数值越小速度越快，RPGJS默认速度可能是3或4，1会比较快
        this.frequency = 50 // 设置移动频率，单位是毫秒，400ms移动一次
        this.infiniteMoveRoute([ Move.tileRandom() ])
    }
    async onAction(player: RpgPlayer) {
        await player.showText('you are my hero!')
    }
}