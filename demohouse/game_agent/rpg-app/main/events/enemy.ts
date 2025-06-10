import { RpgEvent, EventData, RpgPlayer, Move, Components, Speed, ShapePositioning } from '@rpgjs/server'

@EventData({
    name: 'enemy_2'
})
export default class CharaEvent2 extends RpgEvent {
    // 声明类属性
    private attackPower: number = 5;
    private lastAttackTime: number = 0;
    private attackCooldown: number = 1000; // 1秒攻击冷却
    onInit() {
        this.setGraphic('enemy_2_walk')
        this.setHitbox(16, 16)
        this.name = '东方御尊'
        this.addParameter('maxHp', {
            start: 200, // level 1
            end: 500 // final level
        })
        this.hp = 200;
        this.setComponentsTop(
            [Components.hpBar(),  Components.text('{name}', {
                fill: '#000000',
                fontSize: 20,
        })]
        );
        this.speed = Speed.Slower // 设置移动速度，数值越小速度越快，RPGJS默认速度可能是3或4，1会比较快
        this.frequency = 10 //    设置移动频率，单位是毫秒，400ms移动一次
        // this.infiniteMoveRoute([ Move.tileRandom() ])
        // 设置敌人属性
        setTimeout(() => {
            this.showAnimation('enemy_2_attack', 'attack', true);
        }, 300);

        this.attachShape({
            height: 500,
            width: 500,
            positioning: ShapePositioning.Center
        })
    }

    onDetectInShape(player: RpgPlayer) {
        console.log('in', player.id);
        if (player.name === '用户') {
            console.log('move to player')
            this.moveTo(player).subscribe()
        }
    }

    // 当玩家接触到此事件时调用
    async onPlayerTouch(player: RpgPlayer) {
        const now = Date.now();
        if (now - this.lastAttackTime < this.attackCooldown) {
            return; // 如果攻击仍在冷却中，则不执行任何操作
        }
        this.hp -= 20;
        if (this.hp <= 0) {
            await player.showText('你打败了东方御尊!', { talkWith: this });
        }
        this.lastAttackTime = now; // 更新上次攻击时间
        console.log('enemy_2_attack')
        setTimeout(() => {
            this.showAnimation('enemy_2_attack', 'attack', true);
        }, 300); // 攻击动画持续时间（毫秒），例如300ms，请根据你的动画调整

        const damage = this.attackPower;
        player.hp -= damage; // 修改此行：直接扣除玩家HP

        // 检查玩家是否被击败
        if (player.hp <= 0) {
            await player.showText('你被击败了!', { talkWith: this });
            // 此处可以添加更多玩家被击败后的逻辑，例如游戏结束、角色重生等
            // player.respawn(); // 示例：重生玩家
        }
    }

    async onAction(player: RpgPlayer) {
        await player.showText('我乃是东方御尊')
    }
}