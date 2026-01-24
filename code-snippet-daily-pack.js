// Daily Pack v3 - Send to Slack 节点
// 替换 instructions 部分的代码

// 原代码（要被替换的）：
/*
const instructions = [
  '在本消息线程回复以下指令以执行动作：',
  '`post 1` 发布 Option 1',
  '`post 2` 发布 Option 2',
  '`post 3` 发布 Option 3',
  '（默认仅 dry-run，不会真的发推；需要你在环境变量开启 X 写入开关）',
].join('\n');
*/

// 新代码（复制下面全部内容）：

// Check current mode from environment variable
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
].join('\n');

// 说明：
// 1. 这段代码会检查环境变量 X_WRITE_ENABLED
// 2. 如果是 true，显示绿色"真实发布模式"
// 3. 如果是 false 或未设置，显示红色"DRY-RUN 模式"
// 4. 所有引号都是英文单引号 '
// 5. emoji 🔴 🟢 应该正常显示
