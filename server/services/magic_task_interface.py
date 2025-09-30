from typing import Dict, Any, Optional, List, Callable
from abc import ABC, abstractmethod


class MagicTaskInterface(ABC):
    """Magic任务接口 - 定义魔法生图任务的标准接口
    使系统能够统一调用不同提供商的图像生成和分析功能
    """
    
    @abstractmethod
    async def create_magic_task(self, image_content: str, image_intent: Optional[str] = None) -> Dict[str, Any]:
        """
        创建魔法生图任务
        
        Args:
            image_content: 图片内容（base64 或 URL）
            image_intent: 图片意图分析结果（可选）
        
        Returns:
            Dict[str, Any]: 任务信息，包含task_id等
        """
        pass
    
    @abstractmethod
    async def get_task_status(self, task_id: str) -> Dict[str, Any]:
        """
        获取任务状态
        
        Args:
            task_id: 任务ID
        
        Returns:
            Dict[str, Any]: 任务状态信息
        """
        pass
    
    @abstractmethod
    async def wait_for_task_completion(self, task_id: str, 
                                     max_attempts: int = 120, 
                                     interval: float = 5.0) -> Dict[str, Any]:
        """
        等待任务完成
        
        Args:
            task_id: 任务ID
            max_attempts: 最大轮询次数
            interval: 轮询间隔（秒）
        
        Returns:
            Dict[str, Any]: 任务完成结果
        """
        pass
    
    @abstractmethod
    async def analyze_image(self, image_content: str, prompt: str = "请分析这张图片") -> Dict[str, Any]:
        """
        分析图片内容
        
        Args:
            image_content: 图片内容
            prompt: 分析提示词
        
        Returns:
            Dict[str, Any]: 图片分析结果
        """
        pass
    
    @abstractmethod
    async def generate_magic_image(self, image_content: str, 
                                 image_intent: Optional[str] = None, 
                                 **kwargs: Any) -> Dict[str, Any]:
        """
        生成魔法图像的完整流程
        
        Args:
            image_content: 图片内容
            image_intent: 图片意图分析结果
            **kwargs: 其他参数
        
        Returns:
            Dict[str, Any]: 包含result_url的任务结果
        """
        pass


# 从magic_task_registry模块导入全局注册表实例
# 使用局部导入避免循环导入
magic_task_registry = None
initialize_registry = None

# 在模块加载时导入注册表相关内容，但不立即使用
def _lazy_import_registry():
    global magic_task_registry, initialize_registry
    if magic_task_registry is None:
        from .magic_task_registry import magic_task_registry as registry, initialize_registry as init
        magic_task_registry = registry
        initialize_registry = init


# 确保在第一次使用前初始化注册表
def _ensure_registry_initialized():
    if magic_task_registry is None:
        _lazy_import_registry()
    if initialize_registry is not None:
        initialize_registry()


# 在模块导入时立即执行懒加载，但不执行注册表初始化
_lazy_import_registry()


# 辅助函数：根据用户选择创建并执行魔法任务
async def create_and_execute_magic_task(
    provider_name: str, 
    image_content: str, 
    user_message: Dict[str, Any] = None,
    **kwargs: Any
) -> Dict[str, Any]:
    """
    根据用户选择的提供商创建并执行魔法任务
    
    Args:
        provider_name: 提供商名称
        image_content: 图片内容
        user_message: 用户消息（可选）
        **kwargs: 其他参数
    
    Returns:
        Dict[str, Any]: 任务执行结果
    """
    try:
        # 确保注册表已初始化
        _ensure_registry_initialized()
        
        # 获取提供商实例
        task_instance = magic_task_registry.get_task_instance(provider_name, **kwargs)
        
        # 分析图片意图
        image_intent = None
        if kwargs.get('analyze_intent', True):
            analysis_prompt = "请分析这张图片的主要内容、风格和潜在意图，以便为后续的图像生成任务提供参考。"
            intent_result = await task_instance.analyze_image(image_content, analysis_prompt)
            
            if "error" not in intent_result:
                image_intent = intent_result.get('analysis', "")
                print(f"✅ 图片意图分析成功 (提供商: {provider_name}): {image_intent[:50]}...")
            else:
                print(f"⚠️ 图片意图分析失败: {intent_result['error']}")
        
        # 执行魔法生图任务
        result = await task_instance.generate_magic_image(image_content, image_intent, **kwargs)
        
        # 添加提供商信息到结果中
        result['provider'] = provider_name
        
        return result
        
    except Exception as e:
        error_msg = f"Magic任务执行失败: {str(e)}"
        print(f"❌ {error_msg}")
        return {"error": error_msg, "provider": provider_name}