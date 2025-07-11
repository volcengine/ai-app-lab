import { getImageInfo, getObjectDetectList, getSAMInfo } from "multi-modal-sdk";
import { useCallback, useState } from "react";
import APIResult from "../components/APIResult";
import Button from "../components/Button";
import Card from "../components/Card";
import Title from "../components/Title";
import useImageId from "../hooks/useImageId";
import MattingCanvas from "../components/MattingCanvas";

const Visual = () => {
  const imageId = useImageId();
  const [result, setResult] = useState<boolean | undefined>();
  const [message, setMessage] = useState<string | object>("");
  const [apiCalling, setApiCalling] = useState(false);
  const [showMatting, setShowMatting] = useState(false);

  const doGetImageInfo = useCallback(async () => {
    try {
      setApiCalling(true);
      const res = await getImageInfo({ imageId });
      setResult(true);
      setMessage(res);
    } catch (e) {
      setResult(false);
      setMessage(e?.toString() || "");
    } finally {
      setApiCalling(false);
    }
  }, [imageId]);

  const doGetObjectDetectList = useCallback(async () => {
    try {
      setApiCalling(true);
      const res = await getObjectDetectList({ imageId });
      setResult(true);
      setMessage(res);
    } catch (e) {
      setResult(false);
      setMessage(e?.toString() || "");
    } finally {
      setApiCalling(false);
    }
  }, [imageId]);

  const doGetSAMInfo = useCallback(async () => {
    try {
      setApiCalling(true);
      const res = await getSAMInfo({
        imageId,
        points: [{ x: 100, y: 100, label: 1 }],
      });
      setResult(true);
      setMessage(res);
    } catch (e) {
      setResult(false);
      setMessage(e?.toString() || "");
    } finally {
      setApiCalling(false);
    }
  }, [imageId]);

  return (
    <Card>
      <Title>Visual</Title>
      <div className="flex flex-col gap-2 items-start">
        <div className="flex gap-1 flex-wrap">
          <Button onClick={doGetImageInfo} disabled={!imageId || apiCalling}>
            getImageInfo
          </Button>
          <Button
            onClick={doGetObjectDetectList}
            disabled={!imageId || apiCalling}
          >
            getObjectDetectList
          </Button>
          <Button onClick={doGetSAMInfo} disabled={!imageId || apiCalling}>
            getSAMInfo
          </Button>
          <Button onClick={() => setShowMatting(true)} disabled={!imageId || apiCalling}>
            抠图/物体检测演示
          </Button>
        </div>
        <APIResult result={result} message={message} />
      </div>
      {showMatting && imageId && <MattingCanvas imageId={imageId} onClose={() => setShowMatting(false)} />}
    </Card>
  );
};

export default Visual;
