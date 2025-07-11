import type { ReactNode } from "react";

const Title = ({ children }: { children?: ReactNode }) => (
  <h2 className="mb-4 p-2 pt-0 border-b border-gray-300 font-bold">
    {children}
  </h2>
);

export default Title;
