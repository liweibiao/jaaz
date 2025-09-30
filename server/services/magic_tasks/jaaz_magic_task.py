from typing import Dict, Any, Optional
from ..magic_task_interface import MagicTaskInterface
from ..jaaz_service import JaazService


class JaazMagicTask(MagicTaskInterface):
    """Jaaz魔法任务实现 - 实现MagicTaskInterface接口的Jaaz服务封装"""
    
    def __init__(self, **kwargs):
        """初始化Jaaz魔法任务，忽略额外的关键字参数"""
        self.jaaz_service = JaazService()
    
    async def create_magic_task(self, image_content: str, image_intent: Optional[str] = None) -> Dict[str, Any]:
        """创建Jaaz魔法生图任务"""
        task_id = await self.jaaz_service.create_magic_task(image_content, image_intent)
        
        if task_id:
            return {"task_id": task_id, "status": "created"}
        else:
            return {"error": "Failed to create magic task", "status": "failed"}
    
    async def get_task_status(self, task_id: str) -> Dict[str, Any]:
        """获取Jaaz魔法任务状态"""
        try:
            # 由于JaazService没有直接提供获取状态的方法，我们使用poll_for_task_completion
            # 但设置max_attempts=1来立即获取状态而不等待
            result = await self.jaaz_service.poll_for_task_completion(task_id, max_attempts=1, interval=0)
            
            # 检查任务状态
            status = result.get('status', 'unknown')
            
            return {
                "task_id": task_id,
                "status": status,
                "result": result if status == 'succeeded' else None,
                "error": result.get('error') if status == 'failed' else None
            }
        except Exception as e:
            # 如果任务正在处理中，poll_for_task_completion会抛出异常
            # 我们捕获这个异常并返回处理中的状态
            if 'processing' in str(e).lower():
                return {"task_id": task_id, "status": "processing"}
            else:
                return {"task_id": task_id, "status": "error", "error": str(e)}
    
    async def wait_for_task_completion(self, task_id: str, 
                                     max_attempts: int = 120, 
                                     interval: float = 5.0) -> Dict[str, Any]:
        """等待Jaaz魔法任务完成"""
        try:
            result = await self.jaaz_service.poll_for_task_completion(
                task_id, max_attempts=max_attempts, interval=interval
            )
            
            if result.get('status') == 'succeeded':
                return {
                    "task_id": task_id,
                    "status": "succeeded",
                    "result_url": result.get('result_url'),
                    "result": result
                }
            else:
                return {
                    "task_id": task_id,
                    "status": result.get('status', 'failed'),
                    "error": result.get('error', 'Unknown error')
                }
        except Exception as e:
            return {"task_id": task_id, "status": "error", "error": str(e)}
    
    async def analyze_image(self, image_content: str, prompt: str = "请分析这张图片") -> Dict[str, Any]:
        """分析图片内容（使用Jaaz服务）"""
        try:
            # 目前JaazService没有直接提供图片分析功能
            # 这里我们模拟一个简单的分析结果
            # 在实际应用中，应该使用Jaaz提供的图片分析API或其他方式
            
            # 注意：这只是一个临时实现，实际应用中应该替换为真实的图片分析逻辑
            return {
                "analysis": f"[Jaaz分析] 图片已接收，准备进行魔法转换。提示词：{prompt}",
                "provider": "jaaz"
            }
        except Exception as e:
            return {"error": f"Jaaz image analysis failed: {str(e)}"}
    
    async def generate_magic_image(self, image_content: str, 
                                 image_intent: Optional[str] = None, 
                                 **kwargs: Any) -> Dict[str, Any]:
        """生成魔法图像的完整流程"""
        result = await self.jaaz_service.generate_magic_image(image_content, image_intent)
        
        if result and not result.get('error'):
            return result
        else:
            return {"error": result.get('error', 'Magic generation failed')}


# 注意：JaazMagicTask的注册逻辑已移至magic_task_registry.py文件中
# 这样可以避免循环导入问题


# 示例：如果需要支持OpenAI的Magic任务实现
# 可以在类似的文件中实现OpenAIMagicTask类
"""
class OpenAIMagicTask(MagicTaskInterface):
    # 实现OpenAI的魔法任务接口
    pass
"""