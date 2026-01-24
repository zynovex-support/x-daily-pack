/**
 * n8n 工具函数
 */

const { request } = require('./http-client');
const config = require('../config/test.config');

/**
 * 通过名称获取 workflow
 * @param {string} name - workflow 名称（支持部分匹配）
 * @returns {Promise<object|null>} workflow 对象或 null
 */
async function getWorkflowByName(name) {
  const baseUrl = `http://${config.n8n.host}:${config.n8n.port}/api/v1`;
  const res = await request(`${baseUrl}/workflows`, {
    headers: { 'X-N8N-API-KEY': config.n8n.apiKey }
  });

  if (res.status !== 200 || !res.data.data) {
    return null;
  }

  // 精确匹配优先，否则部分匹配
  const workflows = res.data.data;
  const exact = workflows.find(w => w.name === name);
  if (exact) return exact;

  const partial = workflows.find(w => w.name.includes(name));
  return partial || null;
}

/**
 * 获取 workflow ID（通过名称查询）
 * @param {string} name - workflow 名称
 * @returns {Promise<string|null>} workflow ID 或 null
 */
async function getWorkflowId(name) {
  const wf = await getWorkflowByName(name);
  return wf?.id || null;
}

/**
 * n8n API 请求封装
 * @param {string} endpoint - API 端点
 * @param {object} options - 请求选项
 */
async function n8nApi(endpoint, options = {}) {
  const baseUrl = `http://${config.n8n.host}:${config.n8n.port}/api/v1`;
  return request(`${baseUrl}${endpoint}`, {
    headers: { 'X-N8N-API-KEY': config.n8n.apiKey },
    ...options
  });
}

module.exports = {
  getWorkflowByName,
  getWorkflowId,
  n8nApi
};
