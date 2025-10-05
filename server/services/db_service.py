import sqlite3
import json
import os
from typing import List, Dict, Any, Optional
import aiosqlite
from .config_service import USER_DATA_DIR
from .migrations.manager import MigrationManager, CURRENT_VERSION

DB_PATH = os.path.join(USER_DATA_DIR, "localmanus.db")
import uuid

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
            # 开始事务
            await db.execute("BEGIN TRANSACTION;")
            try:
                # 1. 获取所有相关的会话
                cursor = await db.execute("SELECT id FROM chat_sessions WHERE canvas_id = ?", (id,))
                sessions = await cursor.fetchall()
                
                # 2. 删除每个会话的所有消息
                for session in sessions:
                    session_id = session[0]
                    await db.execute("DELETE FROM chat_messages WHERE session_id = ?", (session_id,))
                
                # 3. 删除所有相关的会话
                await db.execute("DELETE FROM chat_sessions WHERE canvas_id = ?", (id,))
                
                # 4. 最后删除canvas本身
                await db.execute("DELETE FROM canvases WHERE id = ?", (id,))
                
                # 提交事务
                await db.commit()
            except Exception as e:
                # 发生错误时回滚事务
                await db.rollback()
                print(f"Failed to delete canvas and related data: {e}")
                raise

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

    async def save_message(self, session_id: str, message: Dict[str, Any], canvas_id: Optional[str] = None) -> int:
        """Save a single message to the database

        Args:
            session_id: The chat session ID
            message: The message to save
            canvas_id: Optional canvas ID

        Returns:
            The ID of the last saved message
        """
        async with aiosqlite.connect(self.db_path) as db:
            # Ensure message contains necessary fields
            if 'role' in message and ('content' in message or 'tool_calls' in message):
                await db.execute(
                    "INSERT INTO chat_messages (session_id, role, message) VALUES (?, ?, ?)",
                    (session_id, message['role'], json.dumps(message))
                )
                await db.commit()
                
                # Get the last inserted row ID
                cursor = await db.execute("SELECT last_insert_rowid()")
                result = await cursor.fetchone()
                return result[0] if result else 0
            return 0

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

    async def get_templates(self, category: str = None, search: str = None, page: int = 1, limit: int = 12, sort_by: str = 'created_at', sort_order: str = 'desc') -> Dict[str, Any]:
        """Get templates with pagination, search and filtering"""
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = sqlite3.Row
            query_parts = []
            params = []
            
            # Base query
            query_parts.append("SELECT id, title, description, image, tags, category, created_at FROM templates")
            
            # Add where clauses
            where_clauses = []
            if category:
                where_clauses.append("category = ?")
                params.append(category)
            if search:
                where_clauses.append("(title LIKE ? OR description LIKE ?)")
                search_param = f"%{search}%"
                params.append(search_param)
                params.append(search_param)
            
            if where_clauses:
                query_parts.append("WHERE " + " AND ".join(where_clauses))
            
            # Add sorting
            valid_sort_fields = ['created_at', 'title', 'updated_at']
            if sort_by not in valid_sort_fields:
                sort_by = 'created_at'
            
            valid_sort_orders = ['asc', 'desc']
            if sort_order not in valid_sort_orders:
                sort_order = 'desc'
            
            query_parts.append(f"ORDER BY {sort_by} {sort_order}")
            
            # Add pagination
            offset = (page - 1) * limit
            query_parts.append("LIMIT ? OFFSET ?")
            params.extend([limit, offset])
            
            # Execute query for templates
            cursor = await db.execute(" ".join(query_parts), params)
            rows = await cursor.fetchall()
            templates = [dict(row) for row in rows]
            
            # Parse tags from JSON string to list
            for template in templates:
                if template['tags']:
                    try:
                        template['tags'] = json.loads(template['tags'])
                    except:
                        template['tags'] = []
            
            # Get total count
            count_query_parts = ["SELECT COUNT(*) FROM templates"]
            if where_clauses:
                count_query_parts.append("WHERE " + " AND ".join(where_clauses))
            
            count_cursor = await db.execute(" ".join(count_query_parts), params[:-2])  # Remove limit and offset
            total_count = (await count_cursor.fetchone())[0]
            
            return {
                'templates': templates,
                'total': total_count,
                'page': page,
                'limit': limit,
                'total_pages': (total_count + limit - 1) // limit
            }
    
    async def get_template(self, template_id: int) -> Optional[Dict[str, Any]]:
        """Get a single template by ID"""
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = sqlite3.Row
            cursor = await db.execute(
                "SELECT id, title, description, image, tags, category, created_at, updated_at, prompt FROM templates WHERE id = ?",
                (template_id,)
            )
            row = await cursor.fetchone()
            
            if row:
                template = dict(row)
                # Parse tags from JSON string to list
                if template['tags']:
                    try:
                        template['tags'] = json.loads(template['tags'])
                    except:
                        template['tags'] = []
                return template
            return None
    
    async def create_template(self, title: str, description: str, image: str, tags: List[str], category: str = 'my-templates') -> Dict[str, Any]:
        """Create a new template"""
        async with aiosqlite.connect(self.db_path) as db:
            # Convert tags list to JSON string
            tags_json = json.dumps(tags)
            
            cursor = await db.execute(
                "INSERT INTO templates (title, description, image, tags, category) VALUES (?, ?, ?, ?, ?)",
                (title, description, image, tags_json, category)
            )
            await db.commit()
            
            # Get the newly created template
            new_template_id = cursor.lastrowid
            return await self.get_template(new_template_id)
    
    async def delete_template(self, template_id: int) -> bool:
        """Delete a template by ID"""
        async with aiosqlite.connect(self.db_path) as db:
            result = await db.execute("DELETE FROM templates WHERE id = ?", (template_id,))
            await db.commit()
            return result.rowcount > 0
    
    async def update_template(self, template_id: int, title: str = None, description: str = None, image: str = None, tags: List[str] = None, category: str = None, prompt: str = None) -> Optional[Dict[str, Any]]:
        """Update a template"""
        async with aiosqlite.connect(self.db_path) as db:
            # Check if template exists
            existing_template = await self.get_template(template_id)
            if not existing_template:
                return None
            
            # Prepare update fields
            update_fields = []
            params = []
            
            if title is not None:
                update_fields.append("title = ?")
                params.append(title)
            if description is not None:
                update_fields.append("description = ?")
                params.append(description)
            if image is not None:
                update_fields.append("image = ?")
                params.append(image)
            if tags is not None:
                update_fields.append("tags = ?")
                params.append(json.dumps(tags))
            if category is not None:
                update_fields.append("category = ?")
                params.append(category)
            if prompt is not None:
                update_fields.append("prompt = ?")
                params.append(prompt)
            
            # Always update the updated_at field
            update_fields.append("updated_at = STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now')")
            
            # Add template_id to params
            params.append(template_id)
            
            # Execute update
            await db.execute(
                f"UPDATE templates SET {', '.join(update_fields)} WHERE id = ?",
                params
            )
            await db.commit()
            
            # Return the updated template
            return await self.get_template(template_id)

    async def get_user_by_email(self, email: str) -> Optional[Dict[str, Any]]:
        """Get user by email"""
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = sqlite3.Row
            cursor = await db.execute("""
                SELECT id, email, nickname, ctime, mtime, points, uuid, level, subscription_id, order_id
                FROM users
                WHERE email = ?
            """, (email,))
            row = await cursor.fetchone()
            return dict(row) if row else None

    async def get_user_by_uuid(self, user_uuid: str) -> Optional[Dict[str, Any]]:
        """Get user by UUID"""
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = sqlite3.Row
            cursor = await db.execute("""
                SELECT id, email, nickname, ctime, mtime, points, uuid, level, subscription_id, order_id
                FROM users
                WHERE uuid = ?
            """, (user_uuid,))
            row = await cursor.fetchone()
            return dict(row) if row else None

    async def create_or_update_user(self, user_info: Dict[str, Any]) -> Dict[str, Any]:
        """Create or update user information"""
        # 检查用户是否已存在
        existing_user = await self.get_user_by_email(user_info.get('email'))
        
        async with aiosqlite.connect(self.db_path) as db:
            if existing_user:
                # 更新现有用户
                update_fields = ["nickname = ?", "mtime = STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now')"]
                params = [user_info.get('username', existing_user['nickname'])]
                
                # 只更新提供了值的字段
                if 'uuid' in user_info:
                    update_fields.append("uuid = ?")
                    params.append(user_info['uuid'])
                if 'points' in user_info:
                    update_fields.append("points = ?")
                    params.append(user_info['points'])
                if 'level' in user_info:
                    update_fields.append("level = ?")
                    params.append(user_info['level'])
                
                params.append(existing_user['id'])
                
                await db.execute(
                    f"UPDATE users SET {', '.join(update_fields)} WHERE id = ?",
                    params
                )
                await db.commit()
                
                # 返回更新后的用户信息
                return await self.get_user_by_email(user_info.get('email'))
            else:
                # 创建新用户
                user_uuid = user_info.get('uuid', str(uuid.uuid4()))
                nickname = user_info.get('username', user_info.get('email').split('@')[0])
                
                await db.execute("""
                    INSERT INTO users (email, nickname, ctime, mtime, points, uuid, level)
                    VALUES (?, ?, STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now'), STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now'), ?, ?, ?)
                """, (
                    user_info.get('email'),
                    nickname,
                    user_info.get('points', 1000),
                    user_uuid,
                    user_info.get('level', 'free')
                ))
                await db.commit()
                
                # 返回新创建的用户信息
                return await self.get_user_by_email(user_info.get('email'))

# Create a singleton instance
db_service = DatabaseService()
