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

/* eslint-disable max-lines-per-function */
import React, { useState, useRef, useEffect } from 'react';
import { Rnd } from 'react-rnd';

import styles from './index.module.less';
import BorderBox from '../BorderBox';
import { detectedObject } from '@/types';
import { getImageScale } from '@/pages/entry/utils';

interface ImageSelectorProps {
  imageSrc: string;
  label:string;
  initPosition?: { x: number; y: number };
  initSize?: { width: number; height: number };
  detectedObjects: detectedObject[];
  onSelect?: (
    position: { x: number; y: number },
    size: { width: number; height: number },
    scale: { x: number; y: number }
  ) => void;
  position: { x: number; y: number };
  setPosition: (position: { x: number; y: number }) => void;
  size: { width: number; height: number };
  setSize: (size: { width: number; height: number }) => void;
  imageRef: React.RefObject<HTMLImageElement>;
}

const ImageRectSelect: React.FC<ImageSelectorProps> = (props) => {
  const { initPosition, initSize, imageSrc, onSelect, label,position,setPosition,size,setSize,imageRef } = props;
  const scaleRef = useRef<{ x: number; y: number }>({ x: 1, y: 1 });
  const centerRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // const [size, setSize] = useState({ width: 100, height: 100 });
  // const [position, setPosition] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const [imageLoaded, setImageLoaded] = useState(false);

  const rotatePoint = (point: { x: number; y: number }, angle: number, transfer = false) => {
    if (!centerRef.current) {
      return point;
    }
    const cosA = Math.cos((angle * Math.PI) / 180);
    const sinA = Math.sin((angle * Math.PI) / 180);
    let rx =
      centerRef.current.x + (point.x - centerRef.current.x) * cosA - (point.y - centerRef.current.y) * sinA;
    const ry =
      centerRef.current.y + (point.x - centerRef.current.x) * sinA - (point.y - centerRef.current.y) * cosA;

  

    return { x: rx, y: ry };
  };

  

  useEffect(() => {
    if (containerRef.current && imageRef.current && imageLoaded) {
      containerRef.current.style.width = `${imageRef.current.offsetWidth}px`;
      containerRef.current.style.height = `${imageRef.current.offsetHeight}px`;
    }
    if (imageRef.current && initPosition && initSize && imageLoaded) {
      console.log('initPosition', initPosition);
      const scale = getImageScale(imageRef.current);
      if (!scale) {
        return;
      }
      console.log('scale', scale);
      scaleRef.current = scale;
      setPosition({
        x: Math.floor(initPosition.x * scale.x),
        y: Math.floor(initPosition.y * scale.y)
      });
      setSize({
        width: Math.ceil(initSize.width * scale.x),
        height: Math.ceil(initSize.height * scale.y)
      });
      // 中心点
      centerRef.current = {
        x: imageRef.current.offsetWidth / 2,
        y: imageRef.current.offsetHeight / 2
      };
    }
  }, [imageLoaded]);



  const clipPath = `polygon(
    0% 0%,
    100% 0%,
    100% 100%,
    0% 100%,
    0% 0%,
    ${position.x}px ${position.y}px,
    ${position.x}px ${position.y + size.height}px,
    ${position.x + size.width}px ${position.y + size.height}px,
    ${position.x + size.width}px ${position.y}px,
    ${position.x}px ${position.y}px
  )`;

  return (
    <div ref={containerRef} className={styles.container}>
      <div className={styles['image-container']}>
        <img
          ref={imageRef}
          src={imageSrc}
          alt="Select area"
          // style={{ transform: `rotate(${rotate}deg)` }}
          className={styles.image}
          onLoad={() => setImageLoaded(true)}
        />
      </div>
      {imageLoaded && (
        <>
          <div className={styles.mask} style={{ clipPath }} />
          <BorderBox label={label} position={position} size={size} />
          <Rnd
            size={size}
            position={position}
            onDrag={(e, d) => {
              setPosition(d);
            }}
            onDragStop={(e, d) => {
              setPosition(d);
              onSelect?.(d, size, scaleRef.current);
            }}
            onResize={(e, direction, ref, delta, currentPosition) => {
              setSize({
                width: parseInt(ref.style.width),
                height: parseInt(ref.style.height)
              });
              setPosition(currentPosition);
            }}
            onResizeStop={(e, direction, ref, delta, currentPosition) => {
              const currentSize = {
                width: parseInt(ref.style.width),
                height: parseInt(ref.style.height)
              };
              setSize({ ...currentSize });
              setPosition(currentPosition);
              onSelect?.(currentPosition, currentSize, scaleRef.current);
            }}
            bounds="parent"
            resizeGrid={[1, 1]}
            dragGrid={[1, 1]}
            resizeHandleComponent={{
              top: <div className={styles['resize-handle']} style={{ top: 1 }} />,
              bottom: <div className={styles['resize-handle']} style={{ bottom: 1 }} />
            }}
          />
        </>
      )}
    </div>
  );
};

export default ImageRectSelect;
