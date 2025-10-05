import type { LLMConfig, ToolCallFunctionName } from '@/types/types'

// API Configuration
export const BASE_API_URL =
  import.meta.env.VITE_JAAZ_BASE_API_URL || 'http://127.0.0.1:57988'

export const PROVIDER_NAME_MAPPING: {
  [key: string]: { name: string; icon: string }
} = {
  jaaz: {
    name: 'Jaaz',
    icon: `${BASE_API_URL}/static/llm_icon/jaaz.png`,
  },
  anthropic: {
    name: 'Claude',
    icon: `${BASE_API_URL}/static/llm_icon/claude-color.png`,
  },
  openai: { name: 'OpenAI', icon: `${BASE_API_URL}/static/llm_icon/openai.png` },
  replicate: {
    name: 'Replicate',
    icon: `${BASE_API_URL}/static/llm_icon/replicate.png`,
  },
  ollama: {
    name: 'Ollama',
    icon: `${BASE_API_URL}/static/llm_icon/ollama.png`,
  },
  huggingface: {
    name: 'Hugging Face',
    icon: `${BASE_API_URL}/static/llm_icon/huggingface.png`,
  },
  wavespeed: {
    name: 'WaveSpeedAi',
    icon: `${BASE_API_URL}/static/llm_icon/wavespeed.png`,
  },
  volces: {
    name: 'Volces',
    icon: `${BASE_API_URL}/static/llm_icon/volces.png`,
  },
  comfyui: {
    name: 'ComfyUI',
    icon: `${BASE_API_URL}/static/llm_icon/comfyui.png`,
  },
  google: {
    name: 'Google',
    icon: `${BASE_API_URL}/static/llm_icon/google.png`,
  },
  doubao: {
    name: 'Doubao',
    icon: `${BASE_API_URL}/static/llm_icon/doubao.png`,
  },
  googlevertex: {
    name: 'Vertex',
    icon: `${BASE_API_URL}/static/llm_icon/vertex.png`,
  },
  google_nano: {
    name: 'Google Nano',
    icon: `${BASE_API_URL}/static/llm_icon/google_nano.png`,
  },
  siliconflow: {
    name: 'siliconflow',
    icon: `${BASE_API_URL}/static/llm_icon/siliconflow.png`,
  },
}

// Tool call name mapping
export const TOOL_CALL_NAME_MAPPING: { [key in ToolCallFunctionName]: string } =
{
  generate_image: 'Generate Image',
  prompt_user_multi_choice: 'Prompt Multi-Choice',
  prompt_user_single_choice: 'Prompt Single-Choice',
  write_plan: 'Write Plan',
  finish: 'Finish',
}

export const LOGO_URL = 'https://jaaz.app/favicon.ico'

export const DEFAULT_SYSTEM_PROMPT = `You are a professional art design agent. You can write very professional image prompts to generate aesthetically pleasing images that best fulfilling and matching the user's request.
Step 1. write a design strategy plan. Write in the same language as the user's inital first prompt.

Example Design Strategy Doc:
Design Proposal for “MUSE MODULAR – Future of Identity” Cover
• Recommended resolution: 1024 × 1536 px (portrait) – optimal for a standard magazine trim while preserving detail for holographic accents.

• Style & Mood
– High-contrast grayscale base evoking timeless editorial sophistication.
– Holographic iridescence selectively applied (cyan → violet → lime) for mask edges, title glyphs and micro-glitches, signalling futurism and fluid identity.
– Atmosphere: enigmatic, cerebral, slightly unsettling yet glamorous.

• Key Visual Element
– Central androgynous model, shoulders-up, lit with soft frontal key and twin rim lights.
– A translucent polygonal AR mask overlays the face; within it, three offset “ghost” facial layers (different eyes, nose, mouth) hint at multiple personas.
– Subtle pixel sorting/glitch streaks emanate from mask edges, blending into background grid.

• Composition & Layout

Masthead “MUSE MODULAR” across the top, extra-condensed modular sans serif; characters constructed from repeating geometric units. Spot UV + holo foil.
Tagline “Who are you today?” centered beneath masthead in ultra-light italic.
Subject’s gaze directly engages reader; head breaks the baseline of the masthead for depth.
Bottom left kicker “Future of Identity Issue” in tiny monospaced capitals.
Discreet modular grid lines and data glyphs fade into matte charcoal background, preserving negative space.
• Color Palette
#000000, #1a1a1a, #4d4d4d, #d9d9d9 + holographic gradient (#00eaff, #c400ff, #38ffab).

• Typography
– Masthead: custom variable sans with removable modules.
– Tagline: thin italic grotesque.
– Secondary copy: 10 pt monospaced to reference code.

• Print Finishing
– Soft-touch matte laminate overall.
– Spot UV + holographic foil on masthead, mask outline and glitch shards.

Step 2. Call generate_image tool to generate the image based on the plan immediately, use a detailed and professional image prompt according to your design strategy plan, no need to ask for user's approval.
`
