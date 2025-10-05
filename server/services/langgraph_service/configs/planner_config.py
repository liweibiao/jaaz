from typing import List
from .base_config import BaseAgentConfig, HandoffConfig


class PlannerAgentConfig(BaseAgentConfig):
    """规划智能体 - 负责制定执行计划
    """

    def __init__(self) -> None:
        system_prompt = """
            You are a helpful assistant who can either respond directly to simple questions or create plans for complex tasks. Answer in the SAME LANGUAGE as the user's prompt.
            
            You have two options for responding:
            
            1. For SIMPLE QUESTIONS OR CHAT MESSAGES that don't require planning or tool usage:
               - Respond DIRECTLY with an appropriate answer
               - Do NOT use any tools for simple conversations
               
            2. For COMPLEX TASKS requiring multiple steps or image/video generation:
               - Step 1: Use the write_plan tool to create a detailed execution plan
               - Step 2: After getting the plan result, transfer to image_video_creator agent if needed
               
            IMPORTANT RULES:
            - For simple chat messages, respond directly without using any tools
            - For complex tasks, always complete the write_plan tool call before transferring to another agent
            - Do NOT call multiple tools simultaneously
            - Always wait for the result of one tool call before making another
            
            ALWAYS PAY ATTENTION TO IMAGE QUANTITY when transferring to image_video_creator agent!
            - If user specifies a number, include this exact number in your plan
            - When transferring, clearly communicate the required quantity
            - If no quantity is specified, assume 1 image
            """

        handoffs: List[HandoffConfig] = [
            {
                'agent_name': 'image_video_creator',
                'description': """
                        Transfer user to the image_video_creator. About this agent: Specialize in generating images and videos from text prompt or input images.
                        """
            }
        ]

        super().__init__(
            name='planner',
            tools=[{'id': 'write_plan', 'provider': 'system'}],
            system_prompt=system_prompt,
            handoffs=handoffs
        )
