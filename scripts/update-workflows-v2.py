#!/usr/bin/env python3
"""
Update n8n workflows for improved user experience
"""

import json
import re

def update_daily_pack_v3():
    """Update daily-pack-v3.json to show dynamic mode status"""
    file_path = 'workflows/daily-pack-v3.json'

    with open(file_path, 'r', encoding='utf-8') as f:
        workflow = json.load(f)

    # Find the "Send to Slack" node
    for node in workflow['nodes']:
        if node.get('name') == 'Send to Slack':
            code = node['parameters']['jsCode']

            # Pattern to match the instructions array
            pattern = r"const instructions = \[\s*'在本消息线程回复以下指令以执行动作：',\s*'`post 1` 发布 Option 1',\s*'`post 2` 发布 Option 2',\s*'`post 3` 发布 Option 3',\s*'（默认仅 dry-run，不会真的发推；需要你在环境变量开启 X 写入开关）',\s*\]\.join\('\\\\\\\\n'\);"

            replacement = """// Check current mode from environment variable
const xWriteEnabled = String($env.X_WRITE_ENABLED || '').toLowerCase() === 'true';
const modeStatus = xWriteEnabled
  ? '🟢 **真实发布模式** - 推文将直接发布到 X/Twitter'
  : '🔴 **DRY-RUN 模式** - 推文不会真的发布（需在环境变量设置 X_WRITE_ENABLED=true）';

const instructions = [
  '在本消息线程回复以下指令以执行动作：',
  '`post 1` 发布 Option 1',
  '`post 2` 发布 Option 2',
  '`post 3` 发布 Option 3',
  '',
  modeStatus,
].join('\\\\\\\\n');"""

            new_code = re.sub(pattern, replacement, code)

            if new_code != code:
                node['parameters']['jsCode'] = new_code
                print("✅ Updated daily-pack-v3.json: Added dynamic mode status")

                with open(file_path, 'w', encoding='utf-8') as f:
                    json.dump(workflow, f, ensure_ascii=False, indent=2)
                return True
            else:
                print("❌ Pattern not matched in daily-pack-v3.json")
                # Try simpler pattern
                if "const instructions = [" in code:
                    # Manual replacement
                    lines = code.split('\\n')
                    new_lines = []
                    skip_until_join = False
                    i = 0
                    while i < len(lines):
                        line = lines[i]
                        if "const instructions = [" in line:
                            # Add new code
                            new_lines.append("// Check current mode from environment variable")
                            new_lines.append("const xWriteEnabled = String($env.X_WRITE_ENABLED || '').toLowerCase() === 'true';")
                            new_lines.append("const modeStatus = xWriteEnabled")
                            new_lines.append("  ? '🟢 **真实发布模式** - 推文将直接发布到 X/Twitter'")
                            new_lines.append("  : '🔴 **DRY-RUN 模式** - 推文不会真的发布（需在环境变量设置 X_WRITE_ENABLED=true）';")
                            new_lines.append("")
                            new_lines.append("const instructions = [")
                            new_lines.append("  '在本消息线程回复以下指令以执行动作：',")
                            new_lines.append("  '`post 1` 发布 Option 1',")
                            new_lines.append("  '`post 2` 发布 Option 2',")
                            new_lines.append("  '`post 3` 发布 Option 3',")
                            new_lines.append("  '',")
                            new_lines.append("  modeStatus,")
                            # Skip to the closing bracket
                            while i < len(lines) and "].join(" not in lines[i]:
                                i += 1
                            if i < len(lines):
                                new_lines.append(lines[i])  # Add the ].join line
                        else:
                            new_lines.append(line)
                        i += 1

                    new_code = '\\n'.join(new_lines)
                    node['parameters']['jsCode'] = new_code
                    print("✅ Updated daily-pack-v3.json: Added dynamic mode status (manual)")

                    with open(file_path, 'w', encoding='utf-8') as f:
                        json.dump(workflow, f, ensure_ascii=False, indent=2)
                    return True

                return False

    print("❌ Could not find 'Send to Slack' node")
    return False

