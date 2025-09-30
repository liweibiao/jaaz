# Magic Tasks 模块

这个模块实现了统一的魔法生图任务接口，使系统能够调用不同提供商的图像生成和分析功能。

## 主要组件

### 1. MagicTaskInterface

`MagicTaskInterface` 是一个抽象基类，定义了魔法生图任务的标准接口。它位于 `../magic_task_interface.py` 文件中。

主要方法包括：
- `create_magic_task`: 创建魔法生图任务
- `get_task_status`: 获取任务状态
- `wait_for_task_completion`: 等待任务完成
- `analyze_image`: 分析图片内容
- `generate_magic_image`: 生成魔法图像的完整流程

### 2. MagicTaskRegistry

`MagicTaskRegistry` 是一个注册表，用于管理不同提供商的 `MagicTaskInterface` 实现。它提供了以下功能：
- `register`: 注册一个新的提供商实现
- `get_task_instance`: 获取指定提供商的实例
- `get_available_providers`: 获取所有可用的提供商

### 3. 提供商实现

目前已实现的提供商：
- `JaazMagicTask`: Jaaz服务的实现

## 使用方法

### 1. 注册新的提供商

```python
from services.magic_task_interface import magic_task_registry, MagicTaskInterface

class MyProviderMagicTask(MagicTaskInterface):
    # 实现接口方法
    pass

# 注册到注册表
magic_task_registry.register("my_provider", MyProviderMagicTask)
```

### 2. 使用统一的接口执行魔法任务

```python
from services.magic_task_interface import create_and_execute_magic_task

# 执行魔法任务
result = await create_and_execute_magic_task(
    provider_name="jaaz",  # 或其他已注册的提供商名称
    image_content="data:image/png;base64,...",  # 图片内容
    analyze_intent=True,  # 是否分析图片意图
    model="default"  # 模型名称
)

# 处理结果
if result.get('error'):
    print(f"任务失败: {result['error']}")
else:
    print(f"任务成功，结果URL: {result['result_url']}")
```

### 3. 使用ImageAnalyser分析图片

```python
from utils.image_analyser import ImageAnalyser

# 创建分析器实例
analyser = ImageAnalyser()

# 分析图片意图
result = await analyser.get_image_intent(
    image_content="data:image/png;base64,...",
    provider="openai",  # 或其他支持的提供商
    model="gpt-4o"  # 模型名称
)

# 获取分析结果
if result.get('error'):
    print(f"分析失败: {result['error']}")
else:
    print(f"分析结果: {result['analysis']}")
```

## 添加新的提供商实现

要添加新的提供商实现，需要：

1. 创建一个新的类，继承自 `MagicTaskInterface`
2. 实现接口中定义的所有抽象方法
3. 将该类注册到 `magic_task_registry`

示例：

```python
from services.magic_task_interface import MagicTaskInterface, magic_task_registry

class OpenAIMagicTask(MagicTaskInterface):
    """OpenAI魔法任务实现"""
    
    def __init__(self):
        """初始化OpenAI魔法任务"""
        # 初始化OpenAI客户端等
        pass
    
    async def create_magic_task(self, image_content: str, image_intent: Optional[str] = None) -> Dict[str, Any]:
        # 实现创建任务的逻辑
        pass
    
    # 实现其他接口方法...

# 注册到注册表
magic_task_registry.register("openai", OpenAIMagicTask)
```

## 测试

可以使用 `../../tests/test_magic_task.py` 中的测试脚本来验证功能是否正常工作：

```bash
python -m server.tests.test_magic_task
```

## 注意事项

1. 每个提供商实现需要确保正确处理错误情况
2. 对于图片分析功能，不同提供商可能有不同的实现方式
3. 在生产环境中使用时，请确保正确配置各提供商的API密钥和其他必要参数
4. 当前的JaazMagicTask实现中，图片分析功能是模拟的，在实际应用中应该替换为真实的图片分析逻辑