import clsx from "clsx";
import ReactJson from "react-json-view";

export interface APIResultProps {
  result: boolean | undefined;
  message: string | object;
}

const APIResult = ({ result, message }: APIResultProps) => (
  <>
    {result !== undefined && (
      <div
        className={clsx("w-full", result ? "text-green-600" : "text-red-600")}
      >
        {`调用${result ? "成功" : "失败"}`}
        {Boolean(message) &&
          (typeof message === "object" ? (
            <div className="w-full overflow-x-scroll">
              <ReactJson name={false} src={message} />
            </div>
          ) : (
            <pre className="text-wrap break-all whitespace-pre-wrap">
              {message}
            </pre>
          ))}
      </div>
    )}
  </>
);

export default APIResult;
