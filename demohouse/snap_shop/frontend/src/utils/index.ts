import { getImageInfo } from 'multi-modal-sdk';

export const getCameraImageBase64 = async (imageId: string) => {
  if (!imageId) {
    return '';
  }
  const res = await getImageInfo({ imageId });
  if (res.base64Image) {
    return `data:image/jpeg;base64,${res.base64Image}`;
  }
  return '';
};

export const getImageScale = (imgElement: HTMLImageElement): { x: number; y: number } | null => {
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