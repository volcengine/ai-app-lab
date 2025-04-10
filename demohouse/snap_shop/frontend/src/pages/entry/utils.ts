import { getCameraImage } from "@ai-app/bridge-api/procode";

export const getCameraImageBase64 = async (imageId: string) => {
  const res = await getCameraImage({ imageId });
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