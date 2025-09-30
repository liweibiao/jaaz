import sqlite3
import json
import os
from typing import List, Dict, Any, Optional
import aiosqlite
from .config_service import USER_DATA_DIR
from .migrations.manager import MigrationManager, CURRENT_VERSION

DB_PATH = os.path.join(USER_DATA_DIR, "localmanus.db")

class DatabaseService:
    def __init__(self):
        self.db_path = DB_PATH
        self._ensure_db_directory()
        self._migration_manager = MigrationManager()
        self._init_db()

    def _ensure_db_directory(self):
        """Ensure the database directory exists"""
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)

    def _init_db(self):
        """Initialize the database with the current schema"""
        with sqlite3.connect(self.db_path) as conn:
            # Create version table if it doesn't exist
            conn.execute("""
                CREATE TABLE IF NOT EXISTS db_version (
                    version INTEGER PRIMARY KEY
                )
            """)
            
            # Get current version
            cursor = conn.execute("SELECT version FROM db_version")
            current_version = cursor.fetchone()
            print('local db version', current_version, 'latest version', CURRENT_VERSION)
            
            if current_version is None:
                # First time setup - start from version 0
                conn.execute("INSERT INTO db_version (version) VALUES (0)")
                self._migration_manager.migrate(conn, 0, CURRENT_VERSION)
            elif current_version[0] < CURRENT_VERSION:
                print('Migrating database from version', current_version[0], 'to', CURRENT_VERSION)
                # Need to migrate
                self._migration_manager.migrate(conn, current_version[0], CURRENT_VERSION)

    async def create_canvas(self, id: str, name: str):
        """Create a new canvas"""
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute("""
                INSERT INTO canvases (id, name)
                VALUES (?, ?)
            """, (id, name))
            await db.commit()

    async def list_canvases(self) -> List[Dict[str, Any]]:
        """Get all canvases"""
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = sqlite3.Row
            cursor = await db.execute("""
                SELECT id, name, description, thumbnail, created_at, updated_at
                FROM canvases
                ORDER BY updated_at DESC
            """)
            rows = await cursor.fetchall()
            return [dict(row) for row in rows]

    async def create_chat_session(self, id: str, model: str, provider: str, canvas_id: str, title: Optional[str] = None):
        """Save a new chat session"""
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute("""
                INSERT INTO chat_sessions (id, model, provider, canvas_id, title)
                VALUES (?, ?, ?, ?, ?)
            """, (id, model, provider, canvas_id, title))
            await db.commit()

    async def create_message(self, session_id: str, role: str, message: str):
        """Save a chat message"""
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute("""
                INSERT INTO chat_messages (session_id, role, message)
                VALUES (?, ?, ?)
            """, (session_id, role, message))
            await db.commit()

    async def get_chat_history(self, session_id: str) -> List[Dict[str, Any]]:
        """Get chat history for a session"""
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = sqlite3.Row
            cursor = await db.execute("""
                SELECT role, message, id
                FROM chat_messages
                WHERE session_id = ?
                ORDER BY id ASC
            """, (session_id,))
            rows = await cursor.fetchall()
            
            messages = []
            for row in rows:
                row_dict = dict(row)
                if row_dict['message']:
                    try:
                        msg = json.loads(row_dict['message'])
                        # 添加数据库中的id字段到返回的消息中
                        msg['id'] = row_dict['id']
                        messages.append(msg)
                    except:
                        pass
                
            return messages

    async def list_sessions(self, canvas_id: str) -> List[Dict[str, Any]]:
        """List all chat sessions"""
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = sqlite3.Row
            if canvas_id:
                cursor = await db.execute("""
                    SELECT id, title, model, provider, created_at, updated_at
                    FROM chat_sessions
                    WHERE canvas_id = ?
                    ORDER BY updated_at DESC
                """, (canvas_id,))
            else:
                cursor = await db.execute("""
                    SELECT id, title, model, provider, created_at, updated_at
                    FROM chat_sessions
                    ORDER BY updated_at DESC
                """)
            rows = await cursor.fetchall()
            return [dict(row) for row in rows]

    async def save_canvas_data(self, id: str, data: str, thumbnail: str = None):
        """Save canvas data"""
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute("""
                UPDATE canvases 
                SET data = ?, thumbnail = ?, updated_at = STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now')
                WHERE id = ?
            """, (data, thumbnail, id))
            await db.commit()

    async def get_canvas_data(self, id: str) -> Optional[Dict[str, Any]]:
        """Get canvas data"""
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = sqlite3.Row
            cursor = await db.execute("""
                SELECT data, name
                FROM canvases
                WHERE id = ?
            """, (id,))
            row = await cursor.fetchone()

            sessions = await self.list_sessions(id)
            
            if row:
                return {
                    'data': json.loads(row['data']) if row['data'] else {},
                    'name': row['name'],
                    'sessions': sessions
                }
            return None

    async def delete_canvas(self, id: str):
        """Delete canvas and related data"""
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute("DELETE FROM canvases WHERE id = ?", (id,))
            await db.commit()

    async def rename_canvas(self, id: str, name: str):
        """Rename canvas"""
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute("UPDATE canvases SET name = ? WHERE id = ?", (name, id))
            await db.commit()

    async def create_comfy_workflow(self, name: str, api_json: str, description: str, inputs: str, outputs: str = None):
        """Create a new comfy workflow"""
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute("""
                INSERT INTO comfy_workflows (name, api_json, description, inputs, outputs)
                VALUES (?, ?, ?, ?, ?)
            """, (name, api_json, description, inputs, outputs))
            await db.commit()

    async def list_comfy_workflows(self) -> List[Dict[str, Any]]:
        """List all comfy workflows"""
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = sqlite3.Row
            cursor = await db.execute("SELECT id, name, description, api_json, inputs, outputs FROM comfy_workflows ORDER BY id DESC")
            rows = await cursor.fetchall()
            return [dict(row) for row in rows]

    async def delete_comfy_workflow(self, id: int):
        """Delete a comfy workflow"""
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute("DELETE FROM comfy_workflows WHERE id = ?", (id,))
            await db.commit()

    async def get_comfy_workflow(self, id: int):
        """Get comfy workflow dict"""
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = sqlite3.Row
            cursor = await db.execute(
                "SELECT api_json FROM comfy_workflows WHERE id = ?", (id,)
              )
            row = await cursor.fetchone()
        try:
            workflow_json = (
                row["api_json"]
                if isinstance(row["api_json"], dict)
                else json.loads(row["api_json"])
            )
            return workflow_json
        except json.JSONDecodeError as exc:
            raise ValueError(f"Stored workflow api_json is not valid JSON: {exc}")
            
    async def update_chat_messages(self, session_id: str, messages: List[Dict[str, Any]]):
        """Update all messages for a chat session by replacing all existing messages"""
        async with aiosqlite.connect(self.db_path) as db:
            try:
                # 开始事务
                await db.execute("BEGIN TRANSACTION;")
                
                # 1. 先删除该会话的所有现有消息
                delete_result = await db.execute("DELETE FROM chat_messages WHERE session_id = ?", (session_id,))
                # rowcount是普通整数，不需要await
                deleted_count = delete_result.rowcount
                print(f"Deleted all {deleted_count} existing messages for session {session_id}")
                
                # 2. 插入新的消息列表
                inserted_count = 0
                for msg in messages:
                    try:
                        # 确保message包含必要的字段
                        if 'role' in msg and ('content' in msg or 'tool_calls' in msg):
                            await db.execute(
                                "INSERT INTO chat_messages (session_id, role, message) VALUES (?, ?, ?)",
                                (session_id, msg['role'], json.dumps(msg))
                            )
                            inserted_count += 1
                    except Exception as e:
                        print(f"Failed to insert message: {e}")
                        continue
                
                await db.commit()
                print(f"Update complete: deleted {deleted_count}, inserted {inserted_count} messages")
                return {
                    "success": True,
                    "deleted_count": deleted_count,
                    "inserted_count": inserted_count
                }
            except Exception as e:
                await db.rollback()
                print(f"Failed to update chat messages: {e}")
                raise
            
    async def delete_chat_messages(self, session_id: str, messages_to_delete: List[Dict[str, Any]]):
        """Delete specific chat messages by id or session_id+created_at"""
        print(f"Received delete request for session {session_id}")
        print(f"Messages to delete: {messages_to_delete}")
        
        async with aiosqlite.connect(self.db_path) as db:
            try:
                # 开始事务
                await db.execute("BEGIN TRANSACTION;")
                
                deleted_count = 0
                
                for msg_info in messages_to_delete:
                    try:
                        print(f"Processing message: {msg_info}")
                        # 优先使用id删除
                        if msg_info.get('id'):
                            # 先查询消息是否存在
                            check_result = await db.execute(
                                "SELECT id, session_id FROM chat_messages WHERE id = ? AND session_id = ?",
                                (msg_info['id'], session_id)
                            )
                            check_row = await check_result.fetchone()
                            print(f"Check message exists: {check_row}")
                            
                            delete_result = await db.execute(
                                "DELETE FROM chat_messages WHERE id = ? AND session_id = ?",
                                (msg_info['id'], session_id)
                            )
                            # aiosqlite中，rowcount是属性不是可等待的方法
                            row_count = delete_result.rowcount
                            deleted_count += row_count
                            print(f"Delete SQL: DELETE FROM chat_messages WHERE id = {msg_info['id']} AND session_id = {session_id}")
                            print(f"Deleted message with id {msg_info['id']}, rows affected: {row_count}")
                        # 如果没有id，使用session_id+created_at删除
                        elif msg_info.get('created_at'):
                            # 格式化created_at以匹配数据库中的格式
                            created_at = msg_info['created_at'].split('.')[0] + 'Z'  # 确保格式一致
                            delete_result = await db.execute(
                                "DELETE FROM chat_messages WHERE session_id = ? AND created_at LIKE ?",
                                (session_id, f"{created_at}%")
                            )
                            row_count = await delete_result.rowcount
                            deleted_count += row_count
                            print(f"Deleted message with created_at {created_at}, rows affected: {row_count}")
                        else:
                            print("No id or created_at provided, skipping")
                    except Exception as e:
                        print(f"Failed to delete message: {e}")
                        continue
                
                await db.commit()
                print(f"Delete complete: deleted {deleted_count} messages")
                return {
                    "success": True,
                    "deleted_count": deleted_count
                }
            except Exception as e:
                await db.rollback()
                print(f"Failed to delete chat messages: {e}")
                raise
    
    def _create_message_hash(self, message: Dict[str, Any]) -> str:
        """为消息创建一个简单的哈希值，用于比对消息"""
        # 使用消息的角色和内容创建哈希
        role = message.get('role', '')
        content = message.get('content', '')
        tool_calls = message.get('tool_calls', [])
        
        # 如果content是列表（混合内容），转换为字符串
        if isinstance(content, list):
            content = json.dumps(content, sort_keys=True)
        
        # 将tool_calls转换为可比较的字符串
        if isinstance(tool_calls, list):
            tool_calls = json.dumps(tool_calls, sort_keys=True)
        
        # 创建一个简单的组合字符串作为哈希
        hash_str = f"{role}:{content}:{tool_calls}"
        return hash_str

# Create a singleton instance
db_service = DatabaseService()
