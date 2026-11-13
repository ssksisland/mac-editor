import { ModelOperations } from '@vscode/vscode-languagedetection';
import modelUrl from '@vscode/vscode-languagedetection/model/model.json?url&no-inline';
import weightsUrl from '@vscode/vscode-languagedetection/model/group1-shard1of1.bin?url&no-inline';
import { MAX_DETECTION_LENGTH, detectLanguageFromHints, selectDetectedLanguage } from '../utils/languageDetectionPolicy';

async function loadAsset(url: string): Promise<Response> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`无法读取语言检测模型 (${response.status})`);
  return response;
}

// Vite 把模型作为本地资源打包，运行时不访问 CDN 或上传文档。
const model = new ModelOperations({
  modelJsonLoaderFunc: async () => (await loadAsset(modelUrl)).json(),
  weightsLoaderFunc: async () => (await loadAsset(weightsUrl)).arrayBuffer(),
  maxContentSize: MAX_DETECTION_LENGTH,
});

// 首次加载和推理串行进行，多个标签页共用一个模型实例。
let queue = Promise.resolve();
self.onmessage = (event: MessageEvent<{ id: number; content: string }>) => {
  const { id, content } = event.data;
  queue = queue.then(async () => {
    try {
      const language = detectLanguageFromHints(content) ?? selectDetectedLanguage(await model.runModel(content));
      self.postMessage({ id, language });
    } catch (error) {
      self.postMessage({ id, error: String(error) });
    }
  });
};
