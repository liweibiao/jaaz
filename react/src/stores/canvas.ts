import { create } from 'zustand'
import { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'

type CanvasStore = {
  canvasId: string
  excalidrawAPI: ExcalidrawImperativeAPI | null

  setCanvasId: (canvasId: string) => void
  setExcalidrawAPI: (excalidrawAPI: ExcalidrawImperativeAPI) => void
}

const useCanvasStore = create<CanvasStore>((set) => ({
  canvasId: '',
  excalidrawAPI: null,

  setCanvasId: (canvasId) => set({ canvasId }),
  setExcalidrawAPI: (excalidrawAPI) => set({ excalidrawAPI }),
}))

export default useCanvasStore
