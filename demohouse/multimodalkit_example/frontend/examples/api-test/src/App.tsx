import ASR from './cards/ASR';
import TTS from './cards/TTS';
import Visual from './cards/Visual';
import VLM from './cards/VLM';
import useImageId from './hooks/useImageId';

function App() {
  const imageId = useImageId();
  return (
    <div className="p-4 flex flex-col items-stretch gap-4">
      <div>image id: {imageId}</div>
      <ASR />
      <TTS />
      <Visual />
      <VLM />
    </div>
  );
}

export default App;
