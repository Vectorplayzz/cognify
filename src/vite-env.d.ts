/// <reference types="vite/client" />

// Only non-secret values are exposed to the browser. API keys live in the
// backend (see server/services/llmProxy.js and searchProxy.js) and must not
// be declared here.
interface ImportMetaEnv {
    readonly VITE_LLM_MODELS: string
    readonly LLAMA_MODEL: string
    readonly LLAMA_API_URL: string
}

interface ImportMeta {
    readonly env: ImportMetaEnv
}
