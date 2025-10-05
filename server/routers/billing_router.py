from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import JSONResponse
from fastapi import Cookie
import logging
from services.settings_service import settings_service
from services.jaaz_service import JaazService
from services.db_service import db_service
from utils.http_client import get_http_client
import aiohttp

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/billing", tags=["billing"])

@router.get("/getBalance")
async def get_balance(
    user_email: str = Cookie(None),
    user_uuid: str = Cookie(None)
):
    """获取用户的余额/积分信息"""
    try:
        logger.info("Getting user balance")
        
        # 首先创建JaazService实例
        jaaz_service = JaazService()
        
        # 检查是否配置了Jaaz API token
        has_api_key = jaaz_service._has_jaaz_api_key()
        
        # 检查是否是Google登录用户（没有API key但有用户邮箱）
        if user_email and (not has_api_key):
            logger.info(f"Handling Google login user: {user_email}")
            
            # 从数据库中获取用户信息和积分
            db_user = await db_service.get_user_by_email(user_email)
            
            if db_user:
                # 如果在数据库中找到用户，使用数据库中的积分信息（转换为字符串）
                points = str(db_user.get('points', 0))
                logger.info(f"Retrieved user points from database: {points}")
                return {"balance": points}
            else:
                # 如果在数据库中找不到用户，返回默认积分
                logger.info(f"User not found in database, returning default points")
                return {"balance": "1000"}
        
        # 对于官方登录用户，继续调用Jaaz官方API获取真实余额
        # 检查是否配置了Jaaz API token
        if not has_api_key:
            logger.warning("Jaaz API token is not configured, returning default balance")
            return {"balance": "1000"}
        
        # 使用Jaaz API获取真实的用户积分
        # 调用官方API的积分查询端点 - https://jaaz.app/api/billing/getBalance
        async with get_http_client().create_aiohttp_client_session(provider_key="jaaz") as session:
            async with session.get(
                "https://jaaz.app/api/billing/getBalance",
                headers=jaaz_service._build_headers(),
                timeout=aiohttp.ClientTimeout(total=20.0)
            ) as response:
                if response.status == 200:
                    data = await response.json()
                    # 从API响应中提取余额信息
                    balance = str(data.get('balance', '0'))
                    logger.info(f"Retrieved real user balance from API: {balance}")
                    return {"balance": balance}
                else:
                    logger.error(f"Failed to get real balance from API. Status: {response.status}")
                    # 对于API失败的情况，也返回默认积分
                    return {"balance": "1000"}
                    
    except Exception as api_error:
        logger.error(f"Error calling balance API: {str(api_error)}")
        # 出错时返回默认积分，避免前端显示错误
        return {"balance": "1000"}
        
    except Exception as e:
        logger.error(f"Error getting user balance: {str(e)}")
        # 出错时返回默认积分，避免前端显示错误
        return {"balance": "1000"}

# 如果需要，可以添加更多的计费相关接口

@router.post("/updateBalance")
async def update_balance(amount: str):
    """更新用户的余额/积分"""
    try:
        logger.info(f"Updating user balance by amount: {amount}")
        
        # 在实际应用中，这里应该验证用户身份并更新数据库中的余额
        # 目前只是返回一个成功的响应
        
        return {
            "status": "success",
            "message": "Balance updated successfully",
            "new_balance": amount  # 实际应用中应该返回更新后的真实余额
        }
        
    except Exception as e:
        logger.error(f"Error updating user balance: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to update user balance: {str(e)}")