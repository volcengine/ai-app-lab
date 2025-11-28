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

import { CSSProperties, FC, PropsWithChildren, ReactNode } from "react";
import { FullScreen, FullScreenProps } from "../Fullscreen";
import {
  StorybookChangeButton,
  StorybookChangeButtonProps,
} from "../ChangeButton";
import { ReactComponent as IconClose } from "./assets/close.svg";
import { ReactComponent as IconBook } from "./assets/book.svg";
import { ReactComponent as IconShared } from "./assets/shared.svg";
import cls from "classnames";
import { useResponsiveState } from "../hooks/useResponsiveState";
export interface ICanvasHeaderProps {
  title?: string;
  renderRight?: (fullscreenIcon: ReactNode) => ReactNode;
  onClose?: () => void;
  className?: string;
  style?: CSSProperties;
  fullScreen?: FullScreenProps;
  changeButton?: StorybookChangeButtonProps;
  onShare?: () => void;
  mobileShare?: boolean;
  slots?: IVsStoryBookSlots;
}
export interface IVsStoryBookSlots {
  titleArea?: (titleNode: ReactNode) => ReactNode | string;
  shareArea?: (shareNode: ReactNode) => ReactNode | string;
}
const CanvasHeader: FC<PropsWithChildren<ICanvasHeaderProps>> = (props) => {
  const {
    children,
    title,
    renderRight,
    onClose,
    className,
    style,
    fullScreen,
    changeButton,
    onShare,
    mobileShare,
    slots = {},
  } = props;
  const device = useResponsiveState(
    [
      { value: "mobile", matchMedia: "(min-width: 0px)" },
      { value: "desktop", matchMedia: "(min-width: 768px)" },
    ],
    {
      defaultValue: "desktop",
    }
  );
  //   if (device === "mobile") {
  //     return (
  //       <div
  //         className={cls(
  //           "flex items-center justify-between w-full py-4 px-5 cursor-pointer",
  //           className
  //         )}
  //         style={style}
  //       >
  //         <div className="flex items-center space-x-2">
  //           <div className=" flex items-center" onClick={onClose}>
  //             <IconClose />
  //           </div>
  //           <div className="w-[1px] h-5 bg-gray-200"></div>
  //           <div className="flex items-center space-x-2">
  //             <IconBook />
  //             <div className="text-[14px] leading-6 font-medium text-[#0c0d0e]">
  //               {title}
  //             </div>
  //           </div>
  //         </div>
  //         {mobileShare ? (
  //           <div className="flex items-center" onClick={onShare}>
  //             <IconShared />
  //           </div>
  //         ) : null}
  //       </div>
  //     );
  //   }

  const titleNode = (
    <div className="text-[14px] leading-6 font-medium text-[#0c0d0e] truncate line-clamp-1">
      {title}
    </div>
  );

  const titleArea = slots.titleArea?.(titleNode) ?? (
    <>
      <IconBook />
      {titleNode}
    </>
  );
  const shareNode = (
    <div
      className="flex items-center p-[4px] hover:bg-[#E1E3EF] rounded-[4px]"
      onClick={onShare}
    >
      <IconShared />
    </div>
  );
  const shareArea = slots.shareArea?.(shareNode) ?? shareNode;

  return (
    <div
      className={cls(
        "flex items-center justify-between w-full cursor-pointer",
        className
      )}
      style={style}
    >
      <div className="flex items-center space-x-2 flex-1 line-clamp-1 justify-start truncate">
        {titleArea}
      </div>
      <StorybookChangeButton {...changeButton} />
      <div className="flex items-center space-x-3 flex-1 justify-end">
        <div className="flex items-center space-x-3 ">
          <div className="space-x-4 flex items-center cursor-pointer">
            {shareArea}
            <FullScreen
              changeButton={changeButton}
              {...fullScreen}
              title={title}
            >
              {children}
            </FullScreen>
          </div>
        </div>
        <div className="w-[1px] h-5 bg-gray-200"></div>
        <div
          className="flex items-center cursor-pointer hover:bg-[#E1E3EF] rounded-[4px]"
          onClick={onClose}
        >
          <IconClose />
        </div>
      </div>
    </div>
  );
};
export { CanvasHeader };
