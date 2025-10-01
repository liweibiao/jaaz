import os
import sys
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

router = APIRouter(prefix="/api", tags=["file"])

# 获取项目根目录（修复路径处理问题）
SERVER_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
print(f"🦄 file_router: SERVER_DIR: {SERVER_DIR}")

# 定义静态文件目录映射
STATIC_DIR_MAPPING = {
    "/static/template_images": os.path.join(SERVER_DIR, "static", "template_images")
}

# 打印静态目录映射，用于调试
for prefix, static_dir in STATIC_DIR_MAPPING.items():
    print(f"🦄 file_router: 静态目录映射: {prefix} -> {static_dir}")


@router.get("/serve_file")
async def serve_file(file_path: str):
    """提供静态文件服务接口，支持从不同的静态目录提供文件
    
    Args:
        file_path: 请求的文件路径，如 /static/template_images/nizhen.png
    
    Returns:
        FileResponse: 文件响应
    """
    try:
        print(f"🦄 file_router: 接收到文件请求: file_path={file_path}")
        print(f"🦄 file_router: 当前工作目录: {os.getcwd()}")
        
        # 检查文件路径是否以预定义的静态目录前缀开头
        for prefix, static_dir in STATIC_DIR_MAPPING.items():
            print(f"🦄 file_router: 检查前缀: {prefix}，静态目录: {static_dir}")
            if file_path.startswith(prefix):
                print(f"🦄 file_router: 匹配到前缀: {prefix}")
                # 构建实际文件路径
                relative_path = file_path[len(prefix):].lstrip('/')
                actual_file_path = os.path.join(static_dir, relative_path)
                print(f"🦄 file_router: 构建的实际文件路径: {actual_file_path}")
                
                # 确保文件存在
                if os.path.exists(actual_file_path):
                    print(f"🦄 file_router: 文件存在: {actual_file_path}")
                    if os.path.isfile(actual_file_path):
                        print(f"🦄 file_router: 是文件，返回FileResponse")
                        return FileResponse(actual_file_path)
                    else:
                        print(f"🦄 file_router: 路径不是文件: {actual_file_path}")
                        raise HTTPException(status_code=400, detail=f"路径不是文件: {actual_file_path}")
                else:
                    print(f"🦄 file_router: 文件不存在: {actual_file_path}")
                    # 尝试检查是否有额外的斜杠
                    alternative_path = os.path.join(static_dir, file_path.lstrip('/'))
                    print(f"🦄 file_router: 尝试替代路径: {alternative_path}")
                    if os.path.exists(alternative_path) and os.path.isfile(alternative_path):
                        return FileResponse(alternative_path)
                    raise HTTPException(status_code=404, detail=f"文件不存在: {actual_file_path}")
        
        # 如果路径不以预定义前缀开头，检查是否在FILES_DIR中
        print(f"🦄 file_router: 未匹配到任何前缀，尝试从FILES_DIR加载")
        
        try:
            from services.config_service import FILES_DIR
            print(f"🦄 file_router: FILES_DIR: {FILES_DIR}")
        except Exception as e:
            print(f"🦄 file_router: 导入FILES_DIR失败: {str(e)}")
            raise HTTPException(status_code=500, detail=f"服务器配置错误: {str(e)}")
        
        if not file_path.startswith('/'):
            file_path = '/' + file_path
        
        # 尝试从FILES_DIR加载文件
        actual_file_path = os.path.join(FILES_DIR, file_path.lstrip('/'))
        print(f"🦄 file_router: 尝试FILES_DIR路径: {actual_file_path}")
        
        if os.path.exists(actual_file_path) and os.path.isfile(actual_file_path):
            return FileResponse(actual_file_path)
        
        # 如果所有路径都找不到文件，返回404错误
        print(f"🦄 file_router: 所有路径都找不到文件: {file_path}")
        raise HTTPException(status_code=404, detail=f"文件不存在: {file_path}")
    except HTTPException:
        # 重新抛出HTTPException，保持原有行为
        raise
    except Exception as e:
        # 捕获所有其他异常并记录详细信息
        print(f"🦄 file_router: 发生未预期的异常: {type(e).__name__}: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"服务器内部错误: {str(e)}")