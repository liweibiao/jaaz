import os
import ssl
import time
import logging
import httpx
import aiohttp
import certifi
from typing import Dict, Any, Optional, Union, Callable, Tuple
from urllib.parse import urlparse
from concurrent.futures import ThreadPoolExecutor

logger = logging.getLogger(__name__)

# 创建证书验证上下文
ssl_context = ssl.create_default_context(cafile=certifi.where())
ssl_context.check_hostname = True
ssl_context.verify_mode = ssl.CERT_REQUIRED

class HttpClient:
    """HTTP客户端管理类，提供同步和异步HTTP请求功能"""

    def __init__(self):
        # 连接池设置
        self.max_connections = 100
        self.max_keepalive_connections = 20
        self.keepalive_expiry = 30  # 秒
        
        # 线程池用于异步执行同步请求
        self.executor = ThreadPoolExecutor(max_workers=10)

    def get_client_kwargs(self, provider_key: Optional[str] = None, is_async: bool = False, **kwargs) -> Dict[str, Any]:
        """构建客户端配置参数，直接设置代理地址"""
        # 基础配置
        client_kwargs = {
            "timeout": kwargs.get("timeout", 300),
            "follow_redirects": kwargs.get("follow_redirects", True),
            "max_redirects": kwargs.get("max_redirects", 10),
            "verify": kwargs.get("verify", ssl_context),
        }
        
        # 直接设置代理地址，与jaaz2保持一致
        proxy_url = 'http://127.0.0.1:1080'
        
        # 如果明确指定了proxy参数，使用指定的代理
        if "proxy" in kwargs:
            if kwargs["proxy"] is None:
                # 明确禁用代理
                logger.debug("Proxy explicitly disabled")
                return client_kwargs
            proxy_url = kwargs["proxy"]
        
        # 设置代理参数 - httpx.Client和AsyncClient都使用proxy参数
        client_kwargs["proxy"] = proxy_url
        
        # 自定义headers
        if "headers" in kwargs:
            client_kwargs["headers"] = kwargs["headers"]
        
        logger.debug(f"Final client kwargs: proxy={client_kwargs.get('proxy')}")
        return client_kwargs

    def create_httpx_client(self, provider_key: Optional[str] = None, **kwargs) -> httpx.Client:
        """创建同步HTTP客户端"""
        client_kwargs = self.get_client_kwargs(provider_key=provider_key, is_async=False, **kwargs)
        
        # 连接池配置
        limits = httpx.Limits(
            max_connections=self.max_connections,
            max_keepalive_connections=self.max_keepalive_connections,
            keepalive_expiry=self.keepalive_expiry,
        )
        client_kwargs["limits"] = limits
        
        # 创建客户端
        client = httpx.Client(**client_kwargs)
        
        logger.debug(f"Created httpx client with provider_key={provider_key}, proxy={client_kwargs.get('proxy')}")
        
        return client

    def create_async_httpx_client(self, provider_key: Optional[str] = None, **kwargs) -> httpx.AsyncClient:
        """创建异步HTTP客户端"""
        client_kwargs = self.get_client_kwargs(provider_key=provider_key, is_async=True, **kwargs)
        
        # 连接池配置
        limits = httpx.Limits(
            max_connections=self.max_connections,
            max_keepalive_connections=self.max_keepalive_connections,
            keepalive_expiry=self.keepalive_expiry,
        )
        client_kwargs["limits"] = limits
        
        # 创建异步客户端
        client = httpx.AsyncClient(**client_kwargs)
        
        logger.debug(f"Created async httpx client with provider_key={provider_key}, proxy={client_kwargs.get('proxy')}")
        
        return client

    def create_aiohttp_client_session(self, provider_key: Optional[str] = None, **kwargs) -> aiohttp.ClientSession:
        """创建aiohttp客户端会话，与jaaz2保持一致的配置"""
        # 基础配置
        session_kwargs = {
            "timeout": aiohttp.ClientTimeout(total=kwargs.get("timeout", 300)),
            "trust_env": True,  # 启用环境变量代理支持
            # 直接设置代理地址，与jaaz2保持一致
            "proxy": 'http://127.0.0.1:1080',
        }
        
        # 如果明确指定了proxy参数，使用指定的代理
        if "proxy" in kwargs:
            if kwargs["proxy"] is None:
                # 明确禁用代理
                logger.debug("Proxy explicitly disabled")
                session_kwargs.pop("proxy", None)
            else:
                session_kwargs["proxy"] = kwargs["proxy"]
        
        # 创建TCPConnector
        session_kwargs["connector"] = aiohttp.TCPConnector(
            ssl=ssl_context,
            limit=self.max_connections,
            limit_per_host=self.max_keepalive_connections,
            keepalive_timeout=0,
        )
        
        # SSL配置
        if "verify" in kwargs and not kwargs["verify"]:
            session_kwargs["connector"] = aiohttp.TCPConnector(ssl=False)
        
        # 创建会话
        session = aiohttp.ClientSession(**session_kwargs)
        
        logger.debug(f"Created aiohttp client session with provider_key={provider_key}, proxy={session_kwargs.get('proxy')}")
        
        return session

    def request(self, method: str, url: str, provider_key: Optional[str] = None, **kwargs) -> httpx.Response:
        """发送同步HTTP请求"""
        with self.create_httpx_client(provider_key=provider_key, **kwargs) as client:
            try:
                response = client.request(method, url, **kwargs)
                response.raise_for_status()
                return response
            except httpx.HTTPError as e:
                logger.error(f"HTTP request failed: {e}")
                if hasattr(e, 'response') and e.response is not None:
                    logger.error(f"Response status: {e.response.status_code}, content: {e.response.text[:200]}...")
                raise
            except Exception as e:
                logger.error(f"Unexpected error during HTTP request: {e}")
                raise

    async def async_request(self, method: str, url: str, provider_key: Optional[str] = None, **kwargs) -> httpx.Response:
        """发送异步HTTP请求"""
        # 创建一个副本以避免修改原始kwargs
        request_kwargs = kwargs.copy()
        # 移除可能导致问题的proxy参数，因为它已经在create_async_httpx_client中处理
        request_kwargs.pop("proxy", None)
        request_kwargs.pop("proxies", None)
        
        async with self.create_async_httpx_client(provider_key=provider_key, **kwargs) as client:
            try:
                response = await client.request(method, url, **request_kwargs)
                response.raise_for_status()
                return response
            except httpx.HTTPError as e:
                logger.error(f"Async HTTP request failed: {e}")
                if hasattr(e, 'response') and e.response is not None:
                    logger.error(f"Response status: {e.response.status_code}, content: {e.response.text[:200]}...")
                raise
            except Exception as e:
                logger.error(f"Unexpected error during async HTTP request: {e}")
                raise

    async def aiohttp_request(self, method: str, url: str, provider_key: Optional[str] = None, **kwargs) -> aiohttp.ClientResponse:
        """使用aiohttp发送异步HTTP请求"""
        async with self.create_aiohttp_client_session(provider_key=provider_key, **kwargs) as session:
            try:
                response = await session.request(method, url, **kwargs)
                response.raise_for_status()
                return response
            except aiohttp.ClientError as e:
                logger.error(f"Aiohttp request failed: {e}")
                raise
            except Exception as e:
                logger.error(f"Unexpected error during aiohttp request: {e}")
                raise

    def get(self, url: str, provider_key: Optional[str] = None, **kwargs) -> httpx.Response:
        """发送同步GET请求"""
        return self.request("GET", url, provider_key=provider_key, **kwargs)

    async def async_get(self, url: str, provider_key: Optional[str] = None, **kwargs) -> httpx.Response:
        """发送异步GET请求"""
        return await self.async_request("GET", url, provider_key=provider_key, **kwargs)

    def post(self, url: str, provider_key: Optional[str] = None, **kwargs) -> httpx.Response:
        """发送同步POST请求"""
        return self.request("POST", url, provider_key=provider_key, **kwargs)

    async def async_post(self, url: str, provider_key: Optional[str] = None, **kwargs) -> httpx.Response:
        """发送异步POST请求"""
        return await self.async_request("POST", url, provider_key=provider_key, **kwargs)

    def close(self):
        """关闭HTTP客户端资源"""
        if hasattr(self, 'executor') and self.executor:
            self.executor.shutdown(wait=True)

    def is_valid_url(self, url: str) -> bool:
        """验证URL是否有效"""
        try:
            result = urlparse(url)
            return all([result.scheme, result.netloc])
        except Exception:
            return False

    def get_base_url(self, url: str) -> str:
        """从URL中提取基础URL"""
        try:
            result = urlparse(url)
            return f"{result.scheme}://{result.netloc}"
        except Exception as e:
            logger.error(f"Failed to extract base URL: {e}")
            return url

