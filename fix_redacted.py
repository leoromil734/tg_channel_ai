#!/usr/bin/env python3
"""
修复 openai.ts 文件中的 [REDACTED] 占位符
将 [REDACTED] 替换为 [REDACTED]
"""

import re
from pathlib import Path

def fix_redacted_placeholders(file_path: str) -> None:
    """
    替换文件中的 [REDACTED] 占位符为 [REDACTED]
    
    Args:
        file_path: 要修复的文件路径
    """
    file = Path(file_path)
    
    if not file.exists():
        print(f"错误: 文件不存在 {file_path}")
        return
    
    # 读取文件内容
    content = file.read_text(encoding='utf-8')
    original_content = content
    
    # 替换所有 [REDACTED] 为 [REDACTED]
    content = content.replace('[REDACTED]', '[REDACTED]')
    
    # 检查是否有修改
    if content == original_content:
        print("未发现需要修复的 [REDACTED] 占位符")
        return
    
    # 写回文件
    file.write_text(content, encoding='utf-8')
    
    # 统计修改次数
    changes = original_content.count('[REDACTED]')
    print(f"✓ 成功修复 {changes} 处 [REDACTED] 占位符")
    print(f"✓ 文件已更新: {file_path}")

if __name__ == "__main__":
    # 目标文件路径
    target_file = r"c:\Users\test\Desktop\Mooproxy\channel_ai\backend\src\providers\openai.ts"
    
    print("开始修复 openai.ts 文件...")
    fix_redacted_placeholders(target_file)
    print("完成!")