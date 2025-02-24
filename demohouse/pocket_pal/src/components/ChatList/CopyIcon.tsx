import React from 'react';

const CopyIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg width="21" height="21" viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path 
      d="M5.75024 5.93048V4.00586C5.75024 3.35865 6.27491 2.83398 6.92212 2.83398H17.0784C17.7256 2.83398 18.2502 3.35865 18.2502 4.00586V14.1621C18.2502 14.8093 17.7256 15.334 17.0784 15.334H15.132" 
      stroke="#4A4A4A" 
      strokeWidth="1.25" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    />
    <path 
      d="M13.7446 6.16602H3.58838C2.94117 6.16602 2.4165 6.69068 2.4165 7.33789V17.4941C2.4165 18.1413 2.94117 18.666 3.58838 18.666H13.7446C14.3918 18.666 14.9165 18.1413 14.9165 17.4941V7.33789C14.9165 6.69068 14.3918 6.16602 13.7446 6.16602Z" 
      stroke="#4A4A4A" 
      strokeWidth="1.25" 
      strokeLinejoin="round"
    />
  </svg>
);

export default CopyIcon;