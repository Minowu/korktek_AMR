const http = require('http');

const server = http.createServer((req, res) => {
  console.log('--- RECEIVED REQUEST ---');
  console.log(req.method + ' ' + req.url);
  console.log(req.headers);
  let body = '';
  req.on('data', chunk => body += chunk.toString());
  req.on('end', () => {
    console.log('BODY:', body);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ code: 1000, desc: "echo" }));
  });
});

server.listen(7001, () => {
  console.log('Echo server listening on port 7001');
  
  // Send request using fetch just like amrClient.ts
  const payload = {
    modelProcessCode: "cong_test_trigger",
    priority: 6,
    fromSystem: "Thadosoft",
    orderId: "A_123",
    taskOrderDetail: [{ taskPath: "10000004,10000006,10000011,10000011" }]
  };

  fetch('http://127.0.0.1:7001/ics/taskOrder/addTask', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'accept-language': 'en-US'
    },
    body: JSON.stringify(payload)
  }).then(r => r.text()).then(t => {
    console.log('RESPONSE:', t);
    process.exit(0);
  });
});
