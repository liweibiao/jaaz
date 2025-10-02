import { CanvasData, Message, Session } from '@/types/types'
import { ToolInfo } from '@/api/model'

export type ListCanvasesResponse = {
  id: string
  name: string
  description?: string
  thumbnail?: string
  created_at: string
}

export async function listCanvases(): Promise<ListCanvasesResponse[]> {
  const response = await fetch('/api/canvas/list')
  return await response.json()
}

export async function createCanvas(data: {
  name: string
  canvas_id: string
  messages: Message[]
  session_id: string
  text_model: {
    provider: string
    model: string
    url: string
  }
  tool_list: ToolInfo[]
  system_prompt: string
  original_canvas_id?: string
}): Promise<{ id: string }> {
  const response = await fetch('/api/canvas/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `创建项目失败，请稍后再试 (状态码: ${response.status})`);
  }
  
  const result = await response.json();
  if (result.error) {
    throw new Error(result.error);
  }
  
  return result;
}

export async function getCanvas(
  id: string
): Promise<{ data: CanvasData; name: string; sessions: Session[] }> {
  const response = await fetch(`/api/canvas/${id}`)
  return await response.json()
}

export async function saveCanvas(
  id: string,
  payload: {
    data: CanvasData
    thumbnail: string
  }
): Promise<void> {
  const response = await fetch(`/api/canvas/${id}/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return await response.json()
}

export async function renameCanvas(id: string, name: string): Promise<void> {
  const response = await fetch(`/api/canvas/${id}/rename`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  return await response.json()
}

export async function deleteCanvas(id: string): Promise<void> {
  const response = await fetch(`/api/canvas/${id}/delete`, {
    method: 'DELETE',
  })
  return await response.json()
}
