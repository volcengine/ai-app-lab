
import { Popover, Trigger, List } from '@arco-design/web-react';

import { Message } from '@/demo/longTermMemory/types';
import { useChat } from '@/demo/longTermMemory/hooks/useChat';
import { ActionIcon } from '@/demo/longTermMemory/components/ActionIcon';
import { CopyButton } from '@/demo/longTermMemory/components/CopyButton';

import s from './index.module.less';
import {IconInfoCircle, IconRefresh} from "@arco-design/web-react/icon";
const UserMsg = ({ content }: { content: string }) => (
  <div className={s.userMsg}>
    <svg
      className={'shrink-0'}
      xmlns="http://www.w3.org/2000/svg"
      width="29"
      height="29"
      viewBox="0 0 29 29"
      fill="none"
    >
      <g filter="url(#filter0_d_747_87172)">
        <circle cx="14.5" cy="13" r="9" fill="#8B72FF" />
      </g>
      <path
        opacity="0.2"
        fillRule="evenodd"
        clipRule="evenodd"
        d="M17.2551 10.9678C19.0443 10.9678 20.4947 12.4182 20.4947 14.2075C20.4947 15.2164 20.0335 16.1176 19.3105 16.7118L19.852 17.0479C20.0367 17.1625 19.9555 17.4474 19.7381 17.4474H17.256V17.4472C17.2557 17.4472 17.2554 17.4472 17.2551 17.4472C16.4697 17.4472 15.7496 17.1677 15.1888 16.7027C15.1509 16.6713 15.9735 16.0059 16.7631 15.3672C17.4232 14.8331 18.0602 14.3178 18.1519 14.2075C18.4499 13.8485 17.9711 13.0347 17.5463 12.3126C17.1241 11.5949 16.7551 10.9678 17.2551 10.9678Z"
        fill="white"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M19.4498 12.4976C19.4498 15.2314 17.2336 17.4476 14.4998 17.4476C14.3958 17.4476 14.2926 17.4444 14.1902 17.4381C14.1877 17.4379 14.186 17.4407 14.1874 17.4428C14.1887 17.4449 14.1872 17.4476 14.1847 17.4476H10.1714C9.93262 17.4476 9.80728 17.1642 9.96788 16.9876L10.7582 16.1182C10.8556 16.0111 10.8526 15.8475 10.7578 15.7381C10.0052 14.8698 9.5498 13.7369 9.5498 12.4976C9.5498 9.7638 11.766 7.54761 14.4998 7.54761C17.2336 7.54761 19.4498 9.7638 19.4498 12.4976ZM16.9664 14.4755C17.1812 14.2607 17.1812 13.9125 16.9664 13.6977C16.7516 13.4829 16.4033 13.4829 16.1885 13.6977C15.222 14.6642 13.6549 14.6642 12.6884 13.6977C12.4736 13.4829 12.1253 13.4829 11.9106 13.6977C11.6958 13.9125 11.6958 14.2607 11.9106 14.4755C13.3067 15.8716 15.5702 15.8716 16.9664 14.4755Z"
        fill="url(#paint0_linear_747_87172)"
      />
      <defs>
        <filter
          id="filter0_d_747_87172"
          x="0.357143"
          y="0.142857"
          width="28.2857"
          height="28.2857"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feColorMatrix
            in="SourceAlpha"
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
            result="hardAlpha"
          />
          <feOffset dy="1.28571" />
          <feGaussianBlur stdDeviation="2.57143" />
          <feComposite in2="hardAlpha" operator="out" />
          <feColorMatrix type="matrix" values="0 0 0 0 0.0752849 0 0 0 0 0.141942 0 0 0 0 0.378271 0 0 0 0.05 0" />
          <feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow_747_87172" />
          <feBlend mode="normal" in="SourceGraphic" in2="effect1_dropShadow_747_87172" result="shape" />
        </filter>
        <linearGradient
          id="paint0_linear_747_87172"
          x1="16.9748"
          y1="8.37261"
          x2="12.8498"
          y2="14.5601"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#E0D9FF" />
          <stop offset="1" stopColor="white" />
        </linearGradient>
      </defs>
    </svg>
    <div>{content}</div>
  </div>
);
const Divider = () => (
  <div className={s.divider}>
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 14 14" fill="none">
      <mask id="mask0_756_122226" maskUnits="userSpaceOnUse" x="0" y="0" width="14" height="14">
        <rect width="14" height="14" fill="#D9D9D9" />
      </mask>
      <g mask="url(#mask0_756_122226)">
        <path
          d="M7.60287 0.599792C7.69985 0.393864 7.99254 0.393864 8.04859 0.599792L9.1745 4.73639C9.21598 4.8888 9.32476 5.00899 9.47229 5.06542L13.4743 6.59626C13.6736 6.67247 13.6446 6.96352 13.4303 7.03972L9.12392 8.57056C8.96517 8.627 8.83251 8.74718 8.76073 8.8996L6.81257 13.0362C6.71559 13.2421 6.42289 13.2421 6.36684 13.0362L5.24094 8.8996C5.19945 8.74718 5.09068 8.627 4.94315 8.57056L0.941103 7.03972C0.741883 6.96352 0.770811 6.67247 0.985178 6.59626L5.29152 5.06542C5.45027 5.00899 5.58293 4.8888 5.65471 4.73639L7.60287 0.599792Z"
          fill="#A3A3FD"
        />
      </g>
    </svg>
    <div className={s.text}>以上为历史对话，后续记忆更新仅依据最新对话内容</div>
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 14 14" fill="none">
      <mask id="mask0_756_122226" maskUnits="userSpaceOnUse" x="0" y="0" width="14" height="14">
        <rect width="14" height="14" fill="#D9D9D9" />
      </mask>
      <g mask="url(#mask0_756_122226)">
        <path
          d="M7.60287 0.599792C7.69985 0.393864 7.99254 0.393864 8.04859 0.599792L9.1745 4.73639C9.21598 4.8888 9.32476 5.00899 9.47229 5.06542L13.4743 6.59626C13.6736 6.67247 13.6446 6.96352 13.4303 7.03972L9.12392 8.57056C8.96517 8.627 8.83251 8.74718 8.76073 8.8996L6.81257 13.0362C6.71559 13.2421 6.42289 13.2421 6.36684 13.0362L5.24094 8.8996C5.19945 8.74718 5.09068 8.627 4.94315 8.57056L0.941103 7.03972C0.741883 6.96352 0.770811 6.67247 0.985178 6.59626L5.29152 5.06542C5.45027 5.00899 5.58293 4.8888 5.65471 4.73639L7.60287 0.599792Z"
          fill="#A3A3FD"
        />
      </g>
    </svg>
  </div>
);

