const http = require('http');

async function test() {
  const url = 'http://192.168.1.100:7000/ics/taskOrder/addTask';
  const payload = {
    modelProcessCode: "cong_test_trigger",
    priority: 6,
    fromSystem: "Thadosoft",
    orderId: "A_20260915_105159_99",
    taskOrderDetail: [
      {
        taskPath: "10000004,10000006,10000011,10000011"
      }
    ]
  };

  console.log('Sending exact Postman payload via fetch...');
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    });
    console.log(res.status, await res.text());
  } catch (err) {
    console.error(err);
  }
}

test();
