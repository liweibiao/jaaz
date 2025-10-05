from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import RedirectResponse
from fastapi import Cookie, Header, HTTPException
import httpx
import base64
import json
import os
import logging
import time
import secrets
import jwt
import hashlib
from datetime import datetime, timedelta
from services.settings_service import settings_service
from services.jaaz_service import JaazService
from services.db_service import db_service
from utils.http_client import get_http_client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["auth"])

# 获取HTTP客户端实例
http_client = get_http_client()

@router.get("/check-status")
async def check_auth_status(
    auth_token: str = Cookie(None),
    user_uuid: str = Cookie(None),
    user_email: str = Cookie(None),
    jaaz_access_token: str = Cookie(None)
):
    """检查用户认证状态
    该接口用于前端检查用户的登录状态，返回用户信息和认证凭证
    """
    try:
        # 详细记录收到的cookie信息，用于调试
        logger.debug(f"Check status request received with cookies: auth_token={bool(auth_token)}, user_uuid={user_uuid}, user_email={user_email}, jaaz_access_token={bool(jaaz_access_token)}")

        # 检查是否有有效的认证信息
        if not any([auth_token, user_uuid, user_email, jaaz_access_token]):
            logger.debug("No authentication cookies found")
            return {
                "status": "success",
                "is_logged_in": False,
                "user_info": None,
                "token": None
            }

        # 从cookie中获取用户信息
        if user_email:
            # 即使user_uuid是undefined或空，只要有user_email和token，就认为用户已登录
            logger.debug(f"Found auth cookies for user: {user_email}")
            
            # 从数据库中获取用户信息
            db_user = await db_service.get_user_by_email(user_email)
            
            if db_user:
                # 如果在数据库中找到用户，使用数据库中的信息
                logger.debug(f"User found in database: {user_email}")
                return {
                    "status": "success",
                    "is_logged_in": True,
                    "user_info": {
                        "id": db_user.get('uuid'),
                        "username": db_user.get('nickname'),
                        "email": db_user.get('email'),
                        "provider": "google",
                        "image_url": f"https://www.gravatar.com/avatar/{hashlib.md5(user_email.lower().encode()).hexdigest()}",
                        "created_at": db_user.get('ctime'),
                        "updated_at": db_user.get('mtime')
                    },
                    "token": jaaz_access_token or auth_token
                }
            else:
                # 如果在数据库中找不到用户，生成一个临时的用户ID
                logger.debug(f"User not found in database, creating temporary user info: {user_email}")
                safe_user_id = user_uuid if user_uuid and user_uuid != 'undefined' else f"temp_{hashlib.md5(user_email.lower().encode()).hexdigest()[:10]}"
                
                return {
                    "status": "success",
                    "is_logged_in": True,
                    "user_info": {
                        "id": safe_user_id,
                        "username": user_email.split('@')[0],
                        "email": user_email,
                        "provider": "google",
                        "image_url": f"https://www.gravatar.com/avatar/{hashlib.md5(user_email.lower().encode()).hexdigest()}"
                    },
                    "token": jaaz_access_token or auth_token
                }

        # 如果没有用户邮箱但有token，返回基本的登录状态
        if auth_token or jaaz_access_token:
            logger.debug("Found token but incomplete user info")
            return {
                "status": "success",
                "is_logged_in": True,
                "user_info": None,
                "token": jaaz_access_token or auth_token
            }

        # 默认返回未登录状态
        return {
            "status": "success",
            "is_logged_in": False,
            "user_info": None,
            "token": None
        }
    except Exception as e:
        logger.error(f"Error checking auth status: {str(e)}")
        return {
            "status": "error",
            "is_logged_in": False,
            "user_info": None,
            "token": None,
            "error": str(e)
        }

