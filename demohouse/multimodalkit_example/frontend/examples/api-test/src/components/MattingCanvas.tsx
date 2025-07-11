import React, { useRef, useEffect, useState, useCallback } from 'react';
import { getImageInfo, getSAMInfo, getObjectDetectList } from 'multi-modal-sdk';
import Button from './Button';

interface DetectedObject {
  centerX: number;
  centerY: number;
  width: number;
  height: number;
  name: string;
}

interface MattingCanvasProps {
  imageId: string;
  onClose: () => void;
}

const MattingCanvas: React.FC<MattingCanvasProps> = ({ imageId, onClose }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [isLoaded, setIsLoaded] = useState(false);
  const [imageObj, setImageObj] = useState<HTMLImageElement | null>(null);
  const [originalDimensions, setOriginalDimensions] = useState({ width: 0, height: 0 });
  const [maskContour, setMaskContour] = useState<number[][][] | undefined>();
  const [isProcessing, setIsProcessing] = useState(false);
  const [detectedObjects, setDetectedObjects] = useState<DetectedObject[]>([]);
  const [showDetectedObjects, setShowDetectedObjects] = useState(false);

  const [interactionState, setInteractionState] = useState<{
    isActive: boolean;
    startPoint: { x: number, y: number } | null;
    currentPoint: { x: number, y: number } | null;
    longPressTimer: NodeJS.Timeout | null;
    interactionType: 'longpress' | 'rectangle' | 'undetermined';
    hasMovedBeyondThreshold: boolean;
  }>({ 
    isActive: false, 
    startPoint: null, 
    currentPoint: null, 
    longPressTimer: null, 
    interactionType: 'undetermined',
    hasMovedBeyondThreshold: false
  });

  const MOVEMENT_THRESHOLD = 15;

  const loadImage = useCallback(async () => {
    if (!imageId) return;
    setIsProcessing(true);
    try {
      const { base64Image } = await getImageInfo({ imageId });
      const img = new Image();
      img.onload = () => {
        setImageObj(img);
        setOriginalDimensions({ width: img.width, height: img.height });
        if (containerRef.current) {
          const containerWidth = containerRef.current.clientWidth;
          const aspectRatio = img.height / img.width;
          const canvasWidth = containerWidth;
          const canvasHeight = containerWidth * aspectRatio;
          setDimensions({ width: canvasWidth, height: canvasHeight });
          setIsLoaded(true);
        }
        setIsProcessing(false);
      };
      img.onerror = () => {
        setIsProcessing(false);
      };
      img.src = `data:image/jpeg;base64,${base64Image}`;
    } catch (e) {
      console.error(e);
      setIsProcessing(false);
    }
  }, [imageId]);

  useEffect(() => {
    loadImage();
  }, [loadImage]);

  const drawImageOnCanvas = useCallback((img: HTMLImageElement, width: number, height: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = width;
    canvas.height = height;
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
  }, []);

  useEffect(() => {
    if (isLoaded && imageObj && canvasRef.current) {
      drawImageOnCanvas(imageObj, dimensions.width, dimensions.height);
    }
  }, [isLoaded, imageObj, dimensions, drawImageOnCanvas]);

  const drawMaskContour = useCallback(() => {
    if (!maskContour || !canvasRef.current || !imageObj) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    drawImageOnCanvas(imageObj, canvas.width, canvas.height);

    ctx.fillStyle = 'rgba(78, 152, 237, 0.5)';
    ctx.strokeStyle = 'rgba(25, 118, 210, 1)';
    ctx.lineWidth = 2;

    maskContour.forEach((contour) => {
      if (contour.length === 0) return;
      const imageToCanvasX = (x: number) => (x / originalDimensions.width) * canvas.width;
      const imageToCanvasY = (y: number) => (y / originalDimensions.height) * canvas.height;

      ctx.beginPath();
      ctx.moveTo(imageToCanvasX(contour[0][1]), imageToCanvasY(contour[0][0]));
      for (let i = 1; i < contour.length; i++) {
        ctx.lineTo(imageToCanvasX(contour[i][1]), imageToCanvasY(contour[i][0]));
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    });
  }, [maskContour, imageObj, originalDimensions, drawImageOnCanvas]);

  useEffect(() => {
    if (isLoaded && imageObj) {
      drawImageOnCanvas(imageObj, dimensions.width, dimensions.height);
      if (maskContour && maskContour.length > 0) {
        drawMaskContour();
      }
      if (showDetectedObjects && detectedObjects.length > 0) {
        drawDetectedObjects();
      }
    }
  }, [isLoaded, maskContour, imageObj, drawMaskContour, showDetectedObjects, detectedObjects, drawImageOnCanvas, dimensions]);

  const drawDetectedObjects = useCallback(() => {
    if (!detectedObjects || !canvasRef.current || !imageObj) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const imageToCanvasX = (x: number) => (x / originalDimensions.width) * canvas.width;
    const imageToCanvasY = (y: number) => (y / originalDimensions.height) * canvas.height;

    detectedObjects.forEach(obj => {
      const x = imageToCanvasX(obj.centerX - obj.width / 2);
      const y = imageToCanvasY(obj.centerY - obj.height / 2);
      const w = imageToCanvasX(obj.width);
      const h = imageToCanvasY(obj.height);

      ctx.strokeStyle = 'rgba(255, 0, 0, 1)';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, w, h);

      ctx.fillStyle = 'rgba(255, 0, 0, 1)';
      ctx.font = '16px Arial';
      ctx.fillText(obj.name, x, y > 20 ? y - 5 : y + 20);
    });
  }, [detectedObjects, imageObj, originalDimensions]);

  const handleLongPress = async (x: number, y: number) => {
    if (!imageId) return;
    setIsProcessing(true);
    try {
      const res = await getSAMInfo({
        imageId,
        points: [{ x, y, label: 1 }],
      });
      setMaskContour(res.maskContour);
    } catch (e) {
      console.error(e);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDetectObjects = async () => {
    if (!imageId) return;
    if (showDetectedObjects) {
      setShowDetectedObjects(false);
      return;
    }
    setIsProcessing(true);
    try {
      const { detectedObjects } = await getObjectDetectList({ imageId });
      setDetectedObjects(detectedObjects);
      setShowDetectedObjects(true);
    } catch (e) {
      console.error(e);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRectSelect = async (rect: { left: number, top: number, right: number, bottom: number }) => {
    if (!imageId) return;
    setIsProcessing(true);
    try {
      const res = await getSAMInfo({
        imageId,
        rectangles: [rect],
      });
      setMaskContour(res.maskContour);
    } catch (e) {
      console.error(e);
    } finally {
      setIsProcessing(false);
    }
  };

  const getDistance = (p1: { x: number, y: number }, p2: { x: number, y: number }) => {
    return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
  };

  const handleInteractionStart = (x: number, y: number) => {
    if (isProcessing) return;
    const timer = setTimeout(() => {
      if (!interactionState.hasMovedBeyondThreshold) {
        handleLongPressComplete(x, y);
      }
    }, 500);
    setInteractionState({ isActive: true, startPoint: { x, y }, currentPoint: { x, y }, longPressTimer: timer, interactionType: 'undetermined', hasMovedBeyondThreshold: false });
  };

  const handleInteractionMove = (x: number, y: number) => {
    if (!interactionState.isActive || !interactionState.startPoint) return;
    const distance = getDistance(interactionState.startPoint, { x, y });
    if (distance > MOVEMENT_THRESHOLD && !interactionState.hasMovedBeyondThreshold) {
      if (interactionState.longPressTimer) clearTimeout(interactionState.longPressTimer);
      setInteractionState(prev => ({ ...prev, interactionType: 'rectangle', hasMovedBeyondThreshold: true, longPressTimer: null }));
    }
    setInteractionState(prev => ({ ...prev, currentPoint: { x, y } }));
    if (interactionState.hasMovedBeyondThreshold || distance > MOVEMENT_THRESHOLD) {
      drawSelectionRect();
    }
  };

  const handleInteractionEnd = () => {
    if (!interactionState.isActive) return;
    if (interactionState.longPressTimer) clearTimeout(interactionState.longPressTimer);
    if (interactionState.hasMovedBeyondThreshold && interactionState.startPoint && interactionState.currentPoint) {
      handleRectangleSelectComplete();
    }
    setInteractionState({ isActive: false, startPoint: null, currentPoint: null, longPressTimer: null, interactionType: 'undetermined', hasMovedBeyondThreshold: false });
  };

  const handleLongPressComplete = (x: number, y: number) => {
    const canvas = canvasRef.current;
    if (!canvas || originalDimensions.width === 0) return;
    const imageX = (x / canvas.width) * originalDimensions.width;
    const imageY = (y / canvas.height) * originalDimensions.height;
    handleLongPress(imageX, imageY);
  };

  const handleRectangleSelectComplete = () => {
    if (!interactionState.startPoint || !interactionState.currentPoint) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const left = Math.min(interactionState.startPoint.x, interactionState.currentPoint.x);
    const top = Math.min(interactionState.startPoint.y, interactionState.currentPoint.y);
    const right = Math.max(interactionState.startPoint.x, interactionState.currentPoint.x);
    const bottom = Math.max(interactionState.startPoint.y, interactionState.currentPoint.y);
    if (right - left < 10 || bottom - top < 10) return;
    const convert = (canvasX: number, canvasY: number) => ({ x: (canvasX / canvas.width) * originalDimensions.width, y: (canvasY / canvas.height) * originalDimensions.height });
    const imageTL = convert(left, top);
    const imageBR = convert(right, bottom);
    handleRectSelect({ left: imageTL.x, top: imageTL.y, right: imageBR.x, bottom: imageBR.y });
  };

  const drawSelectionRect = () => {
    if (!canvasRef.current || !interactionState.startPoint || !interactionState.currentPoint) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx || !imageObj) return;
    ctx.drawImage(imageObj, 0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = 'rgba(25, 118, 210, 1)';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    const width = interactionState.currentPoint.x - interactionState.startPoint.x;
    const height = interactionState.currentPoint.y - interactionState.startPoint.y;
    ctx.beginPath();
    ctx.rect(interactionState.startPoint.x, interactionState.startPoint.y, width, height);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(78, 152, 237, 0.2)';
    ctx.fillRect(interactionState.startPoint.x, interactionState.startPoint.y, width, height);
  };

  const handleTouchStart = (e: React.TouchEvent) => { e.preventDefault(); const touch = e.touches[0]; const rect = canvasRef.current!.getBoundingClientRect(); handleInteractionStart(touch.clientX - rect.left, touch.clientY - rect.top); };
  const handleTouchMove = (e: React.TouchEvent) => { e.preventDefault(); const touch = e.touches[0]; const rect = canvasRef.current!.getBoundingClientRect(); handleInteractionMove(touch.clientX - rect.left, touch.clientY - rect.top); };
  const handleTouchEnd = (e: React.TouchEvent) => { e.preventDefault(); handleInteractionEnd(); };
  const handleMouseDown = (e: React.MouseEvent) => { const rect = canvasRef.current!.getBoundingClientRect(); handleInteractionStart(e.clientX - rect.left, e.clientY - rect.top); };
  const handleMouseMove = (e: React.MouseEvent) => { const rect = canvasRef.current!.getBoundingClientRect(); handleInteractionMove(e.clientX - rect.left, e.clientY - rect.top); };
  const handleMouseUp = () => handleInteractionEnd();

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-4 rounded-lg shadow-lg w-full max-w-lg">
        <div className="text-center text-gray-500 mb-2">
          提示：长按选择物体，拖动圈选物体
        </div>
        <div ref={containerRef} className="relative w-full mx-auto overflow-hidden rounded-lg shadow-lg">
          {!isLoaded ? (
            <div className="flex items-center justify-center w-full h-64 bg-gray-100">Loading...</div>
          ) : (
            <div className="relative">
              <canvas
                ref={canvasRef}
                width={dimensions.width}
                height={dimensions.height}
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
                onTouchMove={handleTouchMove}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                className="w-full touch-none"
              />
              {isProcessing && (
                <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-30">
                  Processing...
                </div>
              )}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 mt-4">
            <Button onClick={handleDetectObjects}>{showDetectedObjects ? 'Hide Objects' : 'Detect Objects'}</Button>
            <Button onClick={() => { drawImageOnCanvas(imageObj!, dimensions.width, dimensions.height); setMaskContour(undefined); setShowDetectedObjects(false); setDetectedObjects([]); }}>Clear</Button>
            <Button onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
};

export default MattingCanvas;