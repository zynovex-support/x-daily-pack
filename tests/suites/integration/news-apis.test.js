/**
 * News API 集成测试
 */

const { assert } = require('../../lib/assertions');
const { request } = require('../../lib/http-client');
const config = require('../../config/test.config');

const APIs = [
  { name: 'News API', key: config.apis.newsApi, url: 'https://newsapi.org/v2/everything?q=AI&pageSize=1&apiKey=' },
  { name: 'NewsData', key: config.apis.newsData, url: 'https://newsdata.io/api/1/latest?q=AI&apikey=' },
  { name: 'GNews', key: config.apis.gnews, url: 'https://gnews.io/api/v4/search?q=AI&max=1&apikey=' }
];

module.exports = {
  name: 'News APIs',

  tests: APIs.map(api => ({
    name: `${api.name} 连接`,
    skip: !api.key,
    run: async () => {
      const res = await request(api.url + api.key);
      assert.equal(res.status, 200);
    }
  }))
};
