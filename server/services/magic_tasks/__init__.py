"""Magic Tasks 包初始化文件
导入所有的Magic任务提供商，确保它们被注册到magic_task_registry
"""

# 导入所有的Magic任务提供商实现
# 导入顺序不重要，因为每个文件都会自行注册到registry
from .jaaz_magic_task import JaazMagicTask
from .volces_magic_task import VolcesMagicTask
from .gemini_magic_task import GeminiMagicTask

# 导出所有的Magic任务类，方便外部使用
__all__ = [
    'JaazMagicTask',
    'VolcesMagicTask',
    'GeminiMagicTask'
]