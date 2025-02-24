import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

const WaveIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => {
  const [initialStates, setInitialStates] = useState<boolean[]>([]);

  useEffect(() => {
    const states = Array.from({ length: 4 }, (_, index) => index % 2 === 0);
    setInitialStates(states);
  }, []);

  const bars = [
    { minHeight: 6, maxHeight: 10, delay: 0 },
    { minHeight: 6, maxHeight: 16, delay: 0.2 },
    { minHeight: 6, maxHeight: 16, delay: 0.4 },
    { minHeight: 6, maxHeight: 10, delay: 0.6 },
  ];

  return (
    <div className="flex items-center justify-center w-5 h-5">
      <div className="flex items-center justify-between w-full px-[2px]">
        {bars.map((bar, index) => (
          <motion.div
            key={index}
            className="rounded-full bg-[#1664FF] w-[2px]"
            
            animate={{
              height: initialStates[index] 
                ? [
                    `${bar.minHeight}px`,
                    `${bar.maxHeight}px`,
                    `${bar.minHeight}px`
                  ]
                : [
                    `${bar.maxHeight}px`,
                    `${bar.minHeight}px`,
                    `${bar.maxHeight}px`
                  ]
            }}
            transition={{
              duration: 1,
              delay: bar.delay,
              repeat: Infinity,
              ease: "easeInOut"
            }}
          />
        ))}
      </div>
    </div>
  );
};

export default WaveIcon;