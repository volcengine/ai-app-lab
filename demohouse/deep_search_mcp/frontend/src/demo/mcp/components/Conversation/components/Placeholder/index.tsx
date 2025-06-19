import { FC, Fragment, useEffect, useMemo, useState } from 'react';

import clsx from 'classnames';

import styles from './index.module.less';

interface Props {
  /**
   * 智能体名字
   */
  name: string;

  /**
   * 智能体头像
   */
  avatar: string;

  /**
   * 智能体开场白
   */
  openingRemark:
    | string
    | {
        name: string;
        avatar: string;
        content: string;
      }[];

  /**
   * 预置问题
   */
  preQuestions: string[];

  /**
   * 点击问题事件
   * @param question
   */
  onQuestionClick: (question: string) => void;

  /**
   * 是否已经开始对话
   * 开启对话后，不再头像居中和展示预置问题
   */
  chatStarted: boolean;

  /**
   * 是否 disable preQ
   */
  disabled: boolean;
}

const Gap: FC<{ size: number }> = ({ size }) => <div style={{ height: size }} />;

/**
 * 智能体头像组件
 * @param avatar 头像地址
 * @constructor
 */
const Avatar = ({ avatar }: { avatar: string }) => (
  <img className="w-[72px] h-[72px] border-white border  border-solid rounded-full" src={avatar} alt="avatar" />
);

/**
 * 智能体名字组件
 * @param name
 * @constructor
 */
const Name = ({ name }: { name: string }) => (
  <div className="text-[color:var(--color-text-1)] text-base font-medium">{name}</div>
);

/**
 * 智能体开场白
 * @param openingRemark
 * @constructor
 */
const OpeningRemark = ({
  openingRemark,
}: {
  openingRemark:
    | string
    | {
        name: string;
        avatar: string;
        content: string;
      }[];
}) => {
  const isArray = Array.isArray(openingRemark);

  if (!openingRemark) {
    return null;
  }
  return isArray ? (
    <>
      {openingRemark
        .filter(o => Boolean(o.content))
        .map(({ avatar, name, content }, idx) => (
          <div className={clsx(idx !== 0 && 'mt-[20px]')} key={name}>
            <div className="flex items-center gap-[4px]">
              <img src={avatar} className="rounded-full w-[22px] h-[22px]" />
              <div className="text-[#737A87] text-[12px] max-w-[350px] overflow-hidden text-ellipsis">{name}</div>
            </div>
            <div className={clsx('ml-[26px]', styles.openingRemark)}>{content}</div>
          </div>
        ))}
    </>
  ) : (
    <div className={clsx(styles.singleOpeningRemark)}>{openingRemark}</div>
  );
};

const PreQuestions = ({
  preQuestions,
  onQuestionClick,
  disabled,
}: {
  preQuestions: string[];
  onQuestionClick: (question: string) => void;
  disabled?: boolean;
}) => {
  const questionPair = useMemo(
    () =>
      preQuestions.filter(preQ => Boolean(preQ)).map(question => [question, () => onQuestionClick(question)] as const),
    [preQuestions, onQuestionClick],
  );

  const [isAnimating, setIsAnimating] = useState(true);

  useEffect(() => {
    setIsAnimating(true);
    setTimeout(() => setIsAnimating(false), 500);
  }, []);

  return (
    <div className={`mt-6 flex flex-col justify-center items-center text-white text-sm  ${isAnimating ? '' : ''}`}>
      {questionPair.map(([question, onClick]) => (
        <Fragment key={question}>
          <div
            onClick={() => !disabled && onClick()}
            className={clsx(styles.preQItem, disabled && '!cursor-not-allowed')}
          >
            <div>{question}</div>
          </div>
          <Gap size={8} />
        </Fragment>
      ))}
    </div>
  );
};

export const Placeholder: FC<Props> = ({
  disabled,
  chatStarted,
  avatar,
  name,
  openingRemark,
  preQuestions,
  onQuestionClick,
}) => {
  const [isAnimating, setIsAnimating] = useState(true);
  useEffect(() => {
    setIsAnimating(true);
    setTimeout(() => setIsAnimating(false), 300);
  }, []);
  return (
    <div
      className={clsx(
        ' duration-300 px-[24px]',
        isAnimating ? styles.openRemarkContainerFadeIn : 'opacity-100',
        styles.openRemarkContainer,
        chatStarted && '!mt-[0]',
        chatStarted && !openingRemark?.length && 'h-0',
      )}
    >
      <div className={clsx(!openingRemark && 'mt-[160px]', 'self-center flex justify-center items-center flex-col')}>
        {!chatStarted && (
          <>
            <Avatar avatar={avatar} />
            <Gap size={16} />
            <Name name={name} />
          </>
        )}
      </div>
      {!chatStarted && <OpeningRemark openingRemark={openingRemark} />}
      {!chatStarted ? (
        <PreQuestions disabled={disabled} onQuestionClick={onQuestionClick} preQuestions={preQuestions} />
      ) : null}
    </div>
  );
};
