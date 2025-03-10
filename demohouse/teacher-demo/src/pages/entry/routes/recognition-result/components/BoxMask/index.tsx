import React from 'react';

import styles from './index.module.less';
import { EQUESTIONSTATUS } from '@/pages/entry/routes/recognition-result/components/AnswerCard';

interface Props {
  status?: EQUESTIONSTATUS;
  onClick?: () => void;
  idx: number;
  position: {
    x: number;
    y: number;
  };
  isSelected?: boolean;
  size: {
    width: number;
    height: number;
  };
}

const BoxMask = (props: Props) => {
  const { isSelected, idx, position, size, status, onClick } = props;

  return (
    <div
      className={`${styles['border-box']} ${
        status === EQUESTIONSTATUS.CORRECTING
          ? ` ${isSelected ? '' : 'bg-[#0000001a]'}  flex justify-center items-center`
          : 'flex justify-end items-center pr-3'
      } `}
      onClick={onClick}
      style={{ top: position.y, left: position.x, width: size.width, height: size.height }}
    >
      {status === EQUESTIONSTATUS.NONE && <span className={styles.ai}>AI解析</span>}
      {isSelected && (
        <>
          <div
            className={`${styles.icon} ${styles.center} ${
              status === EQUESTIONSTATUS.TRUE ? 'bg-[#0AB76A]' : ''
            } ${status === EQUESTIONSTATUS.FALSE ? 'bg-[#D7312A]' : ''} ${
              status === EQUESTIONSTATUS.CORRECTING || status === EQUESTIONSTATUS.NONE ? 'bg-[#767676]' : ''
            } `}
          />
          <span
            className={`absolute text-white top-[-26px] ${
              status === EQUESTIONSTATUS.CORRECTING ? 'text-[#C7CCD6]' : 'text-white'
            } ${styles.center} `}
          >
            {idx + 1}
          </span>

          {status === EQUESTIONSTATUS.TRUE && (
            <svg
              className={`absolute top-[-8px] ${styles.center}`}
              xmlns="http://www.w3.org/2000/svg"
              width="13"
              height="5"
              viewBox="0 0 13 5"
              fill="none"
            >
              <path d="M6.5 5L0.00480994 0.5L12.9952 0.499999L6.5 5Z" fill="#0AB76A" />
            </svg>
          )}
          {status === EQUESTIONSTATUS.FALSE && (
            <svg
              className={`absolute top-[-8px] ${styles.center}`}
              xmlns="http://www.w3.org/2000/svg"
              width="13"
              height="5"
              viewBox="0 0 13 5"
              fill="none"
            >
              <path d="M6.5 5L0.00480994 0.5L12.9952 0.499999L6.5 5Z" fill="#D7312A" />
            </svg>
          )}
          {(status === EQUESTIONSTATUS.CORRECTING || status === EQUESTIONSTATUS.NONE) && (
            <svg
              className={`absolute top-[-8px] ${styles.center}`}
              xmlns="http://www.w3.org/2000/svg"
              width="13"
              height="5"
              viewBox="0 0 13 5"
              fill="none"
            >
              <path d="M6.5 5L0.00480994 0.5L12.9952 0.499999L6.5 5Z" fill="#767676" />
            </svg>
          )}
        </>
      )}

      {status === EQUESTIONSTATUS.CORRECTING && (
        <div className="flex gap-[2px]">
          <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 11 11" fill="none">
            <path
              opacity="0.5"
              d="M5.37538 1.0876C5.55147 0.714005 6.08249 0.714005 6.18426 1.0876L6.90689 3.74047C6.98224 4.01706 7.17969 4.23513 7.44747 4.33748L10.0158 5.31913C10.3775 5.45737 10.3249 5.98578 9.93573 6.12403L7.17214 7.10568C6.88401 7.20803 6.64317 7.4261 6.51281 7.70269L5.26246 10.3556C5.08637 10.7292 4.55536 10.7292 4.45359 10.3556L3.73095 7.70269C3.65561 7.4261 3.45815 7.20803 3.19038 7.10568L0.622052 6.12403C0.260361 5.98578 0.312917 5.45737 0.702108 5.31913L3.4657 4.33748C3.75383 4.23513 3.99467 4.01706 4.12503 3.74047L5.37538 1.0876Z"
              fill="white"
            />
          </svg>
          <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 11 11" fill="none">
            <path
              opacity="0.75"
              d="M5.41323 1.0876C5.58931 0.714005 6.12033 0.714005 6.2221 1.0876L6.94474 3.74047C7.02008 4.01706 7.21754 4.23513 7.48531 4.33748L10.0536 5.31913C10.4153 5.45737 10.3628 5.98578 9.97358 6.12403L7.20998 7.10568C6.92185 7.20803 6.68101 7.4261 6.55065 7.70269L5.3003 10.3556C5.12422 10.7292 4.5932 10.7292 4.49143 10.3556L3.76879 7.70269C3.69345 7.4261 3.49599 7.20803 3.22822 7.10568L0.659894 6.12403C0.298202 5.98578 0.350759 5.45737 0.73995 5.31913L3.50354 4.33748C3.79168 4.23513 4.03252 4.01706 4.16288 3.74047L5.41323 1.0876Z"
              fill="white"
            />
          </svg>
          <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 11 11" fill="none">
            <path
              d="M5.45082 1.0876C5.62691 0.714005 6.15793 0.714005 6.25969 1.0876L6.98233 3.74047C7.05768 4.01706 7.25513 4.23513 7.52291 4.33748L10.0912 5.31913C10.4529 5.45737 10.4004 5.98578 10.0112 6.12403L7.24758 7.10568C6.95945 7.20803 6.71861 7.4261 6.58825 7.70269L5.3379 10.3556C5.16181 10.7292 4.63079 10.7292 4.52903 10.3556L3.80639 7.70269C3.73105 7.4261 3.53359 7.20803 3.26581 7.10568L0.697492 6.12403C0.3358 5.98578 0.388356 5.45737 0.777548 5.31913L3.54114 4.33748C3.82927 4.23513 4.07011 4.01706 4.20047 3.74047L5.45082 1.0876Z"
              fill="white"
            />
          </svg>
        </div>
      )}
      {status === EQUESTIONSTATUS.TRUE && (
        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28" fill="none">
          <path
            d="M24.8726 5.73713C24.7875 5.55696 24.6626 5.39915 24.5076 5.27598C24.3525 5.15281 24.1715 5.06762 23.9787 5.02705C23.7858 4.98647 23.5864 4.99161 23.3958 5.04206C23.2052 5.09251 23.0287 5.18691 22.88 5.3179L10.8792 15.8866C10.8549 15.9079 10.8234 15.919 10.7913 15.9177C10.7592 15.9163 10.7288 15.9025 10.7063 15.8792L6.42883 11.4073C6.28849 11.2606 6.11597 11.1496 5.92531 11.0833C5.73466 11.017 5.53126 10.9973 5.33169 11.0258C5.13211 11.0544 4.942 11.1303 4.77684 11.2474C4.61168 11.3646 4.47613 11.5196 4.38123 11.7L3.15163 14.0333C3.03268 14.2582 2.98192 14.5138 3.00573 14.7678C3.02954 15.0219 3.12686 15.2632 3.28546 15.4614L9.71197 23.5182C9.83171 23.6689 9.98328 23.7904 10.1555 23.8738C10.3277 23.9572 10.5162 24.0003 10.707 24H10.7084C10.8995 24 11.0882 23.9565 11.2605 23.8726C11.4328 23.7887 11.5843 23.6666 11.7038 23.5154L24.7147 7.11146C24.8675 6.92149 24.9635 6.69117 24.9915 6.44767C25.0195 6.20417 24.9782 5.95764 24.8726 5.73713Z"
            fill="#0AB76A"
          />
        </svg>
      )}
      {status === EQUESTIONSTATUS.FALSE && (
        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28" fill="none">
          <path
            d="M6.5032 22.5385L5.58802 21.6234C5.2646 21.3 5.26827 20.7745 5.59618 20.4556L20.8183 5.65292C21.2344 5.2483 21.8333 5.09371 22.3932 5.24642L24.5401 5.83191C25.1682 6.00323 25.3558 6.80308 24.8693 7.23581L7.62807 22.5714C7.30357 22.8601 6.81029 22.8456 6.5032 22.5385Z"
            fill="#D7312A"
          />
          <path
            d="M18.3616 22.1324L6.57431 11.0818C6.18888 10.7205 6.2407 10.0943 6.68029 9.80123L8.92133 8.3072C9.25967 8.08164 9.71221 8.13809 9.98478 8.43986L20.4686 20.047C20.7613 20.3711 20.7487 20.8677 20.4399 21.1765L19.5024 22.114C19.1894 22.427 18.6845 22.4352 18.3616 22.1324Z"
            fill="#D7312A"
          />
        </svg>
      )}
    </div>
  );
};

export default BoxMask;
