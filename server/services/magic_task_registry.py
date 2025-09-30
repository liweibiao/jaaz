""" 
魔法任务注册表模块
负责导入和注册所有的魔法任务实现类
这样可以避免在magic_task_interface.py中直接导入导致的循环导入问题
"""
import sys
import os
import importlib
from typing import Dict, Type, Optional, Any

# 获取当前文件的绝对路径
current_file_path = os.path.abspath(__file__)

# 获取server目录的绝对路径
server_dir = os.path.dirname(os.path.dirname(current_file_path))

# 获取项目根目录（jaaz目录）的绝对路径
project_root = os.path.dirname(server_dir)

# 确保server目录在Python路径中，这样绝对导入能正常工作
if server_dir not in sys.path:
    sys.path.insert(0, server_dir)

# 确保项目根目录也在Python路径中，这样各种导入方式都能兼容
if project_root not in sys.path:
    sys.path.insert(0, project_root)


# 定义内部的注册表类，避免循环导入
class MagicTaskRegistryInternal:
    """内部Magic任务注册表 - 管理不同提供商的MagicTask实现"""
    
    def __init__(self):
        self._registry: Dict[str, Type] = {}  # 使用Type避免直接引用MagicTaskInterface
    
    def register(self, provider_name: str, task_class: Type) -> None:
        """
        注册一个Magic任务实现
        
        Args:
            provider_name: 提供商名称
            task_class: MagicTaskInterface的实现类
        """
        # 这里不能直接检查是否是MagicTaskInterface的子类，因为会导致循环导入
        # 我们假设调用者会确保传入正确的类
        self._registry[provider_name] = task_class
        print(f"✅ 已注册Magic任务提供商: {provider_name}")
    
    def get_task_instance(self, provider_name: str, **kwargs: Any) -> Any:
        """
        获取指定提供商的Magic任务实例
        
        Args:
            provider_name: 提供商名称
            **kwargs: 实例化参数
        
        Returns:
            MagicTaskInterface: 任务实例
        
        Raises:
            ValueError: 如果提供商未注册
        """
        if provider_name not in self._registry:
            raise ValueError(f"未注册的Magic任务提供商: {provider_name}")
        
        return self._registry[provider_name](**kwargs)
    
    def get_available_providers(self) -> list:
        """
        获取所有可用的提供商名称
        
        Returns:
            List[str]: 提供商名称列表
        """
        return list(self._registry.keys())


# 创建全局注册表实例
magic_task_registry = MagicTaskRegistryInternal()


def register_magic_tasks() -> None:
    """导入并注册所有的魔法任务实现类"""
    # 使用try-except避免某些实现类缺失导致整个应用崩溃
    try:
        from .magic_tasks.jaaz_magic_task import JaazMagicTask
        magic_task_registry.register("jaaz", JaazMagicTask)
        print("✅ JaazMagicTask已成功注册到magic_task_registry")
    except ImportError as e:
        print(f"❌ 导入或注册JaazMagicTask失败: {e}")
    
    try:
        from .magic_tasks.volces_magic_task import VolcesMagicTask
        magic_task_registry.register("volces", VolcesMagicTask)
        print("✅ VolcesMagicTask已成功注册到magic_task_registry")
    except ImportError as e:
        print(f"❌ 导入或注册VolcesMagicTask失败: {e}")
    
    try:
        from .magic_tasks.gemini_magic_task import GeminiMagicTask
        magic_task_registry.register("gemini", GeminiMagicTask)
        # 同时将google提供商也注册到GeminiMagicTask，因为它使用Google的API
        magic_task_registry.register("google", GeminiMagicTask)
        print("✅ GeminiMagicTask已成功注册到magic_task_registry (gemini和google提供商)")
    except ImportError as e:
        print(f"❌ 导入或注册GeminiMagicTask失败: {e}")


# 确保在模块导入时自动注册所有魔法任务实现类
# 但不要在模块级别立即执行，而是在其他地方按需调用
# 这样可以避免在导入时就触发循环导入


# 提供一个函数来延迟执行注册
def initialize_registry():
    """延迟初始化注册表，在确保所有依赖都已加载后调用"""
    register_magic_tasks()


# 重导出必要的实例，避免导出类型以防止循环导入
__all__ = ["magic_task_registry", "initialize_registry"]