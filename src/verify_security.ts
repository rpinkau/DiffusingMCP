import http from 'http';

const PORT = 5556;
const HOST = '127.0.0.1';

async function testHeaders() {
  console.log('Testing Headers...');
  return new Promise<void>((resolve) => {
    http.get(`http://${HOST}:${PORT}/events`, (res) => {
      console.log('X-Content-Type-Options:', res.headers['x-content-type-options']);
      console.log('X-Frame-Options:', res.headers['x-frame-options']);
      console.log('X-XSS-Protection:', res.headers['x-xss-protection']);
      console.log('Access-Control-Allow-Origin:', res.headers['access-control-allow-origin']);
      res.destroy();
      resolve();
    });
  });
}

async function testValidation() {
  console.log('\nTesting Validation...');
  const data = JSON.stringify({ prompt: '', model: 'test' }); // Invalid prompt (min 1)
  const req = http.request({
    hostname: HOST,
    port: PORT,
    path: '/generate',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
      console.log('Status:', res.statusCode);
      console.log('Body:', body);
    });
  });
  req.write(data);
  req.end();
}

async function testRateLimit() {
  console.log('\nTesting Rate Limit...');
  for (let i = 0; i < 7; i++) {
    const req = http.request({
      hostname: HOST,
      port: PORT,
      path: '/generate',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Origin': 'http://localhost:3000' }
    }, (res) => {
      console.log(`Request ${i + 1} Status:`, res.statusCode);
      res.destroy();
    });
    req.write(JSON.stringify({ prompt: 'test', model: 'test' }));
    req.end();
    await new Promise<void>(r => setTimeout(r, 100));
  }
}

async function run() {
  try {
    await testHeaders();
    await testValidation();
    await testRateLimit();
  } catch (e) {
    console.error('Test Failed:', e);
  }
}

run();