def get_google_oauth_config():
    """获取Google OAuth配置"""
    # 使用get_raw_settings避免敏感信息被掩码
    settings = settings_service.get_raw_settings()
    google_oauth = settings.get("googleOAuth", {})
    
    client_id = google_oauth.get("clientId", "")
    client_secret = google_oauth.get("clientSecret", "")
    enabled = google_oauth.get("enabled", False)
    
    # 从环境变量获取重定向URI，确保没有尾部斜杠
    redirect_uri = os.getenv("LOCALHOST_REDIRECT_URI", "http://localhost:5174").rstrip('/')
    callback_url = f"{redirect_uri}/api/auth/google/callback"
    
    # 优先从googleOAuth对象内部获取JWT密钥
    jwt_secret = google_oauth.get("jwtSecret", "")
    if not jwt_secret:
        jwt_secret = secrets.token_hex(32)
        # 保存JWT密钥到googleOAuth对象内部
        if "googleOAuth" not in settings:
            settings["googleOAuth"] = {}
        settings["googleOAuth"]["jwtSecret"] = jwt_secret
        settings_service.update_settings(settings)
        logger.info("Generated new JWT secret and saved to googleOAuth settings")
    
    # 设置环境变量供后续使用
    os.environ["JWT_SECRET_KEY"] = jwt_secret
    
    return {
        "client_id": client_id,
        "client_secret": client_secret,
        "callback_url": callback_url,
        "redirect_uri": redirect_uri,
        "jwt_secret": jwt_secret,
        "enabled": enabled
    }

def generate_state():
    """生成用于OAuth认证的state参数"""
    return secrets.token_urlsafe(16)

def generate_jwt_token(user_info):
    """生成JWT令牌"""
    # 从环境变量获取JWT密钥
    secret_key = os.getenv("JWT_SECRET_KEY")
    if not secret_key:
        # 如果环境变量中没有，从googleOAuth对象内部获取
        settings = settings_service.get_raw_settings()
        google_oauth = settings.get("googleOAuth", {})
        secret_key = google_oauth.get("jwtSecret", secrets.token_hex(32))
        
    payload = {
        "sub": user_info.get("email"),
        "name": user_info.get("name"),
        "email": user_info.get("email"),
        "picture": user_info.get("picture"),
        "iat": datetime.utcnow(),
        "exp": datetime.utcnow() + timedelta(days=30)  # 令牌有效期为30天
    }
    
    token = jwt.encode(payload, secret_key, algorithm="HS256")
    return token

def validate_google_oauth_config(config):
    """验证Google OAuth配置是否有效"""
    if not config.get("enabled", False):
        logger.error("Google OAuth is not enabled")
        return False
    if not config["client_id"] or not config["client_secret"]:
        logger.error("Google OAuth client ID or client secret is not configured")
        return False
    return True

# 使用文件存储认证状态，提高可靠性
import json
import tempfile

# 认证状态存储文件路径
auth_states_file = os.path.join(tempfile.gettempdir(), 'jaaz_google_auth_states.json')

# 确保存储文件存在
def ensure_auth_states_file():
    if not os.path.exists(auth_states_file):
        with open(auth_states_file, 'w') as f:
            json.dump({}, f)

# 读取认证状态
def read_auth_states():
    ensure_auth_states_file()
    try:
        with open(auth_states_file, 'r') as f:
            return json.load(f)
    except json.JSONDecodeError:
        logger.error("Failed to decode auth states file, using empty dict")
        return {}

# 写入认证状态
def write_auth_states(states):
    ensure_auth_states_file()
    try:
        with open(auth_states_file, 'w') as f:
            json.dump(states, f)
    except Exception as e:
        logger.error(f"Failed to write auth states: {str(e)}")

@router.get("/google/start")
async def start_google_auth():
    """开始Google OAuth认证流程"""
    try:
        config = get_google_oauth_config()
        
        if not validate_google_oauth_config(config):
            raise HTTPException(status_code=500, detail="Google OAuth is not properly configured")
        
        # 生成state参数
        state = generate_state()
        
        # 读取现有状态
        auth_states = read_auth_states()
        # 记录state和生成时间，用于验证回调
        auth_states[state] = {
            "timestamp": time.time(),
            "status": "pending"
        }
        # 保存状态
        write_auth_states(auth_states)
        
        # 构建Google认证URL
        auth_url = (
            f"https://accounts.google.com/o/oauth2/auth?"
            f"response_type=code&"
            f"client_id={config['client_id']}&"
            f"redirect_uri={config['callback_url']}&"
            f"scope=openid%20profile%20email&"
            f"state={state}&"
            f"access_type=offline&"
            f"prompt=consent"
        )
        
        logger.info(f"Google auth URL generated: {auth_url}")
        
        return {
            "status": "success",
            "authUrl": auth_url,
            "state": state
        }
        
    except Exception as e:
        logger.error(f"Error starting Google auth: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to start Google authentication: {str(e)}")

