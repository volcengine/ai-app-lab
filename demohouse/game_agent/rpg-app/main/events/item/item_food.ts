import { RpgEvent, EventData, RpgPlayer } from '@rpgjs/server'

@EventData({
    name: 'food_event'
})
export default class FoodEvent extends RpgEvent {
    onInit() {
        this.setGraphic('food') // 使用对应的图像资源
        this.setHitbox(16, 16) // 设置碰撞框
    }

    async onPlayerTouch(player: RpgPlayer) {
        // 显示提示信息
        await player.showText('成功获取了食物！hp提升')
        player.hp += 20
        // 从地图上消失
        this.remove()
    }
}