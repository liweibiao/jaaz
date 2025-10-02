from fastapi import APIRouter, Request
#from routers.agent import chat
from services.chat_service import handle_chat
from services.db_service import db_service
import asyncio
import json
import traceback

router = APIRouter(prefix="/api/canvas")

@router.get("/list")
async def list_canvases():
    return await db_service.list_canvases()

@router.post("/create")
async def create_canvas(request: Request):
    try:
        data = await request.json()
        id = data.get('canvas_id')
        name = data.get('name')
        original_canvas_id = data.get('original_canvas_id')
        
        # 创建新画布
        await db_service.create_canvas(id, name)
        
        # 如果提供了原始画布ID，则复制其数据和聊天记录
        if original_canvas_id:
            # 获取原始画布数据
            original_data = await db_service.get_canvas_data(original_canvas_id)
            if original_data:
                # 保存原始画布的数据到新画布
                if original_data.get('data'):
                    await db_service.save_canvas_data(
                        id,
                        json.dumps(original_data['data']),
                        # 也可以选择复制缩略图
                        # original_data.get('thumbnail')  # 如果需要复制缩略图
                    )
                
                # 复制聊天会话和消息
                if original_data.get('sessions'):
                    for session in original_data['sessions']:
                        # 创建新的会话ID
                        new_session_id = data.get('session_id') if len(original_data['sessions']) == 1 else str(uuid.uuid4())
                        # 创建新会话
                        await db_service.create_chat_session(
                            new_session_id,
                            session.get('model', ''),
                            session.get('provider', ''),
                            id,
                            session.get('title')
                        )
                        
                        # 复制会话的消息
                        original_messages = await db_service.get_chat_history(session.get('id', ''))
                        for msg in original_messages:
                            await db_service.create_message(new_session_id, msg.get('role', 'user'), json.dumps(msg))
        
        # 如果没有提供原始画布ID，则创建聊天会话
        if not original_canvas_id:
            asyncio.create_task(handle_chat(data))
        
        return {"id": id }
    except Exception as e:
        print(f"Error creating canvas: {e}")
        traceback.print_exc()
        return {"error": "创建项目失败，请稍后再试", "details": str(e)}
    

@router.get("/{id}")
async def get_canvas(id: str):
    return await db_service.get_canvas_data(id)

@router.post("/{id}/save")
async def save_canvas(id: str, request: Request):
    payload = await request.json()
    data_str = json.dumps(payload['data'])
    await db_service.save_canvas_data(id, data_str, payload['thumbnail'])
    return {"id": id }

@router.post("/{id}/rename")
async def rename_canvas(id: str, request: Request):
    data = await request.json()
    name = data.get('name')
    await db_service.rename_canvas(id, name)
    return {"id": id }

@router.delete("/{id}/delete")
async def delete_canvas(id: str):
    await db_service.delete_canvas(id)
    return {"id": id }