import { useState, useEffect } from 'react';

const useFirstTimeTooltip = (key: string): [boolean, () => void] => {
  const [showTooltip, setShowTooltip] = useState(true);

  useEffect(() => {
    const hasShownTooltip = localStorage.getItem(key);
    if (hasShownTooltip) {
      setShowTooltip(false);
    }
  }, [key]);

  const dismissTooltip = () => {
    setShowTooltip(false);
    localStorage.setItem(key, 'true');
  };

  return [showTooltip, dismissTooltip];
};

export default useFirstTimeTooltip;
