import React from 'react';

interface Props {
  width?: string;
  height?: string;
  className?: string;
  spin?: boolean;
}

const IconClean = (props: Props) => {
  const { width = '1em', height = '1em', className = '', spin = false } = props;

  return (
    // biome-ignore lint/a11y/noSvgWithoutTitle: <explanation>
    <svg
      width={width}
      height={height}
      className={`${spin ? 'force-icon-loading' : ''} ${className}`}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fill-rule="evenodd"
        clip-rule="evenodd"
        d="M29 4a1 1 0 011 1v7h13a1 1 0 011 1v11a1 1 0 01-1 1h-1.304l2.897 16.657A2 2 0 0142.623 44H5.377a2 2 0 01-1.97-2.343L6.304 25H5a1 1 0 01-1-1V13a1 1 0 011-1h13V5a1 1 0 011-1h10zm8.635 21H10.364L7.756 40H16v-8a1 1 0 011-1h2a1 1 0 011 1v8h9v-8a1 1 0 011-1h2a1 1 0 011 1v8h7.244l-2.61-15zM22 8h4v8h14v5H8v-5h14V8z"
        fill="currentColor"
      />
    </svg>
  );
};

export default IconClean;
