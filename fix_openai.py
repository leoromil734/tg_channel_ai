#!/usr/bin/env python3
"""
修复 openai.ts 文件中的 [REDACTED] 占位符
将 [REDACTED] 替换为 [REDACTED]
"""

from pathlib import Path

def fix_file():
    file_path = Path(r"c:\Users\test\Desktop\Mooproxy\channel_ai\backend\src\providers\openai.ts")
    
    if not file_path.exists():
        print(f"错误: 文件不存在 {file_path}")
        return
    
    # 读取文件
    content = file_path.read_text(encoding='utf-8')
    original = content
    
    # 计数
    count = content.count('[REDACTED]')
    print(f"找到 {count} 处 [REDACTED] 占位符")
    
    # 替换 [REDACTED] 为 [REDACTED]
    content = content.replace('[REDACTED]', '[REDACTED]')
    
    # 写回
    if content != original:
        file_path.write_text(content, encoding='utf-8')
        print(f"✓ 成功替换 {count} 处占位符为 [REDACTED]")
        print(f"✓ 文件已更新: {file_path}")
    else:
        print("未发现需要修复的内容")

if __name__ == "__main__":
    print("开始修复 openai.ts...")
    fix_file()
    print("完成!")