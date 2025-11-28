/*
 * Copyright (c) 2025 Bytedance Ltd. and/or its affiliates
 * Licensed under the 【火山方舟】原型应用软件自用许可协议
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at 
 *     https://www.volcengine.com/docs/82379/1433703
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { CSSProperties, FC, ReactNode, useEffect, useState } from "react";
import { motion, AnimatePresence, Variants } from "framer-motion";
import {
  StorybookChangeButton,
  StorybookChangeButtonProps,
} from "../ChangeButton";
import { ReactComponent as IconClose } from "./assets/close.svg";
import { ReactComponent as IconBook } from "./assets/book.svg";
import { ReactComponent as IconZoomIn } from "./assets/zoom-in.svg";
import { ReactComponent as IconZoomOut } from "./assets/zoom-out.svg";
import { useMemoizedFn } from "ahooks";
import cls from "classnames";

export interface FullScreenProps {
  onClose?: () => void;
  title?: string;
  navLeft?: ReactNode;
  navRight?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
  style?: CSSProperties;
  onVisibleChange?: (visible: boolean) => void;
  onFullScreenClose?: () => void;
  onOpen?: () => void;
  button?: ReactNode;
  changeButton?: StorybookChangeButtonProps;
  containerClassName?: string;
}

const FullScreen: FC<FullScreenProps> = (props) => {
  const {
    onClose,
    title,
    navLeft,
    navRight,
    children,
    footer,
    className,
    style,
    onVisibleChange,
    onFullScreenClose,
    onOpen,
    button,
    changeButton,
    containerClassName = "",
  } = props;
  const [visible, setVisible] = useState(false);

  const handleClose = useMemoizedFn(() => {
    setVisible(false);
    onClose?.();
  });
  const handleFullScreenClose = useMemoizedFn(() => {
    setVisible(false);
    onFullScreenClose?.();
  });
  useEffect(() => {
    onVisibleChange?.(visible);
  }, [visible]);

  // 动画变体配置
  const overlayVariants: Variants = {
    hidden: {
      opacity: 0,
      backdropFilter: "blur(0px)",
    },
    visible: {
      opacity: 1,
      backdropFilter: "blur(8px)",
      transition: {
        duration: 0.3,
        ease: "easeOut",
      },
    },
    exit: {
      opacity: 0,
      backdropFilter: "blur(0px)",
      transition: {
        duration: 0.25,
        ease: "easeIn",
      },
    },
  };

  const containerVariants: Variants = {
    hidden: {
      scale: 0.95,
      opacity: 0,
      y: 20,
    },
    visible: {
      scale: 1,
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.3,
        ease: [0.25, 0.46, 0.45, 0.94], // cubic-bezier easing
        staggerChildren: 0.05,
        delayChildren: 0.1,
      },
    },
    exit: {
      scale: 0.95,
      opacity: 0,
      y: 20,
      transition: {
        duration: 0.25,
        ease: "easeIn",
      },
    },
  };

  const headerVariants: Variants = {
    hidden: {
      opacity: 0,
      y: -20,
    },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.3,
        ease: "easeOut",
      },
    },
  };

  const contentVariants: Variants = {
    hidden: {
      opacity: 0,
      y: 30,
    },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.4,
        ease: "easeOut",
        delay: 0.1,
      },
    },
  };

  return (
    <>
      <motion.div
        onClick={() => {
          setVisible(true);
          onOpen?.();
        }}
        className={cls(
          "cursor-pointer inline-flex items-center justify-center p-[2px] hover:bg-[#E1E3EF] rounded-[4px] transition-colors",
          containerClassName
        )}
        // whileHover={{ scale: 1.2 }}
        // whileTap={{ scale: 0.9 }}
        // transition={{ duration: 0.2, ease: 'easeInOut'hover:bg-gray-100  }}
      >
        {button ? button : <IconZoomOut className="cursor-pointer" />}
      </motion.div>

      <AnimatePresence mode="wait">
        {visible && (
          <>
            {/* 背景遮罩 */}
            <motion.div
              className="fixed inset-0 bg-black/50 z-40"
              variants={overlayVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              onClick={handleClose}
            />

            {/* 主容器 */}
            <motion.div
              className={cls(
                "w-full h-full flex flex-col fixed top-0 left-0 z-[999] bg-white !ml-0",
                className
              )}
              style={style}
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              {/* 头部导航栏 */}
              <motion.div
                className="w-full flex items-center justify-between py-4 px-5 border-b border-gray-200"
                variants={headerVariants}
              >
                <div className="flex items-center gap-4 flex-1 justify-start w-0">
                  {navLeft ? (
                    navLeft
                  ) : (
                    <>
                      <motion.div
                        onClick={handleClose}
                        className="cursor-pointer rounded-lg transition-colors flex items-center justify-center hover:bg-[#E1E3EF] rounded-[4px] flex-none"
                        // whileHover={{ scale: 1.1, rotate: 90 }}
                        // whileTap={{ scale: 0.95 }}
                        // transition={{ duration: 0.2, ease: 'easeInOut',hover:bg-gray-100 }}
                      >
                        <IconClose className="w-6 h-6" />
                      </motion.div>
                      <motion.div
                        className="flex items-center gap-2 flex-1 min-w-0"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.2, duration: 0.3 }}
                      >
                        <div className="w-[1px] h-5 bg-gray-200"></div>
                        <IconBook className="w-5 h-5 flex-none" />
                        <div className="font-medium text-gray-900 line-clamp-1 truncate">
                          {title}
                        </div>
                      </motion.div>
                    </>
                  )}
                </div>

                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.3, duration: 0.3 }}
                  className="flex items-center justify-center flex-1"
                >
                  <StorybookChangeButton {...changeButton} />
                </motion.div>

                {navRight ? (
                  <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.2, duration: 0.3 }}
                    className="flex items-center gap-4 flex-1 justify-end cursor-pointer"
                  >
                    <div className="w-fit">{navRight}</div>
                  </motion.div>
                ) : (
                  <motion.div
                    className="cursor-pointer flex items-center  transition-colors   flex-1 justify-end"
                    // whileHover={{ scale: 1.2 }}
                    // whileTap={{ scale: 0.9 }}
                    // transition={{ duration: 0.2, ease: 'easeInOut'hover:bg-gray-100 }}
                    onClick={handleFullScreenClose}
                  >
                    <div className="w-fit hover:bg-[#E1E3EF] rounded-[4px]">
                      <IconZoomIn className="w-6 h-6 cursor-pointer" />
                    </div>
                  </motion.div>
                )}
              </motion.div>

              {/* 主要内容区域 */}
              <motion.div
                className="flex-1 overflow-auto"
                variants={contentVariants}
              >
                {children}
              </motion.div>

              {/* 底部区域 */}
              {footer && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4, duration: 0.3 }}
                  className="border-t border-gray-200"
                >
                  {footer}
                </motion.div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};

export { FullScreen };
