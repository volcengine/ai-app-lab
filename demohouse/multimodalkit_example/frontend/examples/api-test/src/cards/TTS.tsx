import {
  appendStreamingTTS,
  cancelStreamingTTS,
  cancelTTS,
  createStreamingTTS,
  startTTS,
} from 'multi-modal-sdk';
import { useCallback, useState } from 'react';
import APIResult from '../components/APIResult';
import Button from '../components/Button';
import Card from '../components/Card';
import Selection from '../components/Selection';
import TextInput from '../components/TextInput';
import Title from '../components/Title';

const speakers = [
  'zh_female_tianmeixiaoyuan_moon_bigtts',
  'zh_female_kailangjiejie_moon_bigtts',
  'zh_male_dongfanghaoran_moon_bigtts',
  'en_male_jason_conversation_wvae_bigtts',
  'en_female_sarah_new_conversation_wvae_bigtts',
];

function sendStreamingTTSMessage(
  id: string,
  message: string,
  cb: (sentMessage: string) => void,
) {
  let sent = '';
  let toSend = message;
  const t = setInterval(async () => {
    if (toSend.length <= 3) {
      clearInterval(t);
      await appendStreamingTTS({
        streamingId: id,
        newText: toSend,
        isFinish: true,
      });
      sent += toSend;
      cb(sent);
    } else {
      const chunk = toSend.substring(0, 3);
      toSend = toSend.substring(3);
      sent += chunk;
      await appendStreamingTTS({
        streamingId: id,
        newText: chunk,
        isFinish: false,
      });
      cb(sent);
    }
  }, 200);
}

const TTS = () => {
  const [content, setContent] = useState('这些是要播报的文本');
  const [currentSpeaker, setCurrentSpeaker] = useState(0);
  const [apiResult, setApiResult] = useState<boolean | undefined>();
  const [message, setMessage] = useState('');
  const [streamingContent, setStreamingContent] = useState(
    '这是一段要播报的文本，这是另一段要播报的文本',
  );
  const [streamingId, setStreamingId] = useState<string | undefined>();
  const [sentMessage, setSentMessage] = useState('');
  const [streamingApiResult, setStreamingApiResult] = useState<
    boolean | undefined
  >();
  const [streamingMessage, setStreamingMessage] = useState('');

  const doStartTTS = useCallback(async () => {
    try {
      await startTTS({
        text: content,
        config: { speaker: speakers[currentSpeaker] },
      });
      setApiResult(true);
      setMessage('');
    } catch (e) {
      setApiResult(false);
      setMessage(e?.toString() || '');
    }
  }, [content, currentSpeaker]);

  const doCancelTTS = useCallback(async () => {
    try {
      await cancelTTS();
      setApiResult(true);
      setMessage('');
    } catch (e) {
      setApiResult(false);
      setMessage(e?.toString() || '');
    }
  }, []);

  const doCreateStreamingTTS = useCallback(async () => {
    try {
      const { streamingId: id } = await createStreamingTTS({
        speaker: speakers[currentSpeaker],
      });
      setStreamingApiResult(true);
      setStreamingMessage(`streamingId: ${id}`);
      setStreamingId(id);
      setSentMessage('');
      sendStreamingTTSMessage(id, streamingContent, setSentMessage);
    } catch (e) {
      setStreamingApiResult(false);
      setStreamingMessage(e?.toString() || '');
    }
  }, [currentSpeaker, streamingContent]);

  const doCancelStreamingTTS = useCallback(async (id: string) => {
    try {
      await cancelStreamingTTS({ streamingId: id });
      setStreamingApiResult(true);
      setStreamingMessage('');
      setStreamingId(undefined);
    } catch (e) {
      setStreamingApiResult(false);
      setStreamingMessage(e?.toString() || '');
    }
  }, []);

  return (
    <Card>
      <Title>TTS</Title>
      <div className="flex flex-col items-stretch gap-2">
        <div>
          播报文本
          <TextInput value={content} onChange={setContent} />
        </div>
        <div>
          音色
          <Selection
            items={speakers}
            value={currentSpeaker}
            onChange={setCurrentSpeaker}
          />
        </div>
        <div className="flex gap-2">
          <Button onClick={doStartTTS}>播放 TTS</Button>
          <Button onClick={doCancelTTS}>停止 TTS</Button>
        </div>
        <APIResult result={apiResult} message={message} />
        <div>
          播报文本
          <TextInput value={streamingContent} onChange={setStreamingContent} />
        </div>
        <div className="flex gap-2">
          <Button onClick={doCreateStreamingTTS}>创建流式 TTS</Button>
          {streamingId && (
            <Button onClick={() => doCancelStreamingTTS(streamingId)}>
              取消流式 TTS
            </Button>
          )}
        </div>
        <APIResult result={streamingApiResult} message={streamingMessage} />
        {sentMessage && <div>已发送：{sentMessage}</div>}
      </div>
    </Card>
  );
};

export default TTS;
