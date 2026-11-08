import React, { useState, useRef } from 'react';
import { useVaultStore } from '../store/useVaultStore';
import { llmFetch } from '../lib/llmFetch';
import { Loader2, Wand2, Languages, Sparkles, X } from 'lucide-react';

interface Position {
  top: number;
  left: number;
}

interface AIFloatingMenuProps<S = unknown> {
  position: Position | null;
  selectedText: string;
  /** Captures the editor selection (and document) at the moment a request starts. */
  getSnapshot: () => S;
  /** Apply the result to the captured range. Returns false if it could not be applied. */
  onReplace: (newText: string, snapshot: S) => boolean;
  onClose: () => void;
}

const REQUEST_TIMEOUT_MS = 120_000;

export const AIFloatingMenu = <S,>({
  position,
  selectedText,
  getSnapshot,
  onReplace,
  onClose
}: AIFloatingMenuProps<S>) => {
  const [promptMode, setPromptMode] = useState(false);
  const [customPrompt, setCustomPrompt] = useState("");
  const { llmConfigs, activeLlmId, isProcessing, setProcessing } = useVaultStore();
  const abortRef = useRef<AbortController | null>(null);

  React.useEffect(() => {
    if (!position) {
      setPromptMode(false);
      setCustomPrompt("");
    }
  }, [position]);

  // Abort an in-flight request when the menu goes away
  React.useEffect(() => {
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
        useVaultStore.getState().setProcessing(false);
      }
    };
  }, []);

  if (!position && !isProcessing) return null;

  const handleCancel = () => {
    abortRef.current?.abort();
  };

  const handlePrompt = async (prompt: string) => {
    if (!selectedText.trim()) return;
    setProcessing(true);

    // Remember what was selected when the request started; the user may move the cursor
    // or edit while waiting (F-19).
    const snapshot = getSnapshot();
    const controller = new AbortController();
    abortRef.current = controller;
    let timedOut = false;
    const timeoutId = setTimeout(() => { timedOut = true; controller.abort(); }, REQUEST_TIMEOUT_MS);

    const config = llmConfigs[activeLlmId];
    const systemPrompt = "You are a helpful writing assistant. You must output ONLY the rewritten or translated text. Do not include markdown formatting like ```markdown or any chat explanations.";
    const userPrompt = `${prompt}:\n\n${selectedText}`;

    try {
      let url = "";
      let options: RequestInit = {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal
      };

      const cleanEndpoint = (config.endpoint || "").trim().replace(/\s+/g, '').replace(/\/+$/, '');

      if (activeLlmId === 'local' || activeLlmId === 'openai') {
        url = activeLlmId === 'local'
          ? `${cleanEndpoint}/v1/chat/completions`
          : (cleanEndpoint ? `${cleanEndpoint}/chat/completions` : "https://api.openai.com/v1/chat/completions");

        if (config.apiKey) {
          (options.headers as any)["Authorization"] = `Bearer ${config.apiKey}`;
        }

        options.body = JSON.stringify({
          model: config.model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
          ]
        });
      } else if (activeLlmId === 'claude') {
        url = "https://api.anthropic.com/v1/messages";
        (options.headers as any)["x-api-key"] = config.apiKey;
        (options.headers as any)["anthropic-version"] = "2023-06-01";
        (options.headers as any)["anthropic-dangerous-direct-browser-access"] = "true"; // Required for client-side fetch to Anthropic

        options.body = JSON.stringify({
          model: config.model,
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
          // Thinking counts toward max_tokens and is on by default on Claude 5.x models.
          max_tokens: 16000,
          // Short rewrites need little reasoning. Older models can reject `effort`, so 5.x only.
          ...(/^claude-(fable|opus|sonnet|haiku)-5/.test(config.model)
            ? { output_config: { effort: "low" } }
            : {})
        });
      } else if (activeLlmId === 'gemini') {
        url = `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent`;
        (options.headers as any)["x-goog-api-key"] = config.apiKey; // header, not ?key= (F-26)
        options.body = JSON.stringify({
          contents: [{
            parts: [{ text: `${systemPrompt}\n\nTask: ${userPrompt}` }]
          }]
        });
      }

      const response = await llmFetch(activeLlmId, url, options);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `API error: ${response.status}`);
      }

      const data = await response.json();
      let newText: string | undefined = "";
      let truncated = false;

      if (activeLlmId === 'local' || activeLlmId === 'openai') {
        newText = data.choices?.[0]?.message?.content;
        truncated = data.choices?.[0]?.finish_reason === "length";
      } else if (activeLlmId === 'claude') {
        if (data.stop_reason === "refusal") {
          throw new Error(`Request declined by the model (${data.stop_details?.category ?? "unknown"})`);
        }
        // The first block can be `thinking`; only text blocks are the answer.
        newText = (data.content ?? [])
          .filter((b: { type?: string }) => b.type === "text")
          .map((b: { text?: string }) => b.text ?? "")
          .join("");
        truncated = data.stop_reason === "max_tokens";
      } else if (activeLlmId === 'gemini') {
        newText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        truncated = data.candidates?.[0]?.finishReason === "MAX_TOKENS";
        if (!newText && data.promptFeedback?.blockReason) {
          throw new Error(`Request blocked by the model (${data.promptFeedback.blockReason})`);
        }
      }

      if (truncated) {
        // A cut-off answer must not replace the user's text.
        alert("AI 응답이 길이 제한으로 잘려서 적용하지 않았습니다. 더 짧은 범위를 선택해 다시 시도하세요.");
      } else if (newText) {
        const applied = onReplace(newText.trim(), snapshot);
        if (!applied) {
          alert("응답을 기다리는 동안 문서가 변경되어 결과를 적용하지 않았습니다.");
        }
      } else {
        alert("AI 응답에 적용할 텍스트가 없습니다.");
      }
    } catch (error) {
      if (controller.signal.aborted) {
        if (timedOut) alert("AI 요청이 시간 초과되었습니다.");
        // otherwise the user cancelled: stay quiet
      } else {
        console.error("Failed to generate AI response:", error);
        alert(`AI Execution Failed: ${error}`);
      }
    } finally {
      clearTimeout(timeoutId);
      abortRef.current = null;
      setProcessing(false);
      onClose();
    }
  };

  if (!position && isProcessing) {
    return (
      <div className="ai-floating-menu loading-center">
        <Loader2 className="spin" size={16} /> Generating...
        <button className="ai-btn" onClick={handleCancel} title="Cancel"><X size={14} /></button>
      </div>
    );
  }

  return (
    <div
      className="ai-floating-menu"
      style={!isProcessing && position ? {
        top: position.top + 8,
        left: position.left,
        position: 'fixed'
      } : {}}
      onMouseDown={(e) => e.preventDefault()} // Prevent losing selection focus
    >
      {isProcessing ? (
        <div className="menu-loading">
          <Loader2 className="spin" size={14} /> Processing...
          <button className="ai-btn" onClick={handleCancel} title="Cancel"><X size={14} /></button>
        </div>
      ) : promptMode ? (
        <div className="prompt-input-container">
          <input
            type="text"
            autoFocus
            placeholder="어떻게 고칠까요? (예: 더 정중하게, 요약해줘...)"
            value={customPrompt}
            onChange={e => setCustomPrompt(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                handlePrompt(`Please rewrite or modify the following text strictly according to this instruction: "${customPrompt}"`);
              } else if (e.key === 'Escape') {
                setPromptMode(false);
              }
            }}
          />
        </div>
      ) : (
        <>
          <button className="ai-btn" onClick={() => setPromptMode(true)}>
            <Wand2 size={14} /> Refine
          </button>
          <button className="ai-btn" onClick={() => handlePrompt("Translate this text to Korean naturally")}>
            <Languages size={14} /> Translate
          </button>
          <button className="ai-btn" onClick={() => handlePrompt("Make this text shorter and more concise")}>
            <Sparkles size={14} /> Shorten
          </button>
        </>
      )}
    </div>
  );
};
