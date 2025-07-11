import { useEffect, useState } from 'react';

export default () => {
  const [imageId, setImageId] = useState('');
  useEffect(() => {
    const id = new URL(window.location.toString()).searchParams.get('image_id');
    if (id) setImageId(id);
  }, []);
  return imageId;
};
