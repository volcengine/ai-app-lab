"use client";

import Link from "next/link";
import { FC } from "react";
import { IconQuestionCircle } from "@arco-design/web-react/icon";

export const Header: FC = () => {
  return (
    <header className="bg-white shadow-[0px_2px_6px_0px_#00000014] h-12 sticky top-0 z-50">
      <div className="flex h-full items-center px-4 justify-between">
        <div className="flex items-center">
          <Link
            href="/"
            className="flex items-center gap-2.5 hover:opacity-90 transition-opacity"
          >
            <img alt="Logo" src="/images/logo.png" className="h-6 w-6 inline" />
            <span className="font-[Roboto] font-medium text-base leading-6 tracking-[0.3%] text-[#0C0D0E]">
              Computer Use Agent
            </span>
          </Link>
        </div>
        <div className="flex items-center gap-6">
          <IconQuestionCircle className="text-[#42464E]" />
          <img
            src="images/avatar.png"
            className="h-6 w-6 mr-2 inline rounded-full border border-indigo-600/30"
          />
        </div>
      </div>
    </header>
  );
};
