// Copyright (c) 2025 Bytedance Ltd. and/or its affiliates
// Licensed under the 【火山方舟】原型应用软件自用许可协议
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at 
//     https://www.volcengine.com/docs/82379/1433703
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

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
