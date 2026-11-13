import { useEffect } from 'react';
import { useEditorStore } from '../stores/editorStore';
import { detectContentLanguage } from '../utils/contentLanguageDetection';
import { canDetectLanguage, MIN_DETECTION_LENGTH } from '../utils/languageDetectionPolicy';

export function useLanguageDetection(tabId: string, isActive: boolean) {
  const tab = useEditorStore((state) => state.tabs.find((item) => item.id === tabId));
  const content = tab?.content;
  const fileName = tab?.fileName;
  const source = tab?.languageSource;

  useEffect(() => {
    if (!isActive || content === undefined || fileName === undefined) return;
    const current = useEditorStore.getState().tabs.find((item) => item.id === tabId);
    if (!current || !canDetectLanguage(current)) return;

    if (content.trim().length < MIN_DETECTION_LENGTH) {
      useEditorStore.getState().applyDetectedLanguage(tabId, content, fileName, 'txt');
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      void detectContentLanguage(content).then((language) => {
        if (!cancelled && language) {
          useEditorStore.getState().applyDetectedLanguage(tabId, content, fileName, language);
        }
      });
    }, 600);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [tabId, isActive, content, fileName, source]);
}
