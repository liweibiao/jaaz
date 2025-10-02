import { useCanvas } from '@/contexts/canvas'
import { useTranslation } from 'react-i18next'
import { memo, useRef } from 'react'
import { OrderedExcalidrawElement, ExcalidrawImageElement } from '@excalidraw/excalidraw/element/types'
import { BinaryFileData } from '@excalidraw/excalidraw/types'
import { TCanvasAddImagesToChatEvent } from '@/lib/event'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { Upload } from 'lucide-react'

interface CanvasImageReplacerProps {
  selectedImages: TCanvasAddImagesToChatEvent
  selectedElements: OrderedExcalidrawElement[]
}

const CanvasImageReplacer = ({ selectedImages, selectedElements }: CanvasImageReplacerProps) => {
  const { t } = useTranslation()
  const { excalidrawAPI } = useCanvas()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 检查是否只选中了一个图片元素
  const isSingleImageSelected = selectedImages.length === 1 && selectedElements.length === 1

  const handleUploadImage = () => {
    if (!fileInputRef.current || !isSingleImageSelected) return
    fileInputRef.current.click()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !excalidrawAPI || !isSingleImageSelected) return

    // 重置input，允许重复选择同一文件
    e.target.value = ''

    // 验证文件类型
    if (!file.type.startsWith('image/')) {
      toast.error(t('canvas:uploader.invalidImageType'))
      return
    }

    try {
      // 读取文件数据
      const dataURL = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(file)
      })

      // 获取当前选中的元素
      const appState = excalidrawAPI.getAppState()
      const selectedIds = appState.selectedElementIds
      const elements = excalidrawAPI.getSceneElements()
      const selectedElement = elements.find(el => selectedIds[el.id])

      if (!selectedElement || selectedElement.type !== 'image') {
        toast.error(t('canvas:uploader.failedToReplaceImage'))
        return
      }

      // 创建新的文件对象，并使用类型断言来解决所有类型问题
      const newFile = {
        id: `image-${Date.now()}` as any,
        created: Date.now(),
        mimeType: file.type as any,
        dataURL: dataURL as any,
      }

      // 使用addFiles方法添加文件
      await excalidrawAPI.addFiles([newFile])
      
      // 获取当前所有文件
      const files = excalidrawAPI.getFiles()
      const fileKeys = Object.keys(files)
      
      // 假设最后添加的文件就是我们刚刚添加的
      const lastFileId = fileKeys[fileKeys.length - 1]
      
      // 获取更新后的元素列表
      const currentElements = excalidrawAPI.getSceneElements()
      
      // 更新选中的图片元素
      const updatedElements = currentElements.map(el => {
        if (el.id === selectedElement.id && el.type === 'image') {
          return {
            ...(el as any),
            fileId: lastFileId,
          }
        }
        return el
      })

      // 更新场景
      excalidrawAPI.updateScene({
        elements: updatedElements,
      })

      toast.success(t('canvas:uploader.imageReplaced'))

    } catch (error) {
      console.error('Failed to replace image:', error)
      toast.error(t('canvas:uploader.failedToReplaceImage'))
    }
  }

  return (
    <>
      {isSingleImageSelected && (
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={handleUploadImage}
          className="flex items-center gap-1"
        >
          <Upload size={16} />
          {t('canvas:uploader.upload')}
        </Button>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
    </>
  )
}

export default memo(CanvasImageReplacer)