@router.get("/google/callback")
async def handle_google_auth_callback(request: Request, code: str = Query(...), state: str = Query(...)):
    """处理Google OAuth回调"""
    try:
        # 读取认证状态
        auth_states = read_auth_states()
        
        # 验证state
        if state not in auth_states:
            logger.error(f"Invalid state: {state}")
            # 重定向回前端错误页面
            config = get_google_oauth_config()
            return RedirectResponse(url=f"{config['redirect_uri']}/login?error=invalid_state")
        
        # 检查state是否过期（5分钟）
        auth_state = auth_states[state]
        if time.time() - auth_state["timestamp"] > 300:
            logger.error(f"Expired state: {state}")
            # 从存储中删除过期的state
            del auth_states[state]
            write_auth_states(auth_states)
            config = get_google_oauth_config()
            return RedirectResponse(url=f"{config['redirect_uri']}/login?error=expired_state")
        
        config = get_google_oauth_config()
        
        # 交换授权码获取访问令牌，尝试多次并提供直接连接选项
        try:
            logger.info(f"Attempting to exchange code for token with provider_key='google'")
            response = await http_client.async_post(
                "https://oauth2.googleapis.com/token",
                provider_key="google",
                data={
                    "code": code,
                    "client_id": config["client_id"],
                    "client_secret": config["client_secret"],
                    "redirect_uri": config["callback_url"],
                    "grant_type": "authorization_code"
                },
                timeout=30.0
            )
            logger.debug(f"Token exchange response status: {response.status_code}")
        except Exception as e:
            logger.warning(f"First attempt failed with error: {str(e)}, trying without proxy")
            # 第一次尝试失败，尝试不使用代理直接连接
            # 注意：使用proxy=None会自动设置trust_env=False（根据get_client_kwargs的实现）
            try:
                response = await http_client.async_post(
                    "https://oauth2.googleapis.com/token",
                    data={
                        "code": code,
                        "client_id": config["client_id"],
                        "client_secret": config["client_secret"],
                        "redirect_uri": config["callback_url"],
                        "grant_type": "authorization_code"
                    },
                    timeout=30.0,
                    proxy=None  # 明确指定不使用代理
                )
                logger.debug(f"Second attempt (without proxy) response status: {response.status_code}")
            except Exception as retry_error:
                logger.error(f"Both attempts to exchange code for token failed: {str(retry_error)}")
                config = get_google_oauth_config()
                return RedirectResponse(url=f"{config['redirect_uri']}/login?error=token_exchange_failed")
            
        if response.status_code != 200:
            logger.error(f"Failed to exchange code for token: {response.text}")
            # 重定向回前端错误页面
            return RedirectResponse(url=f"{config['redirect_uri']}/login?error=token_exchange_failed")
            
        token_data = response.json()
        access_token = token_data.get("access_token")
            
        if not access_token:
            logger.error("No access token in response")
            return RedirectResponse(url=f"{config['redirect_uri']}/login?error=missing_token")
        
        # 使用访问令牌获取用户信息，同样尝试多次并提供直接连接选项
        try:
            logger.info(f"Attempting to get user info with provider_key='google'")
            response = await http_client.async_get(
                "https://www.googleapis.com/oauth2/v3/userinfo",
                provider_key="google",
                headers={"Authorization": f"Bearer {access_token}"},
                timeout=30.0
            )
            logger.debug(f"User info response status: {response.status_code}")
        except Exception as e:
            logger.warning(f"First attempt to get user info failed: {str(e)}, trying without proxy")
            # 第一次尝试失败，尝试不使用代理直接连接
            # 注意：使用proxy=None会自动设置trust_env=False（根据get_client_kwargs的实现）
            try:
                response = await http_client.async_get(
                    "https://www.googleapis.com/oauth2/v3/userinfo",
                    headers={"Authorization": f"Bearer {access_token}"},
                    timeout=30.0,
                    proxy=None  # 明确指定不使用代理
                )
                logger.debug(f"Second attempt (without proxy) to get user info status: {response.status_code}")
            except Exception as retry_error:
                logger.error(f"Both attempts to get user info failed: {str(retry_error)}")
                config = get_google_oauth_config()
                return RedirectResponse(url=f"{config['redirect_uri']}/login?error=user_info_failed")
            
        if response.status_code != 200:
            logger.error(f"Failed to get user info: {response.text}")
            return RedirectResponse(url=f"{config['redirect_uri']}/login?error=user_info_failed")
            
        user_info = response.json()
        
        # 格式化用户信息以匹配数据库结构
        db_user_info = {
            'email': user_info.get('email'),
            'username': user_info.get('name'),
            'uuid': user_info.get('sub'),
            'image_url': user_info.get('picture')
        }
        
        # 保存用户信息到数据库
        db_user = await db_service.create_or_update_user(db_user_info)
        logger.info(f"User info saved to database: {db_user.get('email')}")
        
        # 生成JWT令牌作为认证凭证
        jwt_token = generate_jwt_token(user_info)
        
        # 更新认证状态，包含数据库中的用户ID
        auth_states[state] = {
            "timestamp": time.time(),
            "status": "success",
            "token": jwt_token,
            "user_info": {
                "id": db_user.get('uuid'),
                "username": db_user.get('nickname'),
                "email": db_user.get('email'),
                "provider": "google",
                "image_url": user_info.get('picture'),
                "created_at": db_user.get('ctime'),
                "updated_at": db_user.get('mtime')
            }
        }
        
        # 保存更新后的状态
        write_auth_states(auth_states)
        
        logger.info(f"Google auth successful for user: {user_info.get('email')}")
        
        # 重定向回前端成功页面
        return RedirectResponse(url=f"{config['redirect_uri']}/login?state={state}&success=true")
        
    except Exception as e:
        logger.error(f"Error handling Google auth callback: {str(e)}")
        config = get_google_oauth_config()
        return RedirectResponse(url=f"{config['redirect_uri']}/login?error=callback_failed")

