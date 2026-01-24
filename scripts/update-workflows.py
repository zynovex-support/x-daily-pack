#!/usr/bin/env python3
"""
Update n8n workflows for improved user experience:
1. Daily Pack: Show dynamic mode status (dry-run vs real posting)
2. Slack Approvals: Add tweet URL in success message
"""

import json
import sys

def update_daily_pack_v3():
    """Update daily-pack-v3.json to show dynamic mode status"""
    file_path = 'workflows/daily-pack-v3.json'

    with open(file_path, 'r', encoding='utf-8') as f:
        workflow = json.load(f)

    # Find the "Send to Slack" node
    for node in workflow['nodes']:
        if node.get('name') == 'Send to Slack':
            code = node['parameters']['jsCode']

            # Replace the static instructions with dynamic mode check
            old_instructions = """const instructions = [
  '在本消息线程回复以下指令以执行动作：',
  '`post 1` 发布 Option 1',
  '`post 2` 发布 Option 2',
  '`post 3` 发布 Option 3',
  '（默认仅 dry-run，不会真的发推；需要你在环境变量开启 X 写入开关）',
].join('\\\\n');"""

            new_instructions = """// Check current mode from environment variable
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
].join('\\\\n');"""

            if old_instructions in code:
                code = code.replace(old_instructions, new_instructions)
                node['parameters']['jsCode'] = code
                print("✅ Updated daily-pack-v3.json: Added dynamic mode status")

                # Write back
                with open(file_path, 'w', encoding='utf-8') as f:
                    json.dump(workflow, f, ensure_ascii=False, indent=2)
                return True
            else:
                print("❌ Could not find instructions block in daily-pack-v3.json")
                return False

    print("❌ Could not find 'Send to Slack' node in daily-pack-v3.json")
    return False

def update_slack_approvals():
    """Update slack-approvals.json to include tweet URL in success message"""
    file_path = 'workflows/slack-approvals.json'

    with open(file_path, 'r', encoding='utf-8') as f:
        workflow = json.load(f)

    # Find the "Process Slack Commands" node
    for node in workflow['nodes']:
        if node.get('name') == 'Process Slack Commands':
            code = node['parameters']['jsCode']

            # Replace the success message to include tweet URL
            old_success = """        const postResult = await postTweet(tweetText);
        await slackPost({
          channel: channelId,
          thread_ts: threadTs,
          text: `✅ 已发布 Option ${cmd.option}\\\\n\\\\n${tweetText}\\\\n\\\\n返回：${JSON.stringify(postResult).slice(0, 1500)}${ackMarker}`
        });"""

            new_success = """        const postResult = await postTweet(tweetText);

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
          ? `✅ 推文发布成功！\\\\n\\\\n${tweetText}\\\\n\\\\n🔗 查看推文: ${tweetUrl}${ackMarker}`
          : `✅ 已发布 Option ${cmd.option}\\\\n\\\\n${tweetText}\\\\n\\\\n返回：${JSON.stringify(postResult).slice(0, 1500)}${ackMarker}`;

        await slackPost({
          channel: channelId,
          thread_ts: threadTs,
          text: successMessage
        });"""

            if old_success in code:
                code = code.replace(old_success, new_success)
                node['parameters']['jsCode'] = code
                print("✅ Updated slack-approvals.json: Added tweet URL in success message")

                # Write back
                with open(file_path, 'w', encoding='utf-8') as f:
                    json.dump(workflow, f, ensure_ascii=False, indent=2)
                return True
            else:
                print("❌ Could not find success message block in slack-approvals.json")
                return False

    print("❌ Could not find 'Process Slack Commands' node in slack-approvals.json")
    return False

if __name__ == '__main__':
    print("Updating n8n workflows...\n")

    result1 = update_daily_pack_v3()
    result2 = update_slack_approvals()

    if result1 and result2:
        print("\n✅ All updates completed successfully!")
        print("\nNext steps:")
        print("1. Import the updated workflows to n8n UI")
        print("2. Test with 'post 1/2/3' command in Slack")
        sys.exit(0)
    else:
        print("\n❌ Some updates failed. Please check the errors above.")
        sys.exit(1)
