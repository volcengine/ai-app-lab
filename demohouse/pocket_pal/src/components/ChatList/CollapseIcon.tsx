import React from 'react';

const CollapseIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg 
    width="18" 
    height="16" 
    viewBox="0 0 18 16" 
    fill="none" 
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <path 
      d="M3.28737 5.34314L8.94422 11L14.6011 5.34315" 
      stroke="#676B72"
      strokeWidth="1.5" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    />
  </svg>
);

export default CollapseIcon;