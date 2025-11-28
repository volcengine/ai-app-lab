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

import {
  useState,
  useEffect,
  useRef,
  useImperativeHandle,
  forwardRef,
  Ref,
} from "react";
import Konva from "konva";
import { Stage, Layer, Rect } from "react-konva";
import { PuzzlePiece } from "./PuzzlePiece";

export interface Piece {
  path: string; // SVG path d 属性
}

export interface Template {
  width: number; // 设计稿的基准宽度
  height: number; // 设计稿的基准高度
  pieces: Piece[]; // 拼图区块路径
}

export interface PuzzleBoardProps {
  width: number; // 实际宽度
  height: number; // 实际高度
  images: string[]; // 图片链接
  template: Template; // 拼图模板
  style?: { radius?: string; background?: string };
  onClick?: (index: number, imageUrl: string) => void;
  onLoaded?: (dataURL: string) => void;
  onReady?: (puzzle: PuzzleBoardRef) => void;
  getContainer?: () => HTMLElement | null;
}

export interface PuzzleBoardRef {
  getDataURL: (options?: ExportOptions) => string | undefined;
  getBlob: (options?: ExportOptions) => Promise<unknown> | undefined;
}

export interface ExportOptions {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  mimeType?: string; // 可选，默认 'image/png'
  pixelRatio?: number; // 可选，导出时放大倍数
  callback?: (blobOrDataURL: Blob | string | null) => void;
}

export const PuzzleBoard = forwardRef<PuzzleBoardRef, PuzzleBoardProps>(
  (
    {
      width,
      height,
      images,
      template,
      style,
      onClick,
      onLoaded,
      onReady,
      getContainer,
    },
    ref: Ref<PuzzleBoardRef>
  ) => {
    const [stageWidth, setStageWidth] = useState(width);
    const [stageHeight, setStageHeight] = useState(height);
    const { width: baseWidth, height: baseHeight, pieces = [] } = template;
    const scale = Math.abs(
      Math.min(stageWidth / baseWidth, stageHeight / baseHeight)
    );
    const stageRef = useRef<Konva.Stage>(null);
    const methodRef = useRef<Pick<PuzzleBoardProps, "onLoaded" | "onReady">>(
      {}
    );
    const [loaded, setLoaded] = useState<number[]>([]);
    const isReady = loaded.length === pieces.length;

    methodRef.current = { onLoaded, onReady };

    const puzzle: PuzzleBoardRef = {
      getDataURL: (options?: ExportOptions) => {
        if (stageRef.current && isReady) {
          stageRef.current.draw();
          return stageRef.current?.toDataURL({ pixelRatio: 2, ...options });
        }
      },
      getBlob: async (options?: ExportOptions) => {
        if (stageRef.current && isReady) {
          stageRef.current.draw();
          return stageRef.current.toBlob({ pixelRatio: 2, ...options });
        }
        return Promise.resolve();
      },
    };

    useImperativeHandle(ref, () => puzzle);

    useEffect(() => {
      setLoaded([]);
    }, [pieces.length]);

    useEffect(() => {
      const { onLoaded, onReady } = methodRef.current;

      if (onReady && isReady) {
        setTimeout(() => onReady(puzzle), 0);
      }

      if (onLoaded && isReady) {
        stageRef.current?.draw();
        setTimeout(
          () => onLoaded(stageRef.current?.toDataURL({ pixelRatio: 2 }) || ""),
          0
        );
      }
    }, [isReady]);

    useEffect(() => {
      const handleResize = () => {
        const container = getContainer?.();
        if (container) {
          const size = calculateImageSize(
            container.clientWidth,
            container.clientHeight,
            baseWidth,
            baseHeight
          );
          setStageWidth(size.width);
          setStageHeight(size.height);
        }
      };
      handleResize();
      window.addEventListener("resize", handleResize);
      return () => window.removeEventListener("resize", handleResize);
    }, [getContainer, baseWidth, baseHeight]);

    return (
      <Stage ref={stageRef} width={stageWidth} height={stageHeight}>
        <Layer>
          {/* 背景层 */}
          <Rect
            x={0}
            y={0}
            width={stageWidth}
            height={stageHeight}
            fill={style?.background} // 背景色
            cornerRadius={parseFloat(style?.radius ?? "8") * scale || 0} // 圆角
            listening={false} // 不响应事件，避免挡住子元素
          />
          {pieces.map((p, i) => (
            <PuzzlePiece
              key={i}
              path={p.path}
              scale={scale}
              imageUrl={images[i]}
              onClick={() => onClick?.(i, images[i])}
              onLoaded={() => {
                setLoaded((prev) => (prev.includes(i) ? prev : [...prev, i]));
              }}
            />
          ))}
        </Layer>
      </Stage>
    );
  }
);

/**
 * 计算图片在容器中的最佳尺寸（保持比例，尽可能铺满）
 * @param {number} containerWidth - 容器宽度
 * @param {number} containerHeight - 容器高度（可选，用于避免高度溢出）
 * @param {number} originalWidth - 图片原始宽度
 * @param {number} originalHeight - 图片原始高度
 * @returns {{ width: number, height: number }}
 */
function calculateImageSize(
  containerWidth: number,
  containerHeight: number,
  originalWidth: number,
  originalHeight: number
) {
  // 1. 计算原始宽高比（保持精度，避免浮点误差）
  const ratio = originalHeight / originalWidth;

  // 2. 按容器宽度计算高度（基准方案）
  let width = containerWidth;
  let height = ratio * containerWidth;

  // 3. 检查是否超出容器高度（如果提供高度）
  if (containerHeight && height > containerHeight) {
    // 按容器高度计算宽度（避免高度溢出）
    width = containerHeight / ratio;
    height = containerHeight;
  }

  // 4. 确保返回整数（像素必须为整数）
  return {
    width: Math.round(width),
    height: Math.round(height),
  };
}
