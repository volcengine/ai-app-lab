import { onASRResult, startASR, stopASR } from 'multi-modal-sdk';
import { useEffect, useRef, useState } from 'react';
import APIResult from '../components/APIResult';
import Button from '../components/Button';
import Card from '../components/Card';
import Title from '../components/Title';

const ASR = () => {
  const [isListening, setIsListening] = useState(false);
  const unregisterRef = useRef<(() => void) | undefined>(undefined);
  const [received, setReceived] = useState(false);
  const [currentText, setCurrentText] = useState('');
  const [isFinished, setIsFinished] = useState(false);
  const [apiResult, setApiResult] = useState<boolean | undefined>();
  const [message, setMessage] = useState('');

  useEffect(
    () => () => {
      if (unregisterRef.current) {
        unregisterRef.current();
      }
    },
    [],
  );

  const toggleListening = () => {
    if (unregisterRef.current) {
      unregisterRef.current();
      unregisterRef.current = undefined;
      setIsListening(false);
    } else {
      unregisterRef.current = onASRResult(({ text, isFinished: finished }) => {
        setReceived(true);
        setCurrentText(text);
        setIsFinished(finished || false);
      });
      setIsListening(true);
    }
  };

  const doStartASR = async () => {
    try {
      await startASR();
      setApiResult(true);
      setMessage('');
    } catch (e) {
      setApiResult(false);
      setMessage(e?.toString() || '');
    }
  };

  const doStopASR = async () => {
    try {
      await stopASR();
      setApiResult(true);
      setMessage('');
    } catch (e) {
      setApiResult(false);
      setMessage(e?.toString() || '');
    }
  };

  return (
    <Card>
      <Title>ASR</Title>
      <div className="flex flex-col gap-2 items-start">
        <div className="flex gap-2 items-center">
          <Button onClick={toggleListening}>监听事件</Button>
          {isListening && '正在监听 ASR 事件'}
        </div>
        <div className="flex gap-2">
          <Button onClick={doStartASR}>startASR</Button>
          <Button onClick={doStopASR}>stopASR</Button>
        </div>
        <APIResult result={apiResult} message={message} />
        {received && (
          <div>
            {isFinished ? '【接收完毕】' : '【接收中】'}
            {currentText}
          </div>
        )}
      </div>
    </Card>
  );
};

export default ASR;
