import {  useEffect, useRef, useState } from 'react';

import { getViewContext } from '@ai-app/framework';
import { getObjectDetectList, getSAMInfo } from '@ai-app/bridge-api/procode';
import { getCameraImageBase64, getImageScale } from '../../utils';
import styles from './index.module.less';
import { detectedObject} from '@/types/index'
import ImageRectSelect from './components/ImageRectSelect';
import { ResultPanel } from './components/ResultPanel';
const Recognition = () => {

  const [imageBase64, setImageBase64] = useState('');
  const [notPassed, setNotPassed] = useState(false);
  const [label,setLabel] = useState('');
  const [detectedObjects,setDetectedObjects] = useState<detectedObject[]>([]);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [size, setSize] = useState({ width: 100, height: 100 });
  const imageRef = useRef<HTMLImageElement>(null);
  const [context, setContext] = useState<any>(null);
  const ref = useRef<HTMLCanvasElement>(null);

  const [thumbnails,setThumbnails] = useState<{[index:number]:string}>({});
  const recognizeObject = async (context: any) => {
    try {
      const base64 = await getCameraImageBase64(context.image_id);
      setImageBase64(base64);
      let rect = null
      const res  = await getObjectDetectList({
        imageId:context.image_id
      });
      let SAMInfo = null
      if(context.point_x){
         SAMInfo = await getSAMInfo({
          imageId: context.image_id,
          points:[{
            x:Number(context.point_x),
            y:Number(context.point_y),
            label:1
          }]
        })
      }

      if(context.camera_mode === 'live_shopping' && (context.point_x || context.rect_bottom) ){
        getObjectDetectList({
          imageId:context.image_id
        });
          let minX = Number.MAX_SAFE_INTEGER;
          let maxX = 0;
          let minY = Number.MAX_SAFE_INTEGER;
          let maxY = 0;
          if(context.point_x){
            for (let i = 0; i < (SAMInfo?.maskContour?.length || 0); i++) {
              const contour = SAMInfo?.maskContour[i];
              if(!contour?.length){
                break
              }
              for (let j = 0; j < contour.length; j++) {
                const x = contour[j][1];
                const y = contour[j][0];

                // 更新裁剪用轮廓
                if (x > maxX) {
                  maxX = x;
                }
                if (x < minX) {
                  minX = x;
                }
                if (y > maxY) {
                  maxY = y;
                }
                if (y < minY) {
                  minY = y;
                }
              }
            }
            rect = {
              bottom: maxY,
              left: minX,
              right: maxX,
              top: minY
            }
          }

        rect = rect ? rect : {
          bottom: Number(context.rect_bottom),
          left: Number(context.rect_left),
          right: Number(context.rect_right),
          top: Number(context.rect_top)
        }

        if(imageRef.current){
          const scale = getImageScale(imageRef.current);
          if(!scale){
            return;
          }
          setPosition({
            x: Math.floor((rect.left) * scale.x),
            y: Math.floor((rect.top) * scale.y)
          });
          setSize({
            width: Math.ceil((rect.right - rect.left) * scale.x),
            height: Math.ceil((rect.bottom - rect.top) * scale.y)
          });
        }

        sliceThumbnails(base64,[
          {
            width: rect.right - rect.left,
            height: rect.bottom - rect.top,
            centerX: (rect.right + rect.left)/2,
            centerY: (rect.bottom + rect.top)/2,
            label: '',
          }
        ]);
        setDetectedObjects([{
          label: '',
          centerX: (rect.right + rect.left)/2,
          centerY: (rect.bottom + rect.top)/2,
          width: rect.right - rect.left,
          height: rect.bottom - rect.top,
        }])
        return;
      }else if(Array.isArray(res?.detectedObjects) && res.detectedObjects.length > 0){
        // 面积最大的靠前
        const sortedRes = (res.detectedObjects as detectedObject[]).sort((a,b) => {
          const { width:w1, height:h1  } = a;
          const { width:w2, width:h2 } = b;
          return  w2*h2 - w1*h1 > 0 ? 1 : -1;
        })
        setDetectedObjects(sortedRes);
        sliceThumbnails(base64,sortedRes);



      }else {
        setNotPassed(true);
        return;
      }
    } catch (error) {
      setNotPassed(true);
    }
  };


  const sliceThumbnails = (base64: string, detectedObjects: detectedObject[]) => {
    const canvas = ref.current;
    if (!canvas) {
      return;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }
    detectedObjects.forEach((detectedObject, index) => {
      const image = new Image();
      image.src = base64;
      setThumbnails(pre=>{
        return {
         ...pre,
         [index]:''
        }
      });
      image.onerror = function (e) {
        console.error('图片加载失败');
      };
      image.onload = () => {
        const width = image.width;
        const height = image.height;
        canvas.width = width;
        canvas.height = height;
        ctx.clearRect(0,0, canvas.width, canvas.height)
        ctx.drawImage(image, 0,0);
        const x = detectedObject.centerX - detectedObject.width / 2; // 起始横坐标
        const y = detectedObject.centerY  - detectedObject.height / 2; // 起始纵坐标
        const sliceWidth = detectedObject.width; // 截取宽度
        const sliceHeight = detectedObject.height; // 截取高度
        const imageData = ctx.getImageData(x, y, sliceWidth, sliceHeight);
        const newCanvas = document.createElement('canvas');


        newCanvas.height = sliceHeight;
        newCanvas.width = sliceWidth;
        const newCtx = newCanvas.getContext('2d');
        newCtx && newCtx.putImageData(imageData, 0, 0);
        const newImageData = newCanvas.toDataURL('image/png');
        setThumbnails(pre=>{
          return {
            ...pre,
            [index]: newImageData
          }
        });
      }
    })


  }


  useEffect(() => {
    (async () => {
      const currentViewContext: any = getViewContext();
      setContext(currentViewContext);
      currentViewContext && recognizeObject(currentViewContext);
    })();
  }, []);



  return (
    <div className={styles.recognitionContainer}>
      <div className={`${styles.content} ${(context?.image_height || 0) > (context?.image_width || 0) ? 'h-full':'h-[60%]' } `}>
        <canvas className='opacity-0 absolute z-[-1] invisible' ref={ref}></canvas>
        {(!!detectedObjects.length) && <ImageRectSelect
          label={label}
          position={position}
          setPosition={setPosition}
          imageRef={imageRef}
          size={size}
          setSize={setSize}
          detectedObjects={detectedObjects}
          initPosition={{
            x: detectedObjects[0].centerX - detectedObjects[0].width / 2,
            y: detectedObjects[0].centerY  - detectedObjects[0].height / 2
          }}
          initSize={{
            width: detectedObjects[0].width,
            height: detectedObjects[0].height
          }}
          imageSrc={imageBase64}
        /> }

      </div>

      {<ResultPanel onSelectThumbnail={(index:number,label: string)=>{
        if(index===-1){
          setLabel(label)
          return;
        }
        const obj = detectedObjects[index];
        setLabel(label)
        if(imageRef.current){
          const scale = getImageScale(imageRef.current);
          if(!scale){
            return;
          }
          setPosition({
            x: Math.floor((obj.centerX - obj.width / 2) * scale.x),
            y: Math.floor((obj.centerY - obj.height / 2) * scale.y)
          });
          setSize({
            width: Math.ceil(obj.width * scale.x),
            height: Math.ceil(obj.height * scale.y)
          });
        }
      }} notPassed={notPassed} thumbnails={thumbnails} />}

    </div>
  );
};

export default Recognition;
