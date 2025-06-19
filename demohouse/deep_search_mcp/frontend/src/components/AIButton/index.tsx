import React, { type ReactNode } from 'react';

import cs from 'classnames';

import { IconLoadingAiLine, IconLoadingAiLineColor } from '@/icon';
import type { AIButtonProps } from './interface';
import styles from './style/index.module.less';

const prefixCls = 'ark-ai-btn';

function processChildren(children?: ReactNode) {
  const childrenList: any[] = [];
  let isPrevChildPure = false;
  React.Children.forEach(children, child => {
    const isCurrentChildPure =
      typeof child === 'string' || typeof child === 'number';
    if (isCurrentChildPure && isPrevChildPure) {
      const lastIndex = childrenList.length - 1;
      const lastChild = childrenList[lastIndex];
      childrenList[lastIndex] = `${lastChild}${child}`;
    } else {
      childrenList.push(child);
    }
    isPrevChildPure = isCurrentChildPure;
  });
  return React.Children.map(childrenList, child =>
    typeof child === 'string' ? <span>{child}</span> : child,
  );
}

export const AIButton = (props: AIButtonProps) => {
  const {
    style,
    className,
    children,
    type = 'default',
    size,
    shape = 'square',
    disabled,
    loading,
    icon,
    iconOnly,
    onClick,
    ...rest
  } = props;

  const loadingIconNode =
    type === 'outline' ? (
      <IconLoadingAiLineColor spin />
    ) : (
      <IconLoadingAiLine spin />
    );
  const iconNode = loading ? loadingIconNode : icon;

  const InnerContent = (
    <>
      {iconNode}
      {processChildren(children)}
    </>
  );

  const _type = type === 'default' ? 'secondary' : type;
  const classNames = cs(
    styles[prefixCls],
    styles[`${prefixCls}-${_type}`],
    styles[`${prefixCls}-size-${size || 'default'}`],
    styles[`${prefixCls}-shape-${shape}`],
    {
      [styles[`${prefixCls}-loading`]]: loading,
      [styles[`${prefixCls}-icon-only`]]:
        iconOnly || (!children && children !== 0 && iconNode),
      [styles[`${prefixCls}-disabled`]]: disabled,
    },
    className,
  );

  const handleClick: React.MouseEventHandler<HTMLElement> = (
    event: any,
  ): void => {
    if (loading || disabled) {
      typeof event?.preventDefault === 'function' && event.preventDefault();
      return;
    }
    onClick && onClick(event);
  };

  return (
    <button
      {...rest}
      style={style}
      className={classNames}
      type="button"
      disabled={disabled}
      onClick={handleClick}
    >
      {InnerContent}
    </button>
  );
};

export default AIButton;
