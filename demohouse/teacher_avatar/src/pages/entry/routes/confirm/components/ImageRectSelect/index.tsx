/* eslint-disable max-lines-per-function */
import React, { useState, useRef, useEffect } from 'react';
import { Rnd } from 'react-rnd';

import styles from './index.module.less';
import BorderBox from '../BorderBox';

interface ImageSelectorProps {
  imageSrc: string;
  rotate: number;
  initPosition?: { x: number; y: number };
  initSize?: { width: number; height: number };
  onSelect: (
    position: { x: number; y: number },
    size: { width: number; height: number },
    scale: { x: number; y: number }
  ) => void;
}

const ImageRectSelect: React.FC<ImageSelectorProps> = (props) => {
  const { initPosition, initSize, imageSrc, rotate, onSelect } = props;
  const scaleRef = useRef<{ x: number; y: number }>({ x: 1, y: 1 });
  const centerRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const [size, setSize] = useState({ width: 100, height: 100 });
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
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

    if (transfer) {
      if (rotate === 90) {
        rx -= size.height;
      } else if (rotate === 180) {
        rx -= size.height;
      } else if (rotate === 270) {
        rx -= size.height;
      } else {
        rx -= size.height;
      }
      // 交换宽高
      setSize((prev) => ({ width: prev.height, height: prev.width }));
    }

    return { x: rx, y: ry };
  };

  const getImageScale = (imgElement: HTMLImageElement): { x: number; y: number } | null => {
    if (!(imgElement instanceof HTMLImageElement)) {
      console.error('Invalid input parameters');
      return null;
    }
    const { naturalWidth, naturalHeight, clientWidth, clientHeight } = imgElement;
    const scaleX = clientWidth / naturalWidth;
    const scaleY = clientHeight / naturalHeight;

    return {
      x: scaleX,
      y: scaleY
    };
  };

  useEffect(() => {
    if (containerRef.current && imageRef.current && imageLoaded) {
      containerRef.current.style.width = `${imageRef.current.offsetWidth}px`;
      containerRef.current.style.height = `${imageRef.current.offsetHeight}px`;
    }
    if (imageRef.current && initPosition && initSize && imageLoaded) {
      const scale = getImageScale(imageRef.current);
      if (!scale) {
        return;
      }
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

  useEffect(() => {
    const rotatedPosition = rotatePoint(position, 90, true);
    setPosition(rotatedPosition);
  }, [rotate]);

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
          style={{ transform: `rotate(${rotate}deg)` }}
          className={styles.image}
          onLoad={() => setImageLoaded(true)}
        />
      </div>
      {imageLoaded && (
        <>
          <div className={styles.mask} style={{ clipPath }} />
          <BorderBox position={position} size={size} />
          <Rnd
            size={size}
            position={position}
            onDrag={(e, d) => {
              setPosition(d);
            }}
            onDragStop={(e, d) => {
              setPosition(d);
              onSelect(d, size, scaleRef.current);
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
              onSelect(currentPosition, currentSize, scaleRef.current);
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
