/*
 * Copyright (c) 2025 Bytedance Ltd. and/or its affiliates
 * Licensed under the 【火山方舟】原型应用软件自用许可协议
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at 
 *     https://www.volcengine.com/docs/82379/1433703
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import React, { useState, useRef, useEffect, useMemo } from 'react';
import Konva from 'konva';
import { Group, Image as KonvaImage, Path } from 'react-konva';
import { parseSVG } from 'svg-path-parser';
import useImage from 'use-image';

export interface PathRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PuzzlePieceProps {
  imageUrl: string;
  path: string; // SVG path 属性
  scale: number; // 缩放系数
  onClick?: () => void;
  onLoaded?: () => void;
}

export const PuzzlePiece: React.FC<PuzzlePieceProps> = ({ path, scale, imageUrl, onClick, onLoaded }) => {
  const imageRef = useRef<Konva.Image>(null);
  const pathRef = useRef<Konva.Path | null>(null);
  const [image, status] = useImage(imageUrl, 'anonymous');
  const [isLoaded, setIsLoaded] = useState(false);
  const [commands, setCommands] = useState(parseSVG(path));
  //   const commands = makeAbsolute(parseSVG(path));

  const [rect, setRect] = useState<PathRect>({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  });

  const { drawW, drawH, offsetX, offsetY } = useMemo(() => {
    if (image) {
      return computeImageFitCover(image, rect.width, rect.height);
    }
    return { drawW: 0, drawH: 0, offsetX: 0, offsetY: 0 };
  }, [image, rect.width, rect.height]);

  const handleEnter = () => {
    if (imageRef.current) {
      // setCursorStyle('pointer');

      // imageRef.current.moveToTop();
      // imageRef.current
      //   .getLayer()
      //   ?.getChildren()
      //   .forEach(node => {
      //     if (node !== imageRef.current) {
      //       node.to({
      //         opacity: 0.5,
      //         duration: 0.2,
      //       });
      //     }
      //   });

      const node = imageRef.current;
      const scale = 1.05;

      new Konva.Tween({
        node,
        duration: 0.3,
        scaleX: scale,
        scaleY: scale,
        // 关键补偿：让中心保持不动
        x: node.x() - (node.width() * (scale - 1)) / 2,
        y: node.y() - (node.height() * (scale - 1)) / 2,
        easing: Konva.Easings.EaseOut,
      }).play();
    }
  };

  const handleLeave = () => {
    if (imageRef.current) {
      // setCursorStyle('default');

      // imageRef.current
      //   .getLayer()
      //   ?.getChildren()
      //   .forEach(node => {
      //     if (node !== imageRef.current) {
      //       node.to({
      //         opacity: 1,
      //         duration: 0.2,
      //       });
      //     }
      //   });

      const node = imageRef.current;

      new Konva.Tween({
        node,
        duration: 0.3,
        scaleX: 1,
        scaleY: 1,
        // 还原位置
        x: node.x() + (node.width() * (node.scaleX() - 1)) / 2,
        y: node.y() + (node.height() * (node.scaleY() - 1)) / 2,
        easing: Konva.Easings.EaseOut,
      }).play();
    }
  };

  useEffect(() => {
    if (pathRef.current) {
      const rect = pathRef.current.getClientRect();
      setRect({
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      });
    }
  }, [path, scale, image]);

  useEffect(() => {
    path && setCommands(parseSVG(path));
  }, [path]);

  useEffect(() => {
    setIsLoaded(false);
  }, [imageUrl]);

  useEffect(() => {
    if (status === 'loaded' && !isLoaded) {
      setIsLoaded(true);
      onLoaded?.();
    }
  }, [status, isLoaded, onLoaded]);

  return (
    <Group
      onClick={onClick}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      clipFunc={(ctx) => {
        let currentX = 0;
        let currentY = 0;
        ctx.beginPath();
        commands.forEach((cmd) => {
          switch (cmd.code) {
            case 'M':
              ctx.moveTo(cmd.x * scale, cmd.y * scale);
              currentX = cmd.x * scale;
              currentY = cmd.y * scale;
              break;
            case 'm':
              currentX += cmd.x * scale;
              currentY += cmd.y * scale;
              ctx.moveTo(currentX, currentY);
              break;

            case 'L':
              ctx.lineTo(cmd.x * scale, cmd.y * scale);
              currentX = cmd.x * scale;
              currentY = cmd.y * scale;
              break;
            case 'l':
              currentX += cmd.x * scale;
              currentY += cmd.y * scale;
              ctx.lineTo(currentX, currentY);
              break;

            case 'H':
              ctx.lineTo(cmd.x * scale, currentY);
              currentX = cmd.x * scale;
              break;
            case 'h':
              currentX += cmd.x * scale;
              ctx.lineTo(currentX, currentY);
              break;

            case 'V':
              ctx.lineTo(currentX, cmd.y * scale);
              currentY = cmd.y * scale;
              break;
            case 'v':
              currentY += cmd.y * scale;
              ctx.lineTo(currentX, currentY);
              break;

            case 'C':
              ctx.bezierCurveTo(
                cmd.x1 * scale,
                cmd.y1 * scale,
                cmd.x2 * scale,
                cmd.y2 * scale,
                cmd.x * scale,
                cmd.y * scale,
              );
              currentX = cmd.x * scale;
              currentY = cmd.y * scale;
              break;
            case 'c':
              ctx.bezierCurveTo(
                currentX + cmd.x1 * scale,
                currentY + cmd.y1 * scale,
                currentX + cmd.x2 * scale,
                currentY + cmd.y2 * scale,
                currentX + cmd.x * scale,
                currentY + cmd.y * scale,
              );
              currentX += cmd.x * scale;
              currentY += cmd.y * scale;
              break;

            // 其他 Q/q, S/s, T/t, A/a, Z/z 按照相对/绝对分别实现
            case 'Z':
            case 'z':
              ctx.closePath();
              break;

            default:
              console.warn('Unsupported SVG command:', cmd.code, cmd);
          }
        });
      }}
    >
      <KonvaImage
        ref={imageRef}
        image={image}
        x={rect.x + offsetX}
        y={rect.y + offsetY}
        width={drawW}
        height={drawH}
        // x={minX}
        // y={minY}
        // width={width}
        // height={height}
      />
      <Path
        ref={pathRef}
        data={path}
        scale={{ x: scale, y: scale }}
        visible={false}
        lineJoin="round"
        lineCap="round"
        stroke="#ffd54f"
        shadowColor="#ffd54f"
        strokeWidth={6}
        shadowBlur={10}
        shadowOpacity={0.8}
      />
    </Group>
  );
};

function computeImageFitCover(img: HTMLImageElement, containerW: number, containerH: number) {
  const imgRatio = img.width / img.height;
  const containerRatio = containerW / containerH;

  let drawW: number, drawH: number;

  if (imgRatio > containerRatio) {
    // 图片更宽：高度对齐，宽度超出后居中裁剪
    drawH = containerH;
    drawW = containerH * imgRatio;
  } else {
    // 图片更窄：宽度对齐，高度超出后居中裁剪
    drawW = containerW;
    drawH = containerW / imgRatio;
  }

  // 保证宽高都 >= 容器宽高
  if (drawW < containerW) {
    const scale = containerW / drawW;
    drawW *= scale;
    drawH *= scale;
  }
  if (drawH < containerH) {
    const scale = containerH / drawH;
    drawW *= scale;
    drawH *= scale;
  }

  // 居中：偏移量 = -一半的绘制尺寸
  const offsetX = (containerW - drawW) / 2;
  const offsetY = (containerH - drawH) / 2;

  return { drawW, drawH, offsetX, offsetY };
}
