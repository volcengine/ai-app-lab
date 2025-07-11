import clsx from "clsx";
import type { ReactNode } from "react";

export interface ButtonProps {
  block?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children?: ReactNode;
}

const Button = ({
  block = false,
  disabled = false,
  onClick,
  children,
}: ButtonProps) => (
  <div
    className={clsx(
      "px-3 py-2 text-white rounded-sm select-none transition-colors duration-300",
      block ? "block" : "inline-block",
      disabled
        ? "bg-blue-300 cursor-not-allowed"
        : "bg-blue-500 hover:bg-blue-600 cursor-pointer"
    )}
    onClick={() => {
      if (!disabled && onClick) onClick();
    }}
  >
    {children}
  </div>
);

export default Button;
