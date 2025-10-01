from fastapi import APIRouter, Request, Query, Body, HTTPException
from typing import List, Dict, Any, Optional
import json
from datetime import datetime
from services.db_service import db_service

router = APIRouter(prefix="/api/template")

@router.get("/")
async def get_templates(
    search: Optional[str] = Query(None, description="搜索关键词"),
    page: Optional[int] = Query(1, ge=1, description="页码"),
    limit: Optional[int] = Query(12, ge=1, le=100, description="每页数量"),
    category: Optional[str] = Query(None, description="分类"),
    sort_by: Optional[str] = Query("created_at", description="排序字段"),
    sort_order: Optional[str] = Query("desc", description="排序顺序")
):
    """获取模板列表，支持搜索、分页、分类筛选和排序"""
    # 使用数据库服务获取模板列表
    result = await db_service.get_templates(
        category=category if category and category != "all" else None,
        search=search,
        page=page,
        limit=limit,
        sort_by=sort_by,
        sort_order=sort_order
    )
    
    return result

@router.post("/")
async def create_template(
    template_data: dict = Body(...)
):
    """创建新模板"""
    # 验证必要的字段
    if not template_data.get("title"):
        raise HTTPException(status_code=400, detail="Title is required")
    
    # 使用数据库服务创建新模板
    try:
        new_template = await db_service.create_template(
            title=template_data.get("title", ""),
            description=template_data.get("description", ""),
            image=template_data.get("image", "https://magicart-template-1301698982.cos.accelerate.myqcloud.com/nizhen.png?imageMogr2/thumbnail/avif"),
            tags=template_data.get("tags", []),
            category=template_data.get("category", "my-templates")
        )
        
        # 添加额外的字段以保持与原有API的兼容性
        new_template["downloads"] = 0
        new_template["rating"] = 0
        new_template["use_mask"] = template_data.get("use_mask", 0)
        new_template["prompt"] = template_data.get("prompt", "")
        
        return {
            "success": True,
            "message": "Template created successfully",
            "template": new_template
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/my")
async def get_my_templates(
    search: Optional[str] = Query(None, description="搜索关键词"),
    page: Optional[int] = Query(1, ge=1, description="页码"),
    limit: Optional[int] = Query(12, ge=1, le=100, description="每页数量"),
    sort_by: Optional[str] = Query("created_at", description="排序字段"),
    sort_order: Optional[str] = Query("desc", description="排序顺序")
):
    """获取用户创建的模板列表"""
    # 使用数据库服务获取所有模板列表（不限制分类）
    result = await db_service.get_templates(
        category=None,
        search=search,
        page=page,
        limit=limit,
        sort_by=sort_by,
        sort_order=sort_order
    )
    
    # 为每个模板添加额外的字段以保持与原有API的兼容性
    for template in result["templates"]:
        # 确保所有必要字段都存在
        template["downloads"] = template.get("downloads", 0)
        template["rating"] = template.get("rating", 0)
        template["use_mask"] = template.get("use_mask", 0)
        template["prompt"] = template.get("prompt", "")
    
    return result

@router.get("/{template_id}")
async def get_template(template_id: int):
    """获取单个模板详情"""
    template = await db_service.get_template(template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    return template

@router.post("/{template_id}/download")
async def download_template(template_id: int, request: Request):
    """下载模板（实际是记录使用情况）"""
    template = await db_service.get_template(template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    
    # 在实际应用中，这里可以记录模板的下载/使用次数
    # 由于我们的数据库没有downloads字段，暂时只返回成功信息
    
    return {"success": True, "message": "Template downloaded successfully"}

@router.delete("/{template_id}")
async def delete_template(template_id: int):
    """删除模板"""
    success = await db_service.delete_template(template_id)
    if not success:
        raise HTTPException(status_code=404, detail="Template not found")
    return {"success": True, "message": "Template deleted successfully"}

@router.put("/{template_id}")
async def update_template(
    template_id: int,
    template_data: dict = Body(...)
):
    """更新模板"""
    updated_template = await db_service.update_template(
        template_id=template_id,
        title=template_data.get("title"),
        description=template_data.get("description"),
        image=template_data.get("image"),
        tags=template_data.get("tags"),
        category=template_data.get("category"),
        prompt=template_data.get("prompt")
    )
    
    if not updated_template:
        raise HTTPException(status_code=404, detail="Template not found")
    
    # 添加额外的字段以保持与原有API的兼容性
    updated_template["downloads"] = 0
    updated_template["rating"] = 0
    updated_template["use_mask"] = template_data.get("use_mask", 0)
    updated_template["prompt"] = template_data.get("prompt", "")
    
    return {
        "success": True,
        "message": "Template updated successfully",
        "template": updated_template
    }