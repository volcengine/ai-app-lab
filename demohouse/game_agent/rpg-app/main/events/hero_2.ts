import { RpgEvent, EventData, RpgPlayer, Move, Components, Speed, ShapePositioning } from '@rpgjs/server'


@EventData({
    name: 'hero_2'
})
export default class HeroEvent_2 extends RpgEvent {
    // 声明类属性
    private attackPower: number = 5;
    private lastAttackTime: number = 0;
    private attackCooldown: number = 1000; // 1秒攻击冷却

    onInit() {
        this.setGraphic('hero_2_walk')
        this.setHitbox(16, 16)
        this.name = '无镜和尚'
        this.setComponentsTop(Components.text('{name}', {
            fill: '#000000',
            fontSize: 20,
        }))
        this.speed = Speed.Slowest // 设置移动速度，数值越小速度越快，RPGJS默认速度可能是3或4，1会比较快
        this.frequency = 10 //    设置移动频率，单位是毫秒，400ms移动一次
        // this.infiniteMoveRoute([ Move.tileRandom() ])
        // 设置敌人属性
        this.hp = 50; // 敌人的生命值
    }

    //  // 当玩家接触到此事件时调用
    // async onPlayerTouch(player: RpgPlayer) {
    //     const now = Date.now();
    //     if (now - this.lastAttackTime < this.attackCooldown) {
    //         return; // 如果攻击仍在冷却中，则不执行任何操作
    //     }
    //     this.lastAttackTime = now; // 更新上次攻击时间
    //     console.log('enemy_2_attack')
    //     setTimeout(() => {
    //         this.showAnimation('hero_2_attack', 'attack', false);
    //     }, 300); // 攻击动画持续时间（毫秒），例如300ms，请根据你的动画调整

    //     const damage = this.attackPower;
    //     player.hp -= damage; // 修改此行：直接扣除玩家HP

    //     // 检查玩家是否被击败
    //     if (player.hp <= 0) {
    //         await player.showText('你被击败了!', { talkWith: this });
    //         // 此处可以添加更多玩家被击败后的逻辑，例如游戏结束、角色重生等
    //         // player.respawn(); // 示例：重生玩家
    //     }
    // }

    async onAction(player: RpgPlayer) {
        await player.showText('无镜和尚：那把剑就在树下')
    }
}