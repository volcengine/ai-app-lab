import { RpgEvent, EventData, RpgPlayer } from '@rpgjs/server'

@EventData({
    name: 'sword_event'
})
export default class SwordEvent extends RpgEvent {
    onInit() {
        this.setGraphic('sword') // 使用对应的图像资源
        this.setHitbox(16, 16) // 设置碰撞框
    }

    async onPlayerTouch(player: RpgPlayer) {
        // 显示提示信息
        await player.showText('获得了长剑!')
        // 从地图上消失
        this.remove()
        player.setGraphic('main_char_walk_with_sword')
    }
}