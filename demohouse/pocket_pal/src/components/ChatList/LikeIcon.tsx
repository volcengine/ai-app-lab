import React from 'react';

const LikeIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg width="20" height="21" viewBox="0 0 20 21" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path 
      d="M11.5 8.50001V5.50001C11.5 4.25736 10.4927 3.25 9.25 3.25L6.25 10V18.25H14.965C15.713 18.2585 16.3529 17.7146 16.465 16.975L17.5 10.225C17.566 9.78989 17.4377 9.34772 17.1489 9.01564C16.8601 8.68355 16.4401 8.49501 16 8.50001H11.5Z" 
      stroke="#4A4A4A" 
      strokeWidth="1.25" 
      strokeLinejoin="round"
    />
    <path 
      d="M6.25 9.91821H4.2475C3.36888 9.90267 2.61779 10.6305 2.5 11.5013V16.7513C2.61779 17.6221 3.36888 18.2668 4.2475 18.2513H6.25V9.91821Z" 
      stroke="#4A4A4A" 
      strokeWidth="1.25" 
      strokeLinejoin="round"
    />
  </svg>
);

export default LikeIcon;