@router.get("/google/check")
async def check_google_auth_status(state: str = Query(...)):
    """检查Google认证状态"""
    try:
        # 读取认证状态
        auth_states = read_auth_states()
        
        if state not in auth_states:
            logger.error(f"State not found: {state}")
            return {
                "status": "error",
                "message": "Authentication state not found"
            }
        
        auth_state = auth_states[state]
        
        # 检查state是否过期
        if time.time() - auth_state["timestamp"] > 300:
            logger.error(f"Expired state during check: {state}")
            del auth_states[state]
            write_auth_states(auth_states)
            return {
                "status": "expired",
                "message": "Authentication expired"
            }
        
        if auth_state["status"] == "success":
            # 返回成功信息并清除状态
            result = {
                "status": "success",
                "token": auth_state["token"],
                "user_info": auth_state["user_info"]
            }
            # 为了安全，在返回成功后清除状态
            del auth_states[state]
            write_auth_states(auth_states)
            return result
        
        elif auth_state["status"] == "error":
            return {
                "status": "error",
                "message": auth_state.get("message", "Authentication failed")
            }
        
        else:
            # 仍然在处理中
            return {
                "status": "pending",
                "message": "Authentication in progress"
            }
            
    except Exception as e:
        logger.error(f"Error checking Google auth status: {str(e)}")
        return {
            "status": "error",
            "message": f"Failed to check authentication status: {str(e)}"
        }

@router.post("/jaaz/link")
async def link_jaaz_account(request: Request):
    """关联Google认证与Jaaz账户"""
    try:
        # 获取请求体
        body = await request.json()
        token = body.get("token")
        
        if not token:
            raise HTTPException(status_code=400, detail="Token is required")
        
        # 这里应该实现与Jaaz官方API的集成，将Google认证的用户与Jaaz账户关联
        # 由于我们没有具体的Jaaz官方API文档，这里仅提供一个示例实现
        
        # 模拟关联操作
        logger.info("Linking Jaaz account with Google authentication")
        
        # 实际应用中，这里应该调用Jaaz官方API进行账户关联
        # 并获取相应的Jaaz访问令牌
        
        # 示例返回
        return {
            "status": "success",
            "message": "Jaaz account linked successfully",
            "jaaz_token": token  # 在实际应用中，这应该是Jaaz返回的令牌
        }
        
    except Exception as e:
        logger.error(f"Error linking Jaaz account: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to link Jaaz account: {str(e)}")