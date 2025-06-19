import { CSSProperties, ReactNode } from 'react';

export interface AIButtonProps {
  style?: CSSProperties;
  className?: string | string[];
  children?: ReactNode;
  /**
   * @zh
   * 按钮主要分为六种按钮类型：主要按钮、次级按钮、虚框按钮、文字按钮、线性按钮，`default` 为次级按钮。
   * @en
   * A variety of button types are available: `primary`, `secondary`, `dashed`,
   * `text`, `linear` and `default` which is the secondary.
   * @defaultValue default
   */
  type?: 'default' | 'primary' | 'text' | 'outline';
  /**
   * @zh 按钮的尺寸
   * @en Size of the button
   * @defaultValue default
   */
  size?: 'mini' | 'small' | 'default' | 'large';
  /**
   * @zh 按钮形状，`circle` - 圆形， `round` - 全圆角， `square` - 长方形
   * @en Three button shapes are available: `circle`, `round` and `square`
   * @defaultValue square
   */
  shape?: 'circle' | 'round' | 'square';
  /**
   * @zh 是否禁用
   * @en Whether to disable the button
   */
  disabled?: boolean;
  /**
   * @zh 按钮是否是加载状态
   * @en Whether the button is in the loading state
   */
  loading?: boolean;
  /**
   * @zh 设置按钮的图标
   * @en Icon of the button
   */
  icon?: ReactNode;
  /**
   * @zh 只有图标，按钮宽高相等。如果指定 `icon` 且没有 children，`iconOnly` 默认为 true
   * @en Whether to show icon only, in which case the button width and height are equal. If `icon` is specified and there are no children, `iconOnly` defaults to `true`
   */
  iconOnly?: boolean;
  /**
   * @zh 点击按钮的回调
   * @en Callback fired when the button is clicked
   */
  onClick?: (e: Event) => void;

  long?: boolean;
}
