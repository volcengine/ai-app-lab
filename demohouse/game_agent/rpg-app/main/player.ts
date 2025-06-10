import { RpgPlayer, type RpgPlayerHooks, Control, Components } from '@rpgjs/server'

const graphics = ['pale-green-body', 'pale-green-head', 'pale-green-wings', 'pale-green-wings-fg', 'dark-grey-coat', 'boots-black', 'hood-black'];

declare module '@rpgjs/server' {
    export interface RpgPlayer {
        wood: number;
        graphic: string;
        equip_sword?: boolean; // 用于表示是否有拿到剑
        isAttacking?: boolean;    // 用于追踪是否处于猫形态
        maxHp?: number;
    }
}

const player: RpgPlayerHooks = {
    props: {
        wood: Number,
        graphic: String,
        equip_sword: Boolean, // 用于表示是否有拿到剑
        isAttacking: Boolean,   // 将其设为 prop
        maxHp: Number,
    },
    onConnected(player: RpgPlayer) {
        // // player.setGraphic(graphics);
        // player.setGraphic('');
        // player.id = 'user1';
        player.addParameter('maxHp', {
            start: 100, // level 1
            end: 500 // final level
        })
        player.name = '用户';
        player.hp = 100;
          
        player.setComponentsTop(
            [Components.hpBar(), 
             // Components.text('\nX:{position.x} Y:{position.y}\n'),  
             Components.text('{name}', {
                    fill: '#000000',
                    fontSize: 20,
            })],
        );
        
        
    },

    onInput(player: RpgPlayer, { input }) {
        if (input == Control.Back) {
            player.callMainMenu();
        }

        if (input === Control.Attack) {
            player.showAnimation('main_char_attack', 'attack', true);
        }

        // console.log('当前输入的 input 值为:', input);
        // 下面这块逻辑暂时不需要
        // 使用自定义按键Z触发攻击特效
        // if (input === 'z' && !player.isAttacking) { 
        //     player.isAttacking = true; // 进入攻击状态，防止重复触发

        //     // 1. 保存当前图像作为原始图像
        //     // 确保 originalGraphic 保存的是攻击前的真实图像，而不是上一次攻击的图像
        //     // 我们用 'cat' 作为攻击图像的占位符
        //     if (player.graphic !== 'cat') { // 只有当当前图像不是攻击图像时才更新 originalGraphic
        //         player.originalGraphic = player.graphic;
        //     } else if (!player.originalGraphic) {
        //         // 如果当前已经是 'cat' 但 originalGraphic 未设置 (不太可能发生，但作为保险)
        //         // 你可能需要一个默认的非攻击图像ID
        //         player.originalGraphic = "male-04-1"; // 或者从配置读取默认图像
        //     }
            
        //     // 2. 设置为攻击图像
        //     player.setGraphic('cat'); // 将 'cat' 替换为你的实际攻击图像ID

        //     // 3. 短暂延迟后恢复原状
        //     setTimeout(() => {
        //         if (player.originalGraphic) {
        //             player.setGraphic(player.originalGraphic);
        //         }
        //         player.setGraphic("Male-04-1"); // 恢复到原始图像
        //         player.isAttacking = false; // 退出攻击状态，允许下一次攻击
        //     }, 300); // 攻击动画持续时间（毫秒），例如300ms，请根据你的动画调整
        // }
    },
    async onJoinMap(player: RpgPlayer) {
        // 确保在加入地图时，如果 originalGraphic 未设置，则进行设置
        if (!player.originalGraphic && player.graphic) {
            player.originalGraphic = player.graphic;
        }
        if (typeof player.isAttacking === 'undefined') {
            player.isAttacking = false;
        }

        // if (player.getVariable('AFTER_INTRO')) {
        //     return
        // }
        // await player.showText('Welcome to the start of RPGJS. Short presentation of the structure:')
        // await player.showText('1. Open the map src/modules/main/server/maps/tmx/samplemap.tmx with Tiled Map Editor !')
        // await player.showText('2. All the modules are in src/modules/index.ts, it is a suite of systems to make a complete set. Remove modules or add some!')
        // await player.showText('3. The global configuration is done in src/config')
        // await player.showText('And, please, support the project on github https://github.com/RSamaium/RPG-JS ! :)')
        // player.setVariable('AFTER_INTRO', true)
    }
}

export default player