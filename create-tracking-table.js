// 一次性脚本：创建操作追踪表
// 运行方式: node create-tracking-table.js
const TEABLE_BASE = 'https://yach-teable.zhiyinlou.com';
const TEABLE_TOKEN = 'teable_accrGoCYgJwpCP4Hy7H_CJNj3/ERLDcxs8cNekS0vxalbXtPNbnTphkd5Qhccz8=';
const BASE_ID = 'bsellQDi8tEOwbyOY2H';

async function createTable() {
  const res = await fetch(`${TEABLE_BASE}/api/base/${BASE_ID}/table`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TEABLE_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: '操作追踪',
      fields: [
        { name: '时间', type: 'singleLineText' },
        { name: '账号', type: 'singleLineText' },
        { name: '昵称', type: 'singleLineText' },
        { name: '页面', type: 'singleLineText' },
        { name: '操作', type: 'singleLineText' },
      ],
    }),
  });
  const data = await res.json();
  if (!res.ok) { console.error('Failed:', data); process.exit(1); }
  console.log('Table created! ID:', data.id);
  console.log(`Add to api.js:  const TABLE_TRACKING = '${data.id}';`);
}
createTable();