# 创建全局HTTP客户端实例
http_client = HttpClient()

def get_http_client() -> HttpClient:
    """获取全局HTTP客户端实例"""
    return http_client

# 工具函数：将aiohttp响应转换为字典
async def aiohttp_response_to_dict(response: aiohttp.ClientResponse) -> Dict[str, Any]:
    """将aiohttp响应对象转换为字典"""
    try:
        content_type = response.headers.get('Content-Type', '')
        if 'application/json' in content_type:
            return await response.json()
        else:
            # 如果不是JSON，返回文本内容
            text = await response.text()
            return {'text': text}
    except Exception as e:
        logger.error(f"Failed to parse response: {e}")
        return {'error': str(e)}

# 工具函数：重试装饰器
def retry(max_retries: int = 3, delay: int = 1, exceptions: Tuple[Exception, ...] = (httpx.HTTPError,)):
    """HTTP请求重试装饰器"""
    def decorator(func: Callable) -> Callable:
        async def async_wrapper(*args, **kwargs):
            retries = 0
            while retries < max_retries:
                try:
                    return await func(*args, **kwargs)
                except exceptions as e:
                    retries += 1
                    if retries >= max_retries:
                        raise
                    wait_time = delay * (2 ** (retries - 1))  # 指数退避
                    logger.warning(f"Request failed (attempt {retries}/{max_retries}), retrying in {wait_time}s: {e}")
                    await asyncio.sleep(wait_time)
        
        def sync_wrapper(*args, **kwargs):
            retries = 0
            while retries < max_retries:
                try:
                    return func(*args, **kwargs)
                except exceptions as e:
                    retries += 1
                    if retries >= max_retries:
                        raise
                    wait_time = delay * (2 ** (retries - 1))  # 指数退避
                    logger.warning(f"Request failed (attempt {retries}/{max_retries}), retrying in {wait_time}s: {e}")
                    time.sleep(wait_time)
        
        # 根据函数是否为异步函数返回相应的包装器
        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        else:
            return sync_wrapper
    
    return decorator

# 导入asyncio以支持异步操作
import asyncio
