# Operations (Runbook)

**版本**: v5-fixed
**最后更新**: 2026-01-27

> 推荐主入口：`docs/RUNBOOK.md`

## 启动

```bash
# 启动服务
docker compose up -d
docker compose ps

# 重启 n8n
docker compose restart n8n

# 查看日志
docker compose logs --tail 200 n8n
docker compose logs --tail 200 config-server
```

## 标准运行顺序（固定这样做）

```bash
# 1) 同步代码节点与调度到 live n8n
npm run deploy

# 2) 检查 live 与 repo 是否漂移
npm run drift-check

# 3) 探针：调度/成功率/Slack 命中
npm run probe

# 4) 需要时手工触发 + 验证闭环
npm run trigger:webhook
```

## 故障排除

| 问题 | 解决方案 |
|------|---------|
| UI 打不开 | `docker compose ps` + `docker compose logs n8n` |
| 权限错误 | `sudo chown -R $(id -u):$(id -g) ~/.n8n` |
| Slack 失败 | `npm run probe` 查看 Slack 命中与 message_ts |
| 线上状态不一致 | `npm run drift-check` |
| 到点无消息 | `npm run probe` → `npm run trigger:webhook` → 再 `npm run probe` |

## 测试

```bash
npm test
npm run test:unit
```

## 巡检告警（建议加 cron）

```bash
# dry-run（只打印）
npm run probe:notify

# 实际发送告警（默认 issues+warnings）
npm run probe:notify:send
```

建议 cron（每 15 分钟一次）：

```bash
*/15 * * * * cd /home/henry/x && npm run probe:notify:send >> logs/probe-notify.log 2>&1
```
