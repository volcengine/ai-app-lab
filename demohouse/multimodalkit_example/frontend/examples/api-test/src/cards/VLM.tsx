import {
  chatCompletion,
  chatCompletionStreaming,
  getImageInfo,
  readCompletionStreaming,
} from "multi-modal-sdk";
import { useCallback, useState } from "react";
import APIResult from "../components/APIResult";
import Button from "../components/Button";
import Card from "../components/Card";
import TextInput from "../components/TextInput";
import Title from "../components/Title";
import useImageId from "../hooks/useImageId";

const VLM = () => {
  const imageId = useImageId();
  const [imageData, setImageData] = useState("");
  const [text, setText] = useState("图片里都有什么？");
  const [callingAPI, setCallingAPI] = useState(false);
  const [result, setResult] = useState<boolean | undefined>();
  const [message, setMessage] = useState("");
  const [answer, setAnswer] = useState("");

  const doGetImage = useCallback(async () => {
    setCallingAPI(true);
    try {
      if (!imageId) throw new Error("empty image id");
      const { base64Image } = await getImageInfo({ imageId });
      if (!base64Image) throw new Error("failed to get image data");
      setImageData(base64Image);
      setResult(true);
      setMessage(`imageId: ${imageId}`);
    } catch (e) {
      setResult(false);
      setMessage(e?.toString() || "");
    } finally {
      setCallingAPI(false);
    }
  }, [imageId]);

  const doChatCompletion = useCallback(async () => {
    setCallingAPI(true);
    try {
      const { answer: ans } = await chatCompletion({
        base64Image: imageData,
        query: text,
      });
      setResult(true);
      setMessage("");
      setAnswer(ans);
    } catch (e) {
      setResult(false);
      setMessage(e?.toString() || "");
    } finally {
      setCallingAPI(false);
    }
  }, [imageData, text]);

  const doChatCompletionStreaming = useCallback(async () => {
    setCallingAPI(true);
    try {
      const { streamingId } = await chatCompletionStreaming({
        base64Image: imageData,
        query: text,
      });
      if (!streamingId) throw new Error("failed to create completion stream");
      setResult(true);
      setMessage(`streamingId: ${streamingId}`);
      let accumulated = "";
      let isFinished = false;
      let newText = "";
      let i = 0;
      while (!isFinished) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        ({ isFinished, newText } = await readCompletionStreaming({
          streamingId,
        }));
        setResult(true);
        setMessage(`读取流式消息 ${++i} 次${isFinished ? "，已结束" : ""}`);
        accumulated += newText;
        setAnswer(accumulated);
      }
    } catch (e) {
      setResult(false);
      setMessage(e?.toString() || "");
    } finally {
      setCallingAPI(false);
    }
  }, [imageData, text]);

  return (
    <Card>
      <Title>VLM</Title>
      <div className="flex flex-col gap-2 items-start">
        <div className="w-full">
          问题
          <TextInput
            value={text}
            placeholder="提示词"
            disabled={callingAPI}
            onChange={setText}
          />
        </div>
        <div className="flex gap-1 flex-wrap">
          <Button disabled={callingAPI || !imageId} onClick={doGetImage}>
            从 image id 获取图片
          </Button>
          <Button
            disabled={!imageData || callingAPI}
            onClick={doChatCompletion}
          >
            非流式对话
          </Button>
          <Button
            disabled={!imageData || callingAPI}
            onClick={doChatCompletionStreaming}
          >
            流式对话
          </Button>
        </div>
        <APIResult result={result} message={message} />
        {answer}
      </div>
    </Card>
  );
};

export default VLM;