def update_slack_approvals():
    """Update slack-approvals.json to include tweet URL in success message"""
    file_path = 'workflows/slack-approvals.json'

    with open(file_path, 'r', encoding='utf-8') as f:
        workflow = json.load(f)

    for node in workflow['nodes']:
        if node.get('name') == 'Process Slack Commands':
            code = node['parameters']['jsCode']

            # Find and replace the success posting logic
            old_pattern = r"const postResult = await postTweet\(tweetText\);\s*await slackPost\(\{\s*channel: channelId,\s*thread_ts: threadTs,\s*text: `✅ 已发布 Option \$\{cmd\.option\}\\\\\\\\n\\\\\\\\n\$\{tweetText\}\\\\\\\\n\\\\\\\\n返回：\$\{JSON\.stringify\(postResult\)\.slice\(0, 1500\)\}\$\{ackMarker\}`\s*\}\);"

            replacement = """const postResult = await postTweet(tweetText);

        // Extract tweet ID and construct URL
        let tweetUrl = '';
        try {
          const resultData = postResult?.data?.data;
          if (resultData?.id) {
            tweetUrl = `https://x.com/i/web/status/${resultData.id}`;
          }
        } catch (err) {
          // Ignore extraction errors
        }

        const successMessage = tweetUrl
          ? `✅ 推文发布成功！\\\\\\\\n\\\\\\\\n${tweetText}\\\\\\\\n\\\\\\\\n🔗 查看推文: ${tweetUrl}${ackMarker}`
          : `✅ 已发布 Option ${cmd.option}\\\\\\\\n\\\\\\\\n${tweetText}\\\\\\\\n\\\\\\\\n返回：${JSON.stringify(postResult).slice(0, 1500)}${ackMarker}`;

        await slackPost({
          channel: channelId,
          thread_ts: threadTs,
          text: successMessage
        });"""

            new_code = re.sub(old_pattern, replacement, code, flags=re.DOTALL)

            if new_code != code:
                node['parameters']['jsCode'] = new_code
                print("✅ Updated slack-approvals.json: Added tweet URL in success message")

                with open(file_path, 'w', encoding='utf-8') as f:
                    json.dump(workflow, f, ensure_ascii=False, indent=2)
                return True
            else:
                # Try manual string replacement
                old_str = "const postResult = await postTweet(tweetText);\\n        await slackPost({\\n          channel: channelId,\\n          thread_ts: threadTs,\\n          text: `✅ 已发布 Option ${cmd.option}\\\\\\\\n\\\\\\\\n${tweetText}\\\\\\\\n\\\\\\\\n返回：${JSON.stringify(postResult).slice(0, 1500)}${ackMarker}`\\n        });"

                new_str = """const postResult = await postTweet(tweetText);

        // Extract tweet ID and construct URL
        let tweetUrl = '';
        try {
          const resultData = postResult?.data?.data;
          if (resultData?.id) {
            tweetUrl = `https://x.com/i/web/status/${resultData.id}`;
          }
        } catch (err) {
          // Ignore extraction errors
        }

        const successMessage = tweetUrl
          ? `✅ 推文发布成功！\\\\\\\\n\\\\\\\\n${tweetText}\\\\\\\\n\\\\\\\\n🔗 查看推文: ${tweetUrl}${ackMarker}`
          : `✅ 已发布 Option ${cmd.option}\\\\\\\\n\\\\\\\\n${tweetText}\\\\\\\\n\\\\\\\\n返回：${JSON.stringify(postResult).slice(0, 1500)}${ackMarker}`;

        await slackPost({
          channel: channelId,
          thread_ts: threadTs,
          text: successMessage
        });"""

                if old_str in code:
                    new_code = code.replace(old_str, new_str)
                    node['parameters']['jsCode'] = new_code
                    print("✅ Updated slack-approvals.json: Added tweet URL (manual)")

                    with open(file_path, 'w', encoding='utf-8') as f:
                        json.dump(workflow, f, ensure_ascii=False, indent=2)
                    return True
                else:
                    print("❌ Pattern not matched in slack-approvals.json")
                    return False

    print("❌ Could not find 'Process Slack Commands' node")
    return False

if __name__ == '__main__':
    print("Updating n8n workflows...\n")

    result1 = update_daily_pack_v3()
    print()
    result2 = update_slack_approvals()

    print("\n" + "="*60)
    if result1 and result2:
        print("✅ All updates completed!")
        print("\nChanges made:")
        print("1. daily-pack-v3.json: Dynamic mode status (🟢 真实发布 / 🔴 DRY-RUN)")
        print("2. slack-approvals.json: Tweet URL in success message")
        print("\nNext: Import updated workflows to n8n and test!")
    else:
        print("❌ Some updates failed")
