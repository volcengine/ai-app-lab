import React from 'react';

import { useMemoryUpdate } from '@/demo/longTermMemory/hooks/useMemoryUpdate';
import { useChatStore } from '@/demo/longTermMemory/stores/useChatStore';
import ColorfulButton from '@/demo/longTermMemory/components/ColorfulButton';


export const UploadMemoryBtn = () => {
  const { canUpdate, handleUpdate, isReasoning } = useMemoryUpdate();
  const { addDivider } = useChatStore();

  const handleClick = () => {
    if (!canUpdate) {
      return;
    }
    handleUpdate();
    addDivider();
  };

  return (
    <ColorfulButton
      className={'w-[256px]'}
      mode={canUpdate ? 'active' : 'default'}
      onClick={handleClick}
      disabled={!canUpdate}
    >
      <div className={'flex items-center gap-1'}>
        <svg xmlns="http://www.w3.org/2000/svg" width="17" height="16" viewBox="0 0 17 16" fill="none">
          <g clipPath="url(#clip0_813_13006)">
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M8.43459 0.667772C8.88893 0.659319 9.34067 0.703239 9.78056 0.797318C10.1517 0.876698 10.3411 1.27349 10.2135 1.63097C10.0886 1.98118 9.70568 2.16059 9.33971 2.09476C9.05133 2.0429 8.75696 2.01917 8.46106 2.02467C7.68784 2.03906 6.93331 2.25259 6.27589 2.64231C5.61854 3.032 5.08268 3.58334 4.7229 4.23815C4.36315 4.8929 4.19223 5.62775 4.22718 6.36662C4.26213 7.1055 4.50175 7.8226 4.92206 8.44341C5.34242 9.06438 5.92848 9.56682 6.62028 9.89744C6.85855 10.0114 7.00962 10.2479 7.00962 10.507V11.9763H10.0797V10.507C10.0797 10.2472 10.2315 10.0102 10.4707 9.89661C10.591 9.8395 10.805 9.70805 11.0178 9.57001C11.3382 9.36218 11.7682 9.40829 12.0234 9.69242C12.2899 9.98917 12.2606 10.4288 11.9229 10.6412C11.7328 10.7607 11.5541 10.8642 11.4689 10.913V12.1179C11.4689 12.4434 11.3345 12.7535 11.0987 12.9807C10.8632 13.2076 10.5457 13.3334 10.2168 13.3334H6.87241C6.54347 13.3334 6.22608 13.2076 5.99056 12.9807C5.7547 12.7535 5.6204 12.4434 5.6204 12.1179V10.9119C4.87605 10.4837 4.24008 9.89631 3.76332 9.1921C3.20532 8.36779 2.88602 7.41387 2.83944 6.42926C2.79286 5.44464 3.02079 4.46642 3.49886 3.59632C3.97689 2.72629 4.68726 1.99661 5.55519 1.48209C6.42304 0.96761 7.41724 0.686712 8.43459 0.667772ZM11.7155 2.67826C11.8342 2.2196 12.4849 2.21805 12.6058 2.67614L12.7259 3.13105C12.8949 3.77166 13.3953 4.27197 14.0359 4.44102L14.4908 4.56107C14.9489 4.68197 14.9473 5.33273 14.4887 5.45144L14.0416 5.56714C13.3972 5.73393 12.8931 6.23569 12.7232 6.87932L12.6058 7.32402C12.4849 7.78211 11.8342 7.78057 11.7155 7.32191L11.6024 6.88514C11.4348 6.23767 10.9292 5.73207 10.2818 5.56449L9.845 5.45144C9.38634 5.33273 9.3848 4.68197 9.84289 4.56107L10.2876 4.44372C10.9312 4.27386 11.433 3.76971 11.5998 3.12528L11.7155 2.67826ZM6.83328 14.0001C6.46514 14.0001 6.16683 14.3191 6.16683 14.6872C6.16684 15.0556 6.46543 15.3334 6.83375 15.3334H10.1668C10.535 15.3334 10.8335 15.0349 10.8335 14.6667C10.8335 14.2986 10.535 14.0001 10.1668 14.0001H6.83328Z"
              fill="url(#paint0_linear_813_13006)"
            />
          </g>
          <defs>
            <linearGradient
              id="paint0_linear_813_13006"
              x1="2.8335"
              y1="15.3334"
              x2="14.8335"
              y2="15.3334"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0.01" stopColor="#3B91FF" />
              <stop offset="0.4" stopColor="#0D5EFF" />
              <stop offset="0.995" stopColor="#C069FF" />
            </linearGradient>
            <clipPath id="clip0_813_13006">
              <rect width="16" height="16" fill="white" transform="translate(0.5)" />
            </clipPath>
          </defs>
        </svg>
        <div>{isReasoning ? '记忆更新中...' : '更新记忆'}</div>
      </div>
    </ColorfulButton>
  );
};
