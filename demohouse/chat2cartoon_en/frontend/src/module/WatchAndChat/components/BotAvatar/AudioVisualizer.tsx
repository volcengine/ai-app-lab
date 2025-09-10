// Copyright (c) 2025 Bytedance Ltd. and/or its affiliates
// Licensed under the 【火山方舟】原型应用软件自用许可协议
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at 
//     https://www.volcengine.com/docs/82379/1433703
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { useContext, useEffect, useRef } from 'react';

import { useWatchAndChatMachine } from '../../providers/MachineProvider/useWatchAndChatMachine';
import { WatchAndChatContext } from '../../providers/WatchAndChatProvider/context';

interface Circle {
  radius: number; // 圆形半径
  opacity: number; // 基础透明度
  color: string; // 圆形颜色
}

export function AudioVisualizer() {
  const { state } = useWatchAndChatMachine();
  const { analyserRef } = useContext(WatchAndChatContext);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();

  // 定义三个同心圆的基本属性
  const circlesRef = useRef<Circle[]>([
    { radius: 60, opacity: 0.6, color: '#ffffff' }, // 最外层圆形（低频）- 蓝色
    { radius: 50, opacity: 0.7, color: '#ffffff' }, // 中间圆形（中频）- 青色
    { radius: 40, opacity: 0.8, color: '#ffffff' }, // 最内层圆形（高频）- 橙色
  ]);

  useEffect(() => {
    const isPlaying = state.matches('Chat.BotSpeaking') || state.matches('BotWelcome');
    if (!isPlaying) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext('2d');
    const analyser = analyserRef.current;
    if (!ctx || !analyser) {
      return;
    }

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      if (!isPlaying || !analyserRef.current) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
      }

      const { width } = canvas;
      const { height } = canvas;
      const centerX = width / 2;
      const centerY = height / 2;

      // 获取音频数据
      analyserRef.current.getByteFrequencyData(dataArray);

      // 计算不同频段的音频强度
      // 低频：取前10个频率样本
      const bassIntensity = dataArray.slice(0, 10).reduce((acc, val) => acc + val, 0) / 2550;
      // 中频：取10-100的频率样本
      const midIntensity = dataArray.slice(10, 100).reduce((acc, val) => acc + val, 0) / 22950;
      // 高频：取100-200的频率样本
      const trebleIntensity = dataArray.slice(100, 200).reduce((acc, val) => acc + val, 0) / 25500;

      // 清空画布
      ctx.clearRect(0, 0, width, height);

      // 从外到内绘制圆形
      circlesRef.current.forEach((circle, i) => {
        // 根据音频强度计算实际半径
        const intensity = i === 0 ? bassIntensity : i === 1 ? midIntensity : trebleIntensity;
        const pulseRadius = circle.radius + intensity * 40;

        // 绘制主要圆形
        ctx.beginPath();
        ctx.arc(centerX, centerY, pulseRadius, 0, Math.PI * 2);
        // 设置填充颜色，透明度随音频强度变化
        ctx.fillStyle = `${circle.color}${Math.floor(circle.opacity * intensity * 255)
          .toString(16)
          .padStart(2, '0')}`;
        ctx.fill();
      });

      animationRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [analyserRef, state.value]);

  return (
    <canvas
      ref={canvasRef}
      width={300}
      height={300}
      className="z-10 w-[300px] h-[300px] absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2"
    />
  );
}
