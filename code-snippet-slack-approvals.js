// Slack Approvals - Process Slack Commands 节点
// 替换 postTweet 成功后的消息部分

// 原代码（要被替换的）：
/*
const postResult = await postTweet(tweetText);
await slackPost({
  channel: channelId,
  thread_ts: threadTs,
  text: `✅ 已发布 Option ${cmd.option}\\n\\n${tweetText}\\n\\n返回：${JSON.stringify(postResult).slice(0, 1500)}${ackMarker}`
});
*/

// 新代码（复制下面全部内容）：

const postResult = await postTweet(tweetText);

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
  ? `✅ 推文发布成功！\\n\\n${tweetText}\\n\\n🔗 查看推文: ${tweetUrl}${ackMarker}`
  : `✅ 已发布 Option ${cmd.option}\\n\\n${tweetText}\\n\\n返回：${JSON.stringify(postResult).slice(0, 1500)}${ackMarker}`;

await slackPost({
  channel: channelId,
  thread_ts: threadTs,
  text: successMessage
});

// 说明：
// 1. 从 API 响应中提取推文 ID
// 2. 构建推文 URL: https://x.com/i/web/status/{id}
// 3. 如果提取成功，显示推文链接
// 4. 如果提取失败，回退到原来的格式
// 5. 注意：字符串中的换行是 \n（单反斜杠）
