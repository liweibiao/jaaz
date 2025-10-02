# services/OpenAIAgents_service/jaaz_service.py

import asyncio
import aiohttp
from typing import Dict, Any, Optional, List
from utils.http_client import get_http_client
from services.config_service import config_service
from utils.error_handler import handle_async_api_error


class JaazService:
    """Jaaz 云端 API 服务
    """

    def __init__(self):
        """初始化 Jaaz 服务"""
        config = config_service.app_config.get('jaaz', {})
        self.api_url = str(config.get("url", "")).rstrip("/")
        self.api_token = str(config.get("api_key", ""))

        if not self.api_url:
            raise ValueError("Jaaz API URL is not configured")
        if not self.api_token:
            raise ValueError("Jaaz API token is not configured")

        # 确保 API 地址以 /api/v1 结尾
        if not self.api_url.endswith('/api/v1'):
            self.api_url = f"{self.api_url}/api/v1"

        print(f"✅ Jaaz service initialized with API URL: {self.api_url}")

    def _is_configured(self) -> bool:
        """检查 Jaaz API 是否已配置"""
        return bool(self.api_url and self.api_token)

    def _build_headers(self) -> Dict[str, str]:
        """构建请求头"""
        return {
            "Authorization": f"Bearer {self.api_token}",
            "Content-Type": "application/json"
        }

    async def create_magic_task(self, image_content: str, image_intent: Optional[str] = None) -> str:
        """
        创建云端魔法图像生成任务

        Args:
            image_content: 图片内容（base64 或 URL）
            image_intent: 图片意图分析结果（可选）

        Returns:
            str: 任务 ID，失败时返回空字符串
        """
        try:
            if not image_content or not image_content.startswith('data:image/'):
                print("❌ Invalid image content format")
                return ""

            # 构建请求体，包含图片内容和意图（如果有）
            request_body = {
                "image": image_content
            }
            
            # 如果有图片意图分析结果，将其添加到请求体中
            if image_intent and image_intent.strip():
                request_body["intent"] = image_intent
                print(f"📝 添加图片意图到请求: {image_intent[:50]}...")

            async with get_http_client().create_aiohttp_client_session(provider_key="jaaz") as session:
                async with session.post(
                    f"{self.api_url}/image/magic",
                    headers=self._build_headers(),
                    json=request_body,
                    timeout=aiohttp.ClientTimeout(total=60.0)
                ) as response:
                    if response.status == 200:
                        data = await response.json()
                        task_id = data.get('task_id', '')
                        if task_id:
                            print(f"✅ Magic task created: {task_id}")
                            return task_id
                        else:
                            print("❌ No task_id in response")
                            return ""
                    else:
                        clean_error = await handle_async_api_error(response, "创建魔法任务失败")
                        print(f"❌ {clean_error}")
                        return ""

        except Exception as e:
            print(f"❌ Error creating magic task: {e}")
            return ""

    async def create_video_task(
        self,
        prompt: str,
        model: str,
        resolution: Optional[str] = None,
        duration: Optional[int] = None,
        aspect_ratio: Optional[str] = None,
        input_images: Optional[List[str]] = None,
        **kwargs: Any
    ) -> str:
        """
        创建云端视频生成任务

        Args:
            prompt: 视频生成提示词
            model: 视频生成模型
            resolution: 视频分辨率
            duration: 视频时长（秒）
            aspect_ratio: 宽高比
            input_images: 输入图片列表（可选）
            **kwargs: 其他参数

        Returns:
            str: 任务 ID

        Raises:
            Exception: 当任务创建失败时抛出异常
        """
        async with get_http_client().create_aiohttp_client_session(provider_key="jaaz") as session:
            payload = {
                "prompt": prompt,
                "model": model,
                "resolution": resolution,
                "duration": duration,
                "aspect_ratio": aspect_ratio,
                **kwargs
            }

            if input_images:
                payload["input_images"] = input_images

            async with session.post(
                f"{self.api_url}/video/sunra/generations",
                headers=self._build_headers(),
                json=payload,
                timeout=aiohttp.ClientTimeout(total=120.0)
            ) as response:
                if response.status == 200:
                    data = await response.json()
                    task_id = data.get('task_id', '')
                    if task_id:
                        print(f"✅ Video task created: {task_id}")
                        return task_id
                    else:
                        raise Exception("No task_id in response")
                else:
                        clean_error = await handle_async_api_error(response, "创建视频任务失败")
                        raise Exception(clean_error)

    async def poll_for_task_completion(
        self,
        task_id: str,
        max_attempts: Optional[int] = None,
        interval: Optional[float] = None
    ) -> Dict[str, Any]:
        """
        等待任务完成并返回结果

        Args:
            task_id: 任务 ID
            max_attempts: 最大轮询次数
            interval: 轮询间隔（秒）

        Returns:
            Dict[str, Any]: 任务结果

        Raises:
            Exception: 当任务失败或超时时抛出异常
        """
        max_attempts = max_attempts or 150  # 默认最多轮询 150 次
        interval = interval or 2.0  # 默认轮询间隔 2 秒

        async with get_http_client().create_aiohttp_client_session(provider_key="jaaz") as session:
            for _ in range(max_attempts):
                async with session.get(
                    f"{self.api_url}/task/{task_id}",
                    headers=self._build_headers(),
                    timeout=aiohttp.ClientTimeout(total=20.0)
                ) as response:
                    if response.status == 200:
                        data = await response.json()
                        if data.get('success') and data.get('data', {}).get('found'):
                            task = data['data']['task']
                            status = task.get('status')

                            if status == 'succeeded':
                                print(
                                    f"✅ Task {task_id} completed successfully")
                                return task
                            elif status == 'failed':
                                error_msg = task.get('error', 'Unknown error')
                                raise Exception(f"Task failed: {error_msg}")
                            elif status == 'cancelled':
                                raise Exception("Task was cancelled")
                            elif status == 'processing':
                                # 继续轮询
                                await asyncio.sleep(interval)
                                continue
                            else:
                                raise Exception(f"Unknown task status: {status}")
                        else:
                            raise Exception("Task not found")
                    else:
                        raise Exception(f"Failed to get task status: HTTP {response.status}")

            raise Exception(f"Task polling timeout after {max_attempts} attempts")

    async def generate_magic_image(self, image_content: str, image_intent: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """
        生成魔法图像的完整流程

        Args:
            image_content: 图片内容（base64 或 URL）
            image_intent: 图片意图分析结果（可选）

        Returns:
            Dict[str, Any]: 包含 result_url 的任务结果，失败时返回包含 error 信息的字典
        """
        try:
            # 1. 创建任务，传递图片意图分析结果
            task_id = await self.create_magic_task(image_content, image_intent)
            if not task_id:
                print("❌ Failed to create magic task")
                return {"error": "Failed to create magic task"}

            # 2. 等待任务完成
            result = await self.poll_for_task_completion(task_id, max_attempts=120, interval=5.0) # 10 分钟
            if not result:
                print("❌ Magic generation failed")
                return {"error": "Magic generation failed"}

            if not result.get('result_url'):
                error_msg = result.get('error', 'No result URL found')
                print(f"❌ Magic generation failed: {error_msg}")
                return {"error": f"Magic generation failed: {error_msg}"}

            print(
                f"✅ Magic image generated successfully: {result.get('result_url')}")
            return result

        except Exception as e:
            error_msg = f"Error in magic image generation: {str(e)}"
            print(f"❌ {error_msg}")
            return {"error": error_msg}

    async def generate_video(
        self,
        prompt: str,
        model: str,
        resolution: Optional[str] = None,
        duration: Optional[int] = None,
        aspect_ratio: Optional[str] = None,
        input_images: Optional[List[str]] = None,
        **kwargs: Any
    ) -> Dict[str, Any]:
        """
        生成视频的完整流程

        Args:
            prompt: 视频生成提示词
            model: 视频生成模型
            resolution: 视频分辨率
            duration: 视频时长（秒）
            aspect_ratio: 宽高比
            input_images: 输入图片列表（可选）
            **kwargs: 其他参数

        Returns:
            Dict[str, Any]: 包含 result_url 的任务结果

        Raises:
            Exception: 当视频生成失败时抛出异常
        """
        # 1. 创建视频生成任务
        task_id = await self.create_video_task(
            prompt=prompt,
            model=model,
            resolution=resolution,
            duration=duration,
            aspect_ratio=aspect_ratio,
            input_images=input_images,
            **kwargs
        )

        if not task_id:
            raise Exception("Failed to create video task")

        # 2. 等待任务完成
        result = await self.poll_for_task_completion(task_id)
        if not result:
            raise Exception("Video generation failed")

        if result.get('error'):
            raise Exception(f"Video generation failed: {result['error']}")

        if not result.get('result_url'):
            raise Exception("No result URL found in video generation response")

        print(
            f"✅ Video generated successfully: {result.get('result_url')}")
        return result

    async def generate_video_by_seedance(
        self,
        prompt: str,
        model: str,
        resolution: str = "480p",
        duration: int = 5,
        aspect_ratio: str = "16:9",
        input_images: Optional[List[str]] = None,
        **kwargs: Any
    ) -> Dict[str, Any]:
        """
        使用 Seedance 模型生成视频的完整流程

        Args:
            prompt: 视频生成提示词
            model: 视频生成模型
            resolution: 视频分辨率
            duration: 视频时长（秒）
            aspect_ratio: 宽高比
            input_images: 输入图片列表（可选）
            **kwargs: 其他参数

        Returns:
            Dict[str, Any]: 包含 result_url 的任务结果

        Raises:
            Exception: 当视频生成失败时抛出异常
        """
        # 1. 创建 Seedance 视频生成任务
        async with get_http_client().create_aiohttp_client_session(provider_key="jaaz") as session:
            payload = {
                "prompt": prompt,
                "model": model,
                "resolution": resolution,
                "duration": duration,
                "aspect_ratio": aspect_ratio,
                **kwargs
            }

            if input_images:
                payload["input_images"] = input_images

            async with session.post(
                f"{self.api_url}/video/seedance/generation",
                headers=self._build_headers(),
                json=payload,
                timeout=aiohttp.ClientTimeout(total=120.0)
            ) as response:
                if response.status == 200:
                    data = await response.json()
                    task_id = data.get('task_id', '')
                    if not task_id:
                        raise Exception("No task_id in response")
                else:
                        clean_error = await handle_async_api_error(response, "创建Seedance视频任务失败")
                        raise Exception(clean_error)

        print(f"✅ Seedance video task created: {task_id}")

        # 2. 等待任务完成
        result = await self.poll_for_task_completion(task_id)
        if not result:
            raise Exception("Seedance video generation failed")

        if result.get('error'):
            raise Exception(f"Seedance video generation failed: {result['error']}")

        if not result.get('result_url'):
            raise Exception("No result URL found in Seedance video generation response")

        print(
            f"✅ Seedance video generated successfully: {result.get('result_url')}")
        return result

    async def create_midjourney_task(
        self,
        prompt: str,
        model: str = "midjourney",
        **kwargs: Any
    ) -> str:
        """
        创建云端 Midjourney 图像生成任务

        Args:
            prompt: 图像生成提示词
            model: 图像生成模型（默认为 midjourney）
            **kwargs: 其他参数（如 mode 等）

        Returns:
            str: 任务 ID

        Raises:
            Exception: 当任务创建失败时抛出异常
        """
        async with get_http_client().create_aiohttp_client_session(provider_key="jaaz") as session:
            payload = {
                "prompt": prompt,
                "model": model,
                **kwargs
            }

            async with session.post(
                f"{self.api_url}/image/midjourney/generation",
                headers=self._build_headers(),
                json=payload,
                timeout=aiohttp.ClientTimeout(total=60.0)
            ) as response:
                if response.status == 200:
                    data = await response.json()
                    task_id = data.get('task_id', '')
                    if task_id:
                        print(f"✅ Midjourney task created: {task_id}")
                        return task_id
                    else:
                        raise Exception("No task_id in response")
                else:
                        clean_error = await handle_async_api_error(response, "创建Midjourney任务失败")
                        raise Exception(clean_error)

    async def generate_image_by_midjourney(
        self,
        prompt: str,
        model: str = "midjourney",
        **kwargs: Any
    ) -> Dict[str, Any]:
        """
        使用 Midjourney 生成图像的完整流程

        Args:
            prompt: 图像生成提示词
            model: 图像生成模型（默认为 midjourney）
            **kwargs: 其他参数（如 mode 等）

        Returns:
            Dict[str, Any]: 包含 result_url 的任务结果

        Raises:
            Exception: 当图像生成失败时抛出异常
        """
        # 1. 创建 Midjourney 图像生成任务
        task_id = await self.create_midjourney_task(
            prompt=prompt,
            model=model,
            **kwargs
        )

        if not task_id:
            raise Exception("Failed to create Midjourney task")

        # 2. 等待任务完成
        task_result = await self.poll_for_task_completion(task_id, max_attempts=150, interval=2.0)
        print(f"🎨 Midjourney task result: {task_result}")
        if not task_result:
            raise Exception("Midjourney image generation failed")

        if task_result.get('error'):
            raise Exception(f"Midjourney image generation failed: {task_result['error']}")

        if not task_result.get('result'):
            raise Exception("No result found in Midjourney image generation response")

        result = task_result.get('result')
        print(f"✅ Midjourney image generated successfully: {result}")
        return result or {}

    def is_configured(self) -> bool:
        """
        检查服务是否已正确配置

        Returns:
            bool: 配置是否有效
        """
        return self._is_configured()
