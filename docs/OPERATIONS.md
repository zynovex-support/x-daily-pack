# Operations (Runbook)

**版本**: v5-fixed
**最后更新**: 2026-01-24

## 启动

```bash
# Docker 启动
docker run -d --name n8n-local -p 5678:5678 \
  -v $HOME/.n8n:/home/node/.n8n \
  --env-file /home/henry/x/.env \
  --restart=always \
  n8nio/n8n:latest

# 重启
docker restart n8n-local

# 查看日志
docker logs --tail 200 n8n-local
```

## 故障排除

| 问题 | 解决方案 |
|------|---------|
| UI 打不开 | `docker ps` 检查容器状态 |
| 权限错误 | `sudo chown -R $(id -u):$(id -g) ~/.n8n` |
| Slack 失败 | 检查 Bot Token 和 Channel ID |

## 测试

```bash
node tests/run-all.js
```