export const BotMsg = ({ message, isLast }: { message: Message; isLast: boolean }) => {
  const { retry } = useChat();
  const { id, content, finish, memories, logId } = message;
  const isRecalling = !finish && !content && !memories?.length;
  const isThinking = !finish && !content && memories?.length;

  return isRecalling || isThinking ? (
    <div className={s.recall}>
      <img
        src={'https://lf3-static.bytednsdoc.com/obj/eden-cn/LM-STH-hahK/ljhwZthlaukjlkulzlp/ark/app/model.png'}
        className={s.img}
      />
      <div className={s.name}>Doubao-Pro-32k-character</div>
      <div className={s.color}>思考中...</div>
    </div>
  ) : (
    <div className={s.botMsg}>
      <>{content}</>
      {finish && (
        <div className={s.footWrapper}>
          <div className={'flex gap-3 items-cener'}>
            <div className={s.operation}>
              {isLast && (
                <ActionIcon
                  onClick={() => {
                    retry(id);
                  }}
                >
                  <IconRefresh className={'w-4 h-4 text-[#737a87]'} />
                </ActionIcon>
              )}
              <CopyButton textToCopy={content} />
            </div>
            <Trigger
              position={'bl'}
              popup={() => (
                <List
                  className={s.popup}
                  size="small"
                  dataSource={message.memories}
                  render={(item, index) => (
                    <List.Item key={index} className={'!py-[6px] !px-4'}>
                      <div className={'flex items-center gap-3 '}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none">
                          <g clipPath="url(#clip0_931_37370)">
                            <path
                              fillRule="evenodd"
                              clipRule="evenodd"
                              d="M7.9341 0.668017C8.38844 0.659564 8.84018 0.703483 9.28007 0.797562C9.65123 0.876943 9.8406 1.27373 9.71304 1.63121C9.58807 1.98142 9.20519 2.16083 8.83922 2.09501C8.55084 2.04314 8.25647 2.01941 7.96057 2.02492C7.18735 2.0393 6.43282 2.25283 5.7754 2.64256C5.11805 3.03225 4.58219 3.58358 4.22241 4.2384C3.86266 4.89314 3.69174 5.628 3.72669 6.36686C3.76164 7.10574 4.00126 7.82284 4.42157 8.44366C4.84193 9.06462 5.42799 9.56707 6.11979 9.89768C6.35806 10.0116 6.50913 10.2481 6.50913 10.5073V11.9765H9.57917V10.5073C9.57917 10.2474 9.73098 10.0104 9.97024 9.89685C10.0905 9.83974 10.3045 9.70829 10.5173 9.57026C10.8377 9.36242 11.2677 9.40853 11.5229 9.69267C11.7894 9.98942 11.7601 10.4291 11.4225 10.6414C11.2323 10.7609 11.0536 10.8645 10.9684 10.9133V12.1181C10.9684 12.4436 10.834 12.7538 10.5982 12.981C10.3627 13.2078 10.0453 13.3337 9.71632 13.3337H6.37192C6.04299 13.3337 5.72559 13.2078 5.49007 12.981C5.25422 12.7538 5.11991 12.4436 5.11991 12.1181V10.9121C4.37556 10.484 3.73959 9.89655 3.26283 9.19234C2.70483 8.36803 2.38553 7.41411 2.33895 6.42951C2.29237 5.44489 2.5203 4.46667 2.99837 3.59657C3.4764 2.72653 4.18677 1.99685 5.0547 1.48233C5.92256 0.967854 6.91675 0.686956 7.9341 0.668017ZM11.215 2.6785C11.3337 2.21984 11.9845 2.21829 12.1054 2.67638L12.2254 3.13129C12.3945 3.7719 12.8948 4.27221 13.5354 4.44127L13.9903 4.56132C14.4484 4.68221 14.4468 5.33297 13.9882 5.45168L13.5411 5.56738C12.8967 5.73418 12.3926 6.23594 12.2227 6.87957L12.1053 7.32427C11.9845 7.78236 11.3337 7.78081 11.215 7.32215L11.1019 6.88538C10.9344 6.23792 10.4288 5.73231 9.78129 5.56473L9.34451 5.45168C8.88585 5.33297 8.88431 4.68221 9.3424 4.56132L9.7871 4.44396C10.4307 4.27411 10.9325 3.76995 11.0993 3.12552L11.215 2.6785ZM6.33279 14.0003C5.96465 14.0003 5.66634 14.3193 5.66634 14.6875C5.66635 15.0558 5.96494 15.3337 6.33326 15.3337H9.66634C10.0345 15.3337 10.333 15.0352 10.333 14.667C10.333 14.2988 10.0345 14.0003 9.66634 14.0003H6.33279Z"
                              fill="#42464E"
                            />
                          </g>
                          <defs>
                            <clipPath id="clip0_931_37370">
                              <rect width="16" height="16" fill="white" />
                            </clipPath>
                          </defs>
                        </svg>
                        <div>{item}</div>
                      </div>
                    </List.Item>
                  )}
                />
              )}
            >
              {message.memories?.length && (
                <div
                  className={
                    ' py-1 px-2 rounded-[6px] cursor-pointer flex items-center gap-[6px] bg-[#F3F3FF] text-[#5252FF]'
                  }
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <g clipPath="url(#clip0_931_14388)">
                      <path
                        fillRule="evenodd"
                        clipRule="evenodd"
                        d="M6.94222 0.584881C7.33977 0.577484 7.73504 0.615914 8.11994 0.698233C8.44471 0.767691 8.6104 1.11488 8.49879 1.42768C8.38944 1.73411 8.05442 1.89109 7.73419 1.8335C7.48186 1.78812 7.22429 1.76735 6.96538 1.77217C6.28881 1.78476 5.6286 1.97159 5.05335 2.3126C4.47817 2.65358 4.00929 3.136 3.69449 3.70896C3.37971 4.28187 3.23015 4.92486 3.26073 5.57137C3.29132 6.21789 3.50098 6.84535 3.86875 7.38857C4.23657 7.93191 4.74937 8.37155 5.3547 8.66084C5.56318 8.76052 5.69537 8.96748 5.69537 9.19422V10.4798H8.38165V9.19422C8.38165 8.96688 8.51449 8.75947 8.72384 8.66011C8.8291 8.61014 9.01636 8.49512 9.20256 8.37434C9.48291 8.19249 9.8591 8.23283 10.0824 8.48145C10.3156 8.74111 10.29 9.12582 9.99453 9.31159C9.82817 9.4162 9.67181 9.50678 9.59722 9.54948V10.6037C9.59722 10.8885 9.47965 11.1599 9.27334 11.3587C9.06723 11.5572 8.78948 11.6673 8.50166 11.6673H5.57531C5.28749 11.6673 5.00977 11.5572 4.80369 11.3587C4.59732 11.1599 4.4798 10.8885 4.4798 10.6037V9.54849C3.8285 9.17384 3.27202 8.65985 2.85485 8.04367C2.36661 7.3224 2.08721 6.48772 2.04646 5.62619C2.0057 4.76464 2.20514 3.9087 2.62345 3.14736C3.04173 2.38608 3.6633 1.74761 4.42274 1.29741C5.18211 0.847239 6.05204 0.601453 6.94222 0.584881ZM9.81328 2.34348C9.91715 1.94216 10.4866 1.9408 10.5923 2.34163L10.6974 2.73968C10.8453 3.30021 11.2831 3.73798 11.8436 3.88591L12.2417 3.99095C12.6425 4.09673 12.6411 4.66614 12.2398 4.77002L11.8487 4.87126C11.2848 5.0172 10.8437 5.45624 10.695 6.01942L10.5923 6.40853C10.4866 6.80936 9.91715 6.80801 9.81328 6.40668L9.71436 6.0245C9.56773 5.45797 9.12532 5.01557 8.55879 4.86894L8.17661 4.77002C7.77529 4.66614 7.77393 4.09673 8.17476 3.99095L8.56388 3.88826C9.12705 3.73964 9.56609 3.29851 9.71204 2.73463L9.81328 2.34348ZM5.54164 12.2504C5.21952 12.2504 4.95849 12.5295 4.9585 12.8516C4.9585 13.1739 5.21977 13.417 5.54205 13.417H8.4585C8.78066 13.417 9.04183 13.1559 9.04183 12.8337C9.04183 12.5115 8.78066 12.2504 8.4585 12.2504H5.54164Z"
                        fill="#5252FF"
                      />
                    </g>
                    <defs>
                      <clipPath id="clip0_931_14388">
                        <rect width="14" height="14" fill="white" />
                      </clipPath>
                    </defs>
                  </svg>
                </div>
              )}
            </Trigger>
          </div>

          <div className={s.info}>
            <div className={s.requestId}>
              <div>Request ID</div>
              <div className={s.iconPart}>
                <Popover content={logId}>
                  <IconInfoCircle />
                </Popover>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const ChatMessage = ({ message, isLast }: { message: Message; isLast: boolean }) => {
  const { content, role, finish } = message;
  if (role === 'user') {
    return <UserMsg content={content} />;
  } else if (role === 'divider') {
    return <Divider />;
  } else {
    return <BotMsg message={message} isLast={isLast} />;
  }
};
