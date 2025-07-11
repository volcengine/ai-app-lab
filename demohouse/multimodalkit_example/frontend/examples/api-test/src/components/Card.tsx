import type { ReactNode } from "react";

const Card = ({ children }: { children?: ReactNode }) => (
  <div className="p-4 border border-gray-300 rounded-md shadow-md">
    {children}
  </div>
);

export default Card;
